import { PrismaClient } from '@prisma/client'
import { FastifyInstance } from 'fastify'
import crypto from 'crypto'
import { hashPassword } from '../../utils/password'
import { sendInvitationEmail } from '../../utils/email'
import { formatUser } from '../auth/auth.service'

export async function createInvitation(
  prisma: PrismaClient,
  adminId: string,
  orgId: string,
  data: { email: string; orgRoleId: string },
) {
  const [admin, org, role] = await Promise.all([
    prisma.user.findUnique({ where: { id: adminId } }),
    prisma.organization.findUnique({ where: { id: orgId } }),
    prisma.orgRole.findUnique({ where: { id: data.orgRoleId } }),
  ])

  if (!admin || !org) throw { statusCode: 404, message: 'Не найдено' }
  if (!role || role.organizationId !== orgId) {
    throw { statusCode: 400, message: 'Роль не принадлежит этой организации' }
  }

  const existing = await prisma.user.findUnique({ where: { email: data.email } })
  if (existing) throw { statusCode: 409, message: 'Пользователь с таким e-mail уже существует' }

  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

  const invitation = await prisma.invitation.create({
    data: {
      organizationId: orgId,
      invitedBy: adminId,
      email: data.email,
      orgRoleId: data.orgRoleId,
      token,
      expiresAt,
    },
  })

  await sendInvitationEmail(data.email, org.name, admin.fullName, token).catch(console.error)
  return invitation
}

export async function getInvitationByToken(prisma: PrismaClient, token: string) {
  const invitation = await prisma.invitation.findUnique({
    where: { token },
    include: {
      organization: { select: { name: true } },
      inviter: { select: { fullName: true } },
      orgRole: { select: { name: true } },
    },
  })

  if (!invitation) throw { statusCode: 404, message: 'Приглашение не найдено' }
  if (invitation.acceptedAt) throw { statusCode: 410, message: 'Приглашение уже принято' }
  if (invitation.expiresAt < new Date()) throw { statusCode: 410, message: 'Срок приглашения истёк' }

  return {
    id: invitation.id,
    email: invitation.email,
    roleName: invitation.orgRole?.name ?? null,
    orgName: invitation.organization.name,
    inviterName: invitation.inviter.fullName,
    expiresAt: invitation.expiresAt.toISOString(),
  }
}

export async function acceptInvitation(
  prisma: PrismaClient,
  app: FastifyInstance,
  token: string,
  data: { fullName: string; password: string },
) {
  const invitation = await prisma.invitation.findUnique({ where: { token } })
  if (!invitation) throw { statusCode: 404, message: 'Приглашение не найдено' }
  if (invitation.acceptedAt) throw { statusCode: 410, message: 'Приглашение уже принято' }
  if (invitation.expiresAt < new Date()) throw { statusCode: 410, message: 'Срок приглашения истёк' }

  const existing = await prisma.user.findUnique({ where: { email: invitation.email } })
  if (existing) throw { statusCode: 409, message: 'Пользователь с таким e-mail уже зарегистрирован' }

  const passwordHash = await hashPassword(data.password)

  const [user] = await prisma.$transaction([
    prisma.user.create({
      data: {
        organizationId: invitation.organizationId,
        email: invitation.email,
        passwordHash,
        fullName: data.fullName,
        isAdmin: false,
        orgRoleId: invitation.orgRoleId,
        isActive: true,
        emailVerifiedAt: new Date(),
      },
    }),
    prisma.invitation.update({ where: { token }, data: { acceptedAt: new Date() } }),
  ])

  const jwtToken = app.jwt.sign(
    { sub: user.id, orgId: user.organizationId, isAdmin: false, roleId: user.orgRoleId },
    { expiresIn: '7d' },
  )

  return { token: jwtToken, user: formatUser(user) }
}
