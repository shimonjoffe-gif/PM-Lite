import { PrismaClient } from '@prisma/client'
import { FastifyInstance } from 'fastify'
import crypto from 'crypto'
import { hashPassword, verifyPassword } from '../../utils/password'
import { uniqueSlug } from '../../utils/slug'
import { sendVerificationEmail, sendJoinRequestEmail, sendPasswordResetEmail } from '../../utils/email'
import { DEFAULT_ROLE_PERMISSIONS } from '../../utils/permissions'
import { env } from '../../config/env'

function makeVerificationToken(userId: string): string {
  const payload = Buffer.from(JSON.stringify({ sub: userId, exp: Date.now() + 86_400_000 }))
  const sig = crypto.createHmac('sha256', env.JWT_SECRET).update(payload).digest('hex')
  return `${payload.toString('base64url')}.${sig}`
}

function decodeVerificationToken(token: string): string | null {
  const [payloadB64, sig] = token.split('.')
  if (!payloadB64 || !sig) return null
  const expectedSig = crypto
    .createHmac('sha256', env.JWT_SECRET)
    .update(Buffer.from(payloadB64, 'base64url'))
    .digest('hex')
  if (sig !== expectedSig) return null
  const { sub, exp } = JSON.parse(Buffer.from(payloadB64, 'base64url').toString())
  if (Date.now() > exp) return null
  return sub as string
}

export async function seedDefaultRoles(prisma: PrismaClient, orgId: string) {
  for (const [name, permissions] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
    const role = await prisma.orgRole.create({
      data: {
        organizationId: orgId,
        name,
        isSystem: true,
        permissions: {
          create: permissions.map(p => ({ permission: p })),
        },
      },
    })
  }
}

export async function registerOrganization(
  prisma: PrismaClient,
  app: FastifyInstance,
  data: { orgName: string; email: string; password: string; fullName: string },
) {
  const existing = await prisma.user.findUnique({ where: { email: data.email } })
  if (existing) throw { statusCode: 409, message: 'Email уже зарегистрирован' }

  const slug = await uniqueSlug(prisma, data.orgName)
  const passwordHash = await hashPassword(data.password)

  const org = await prisma.organization.create({
    data: { name: data.orgName, slug },
  })

  // Создаём дефолтные роли и статусы проектов для новой организации
  await seedDefaultRoles(prisma, org.id)
  await prisma.projectStatus.create({
    data: { organizationId: org.id, name: 'Новый', color: '#6366F1', sortOrder: 0 },
  })

  const user = await prisma.user.create({
    data: {
      organizationId: org.id,
      email: data.email,
      passwordHash,
      fullName: data.fullName,
      isAdmin: true,
    },
  })

  const verifyToken = makeVerificationToken(user.id)
  await sendVerificationEmail(data.email, verifyToken).catch(console.error)

  const token = app.jwt.sign(
    { sub: user.id, orgId: org.id, isAdmin: true, roleId: null },
    { expiresIn: '7d' },
  )

  return { token, user }
}

export async function verifyEmail(prisma: PrismaClient, token: string) {
  const userId = decodeVerificationToken(token)
  if (!userId) throw { statusCode: 400, message: 'Ссылка недействительна или истекла' }

  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw { statusCode: 404, message: 'Пользователь не найден' }
  if (user.emailVerifiedAt) return { message: 'E-mail уже подтверждён' }

  await prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } })
  return { message: 'E-mail успешно подтверждён' }
}

export async function resendVerification(prisma: PrismaClient, email: string) {
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user || user.emailVerifiedAt) return
  const verifyToken = makeVerificationToken(user.id)
  await sendVerificationEmail(email, verifyToken).catch(console.error)
}

export async function login(
  prisma: PrismaClient,
  app: FastifyInstance,
  data: { email: string; password: string },
) {
  const user = await prisma.user.findUnique({ where: { email: data.email }, include: { orgRole: { select: { name: true } } } })
  if (!user) throw { statusCode: 401, message: 'Неверный e-mail или пароль' }
  if (!user.isActive) throw { statusCode: 403, message: 'Аккаунт не активирован' }

  const valid = await verifyPassword(data.password, user.passwordHash)
  if (!valid) throw { statusCode: 401, message: 'Неверный e-mail или пароль' }

  const token = app.jwt.sign(
    { sub: user.id, orgId: user.organizationId, isAdmin: user.isAdmin, roleId: user.orgRoleId },
    { expiresIn: '7d' },
  )

  return { token, user: formatUser(user) }
}

export async function joinOrganization(
  prisma: PrismaClient,
  data: { orgSlug: string; email: string; password: string; fullName: string },
) {
  const org = await prisma.organization.findUnique({ where: { slug: data.orgSlug } })
  if (!org) throw { statusCode: 404, message: 'Организация с таким кодом не найдена' }

  const existing = await prisma.user.findUnique({ where: { email: data.email } })
  if (existing) throw { statusCode: 409, message: 'Email уже зарегистрирован' }

  const passwordHash = await hashPassword(data.password)

  // По умолчанию назначаем роль «Исполнитель»
  const defaultRole = await prisma.orgRole.findFirst({
    where: { organizationId: org.id, name: 'Исполнитель' },
  })

  await prisma.user.create({
    data: {
      organizationId: org.id,
      email: data.email,
      passwordHash,
      fullName: data.fullName,
      isAdmin: false,
      orgRoleId: defaultRole?.id ?? null,
      isActive: false,
    },
  })

  const admin = await prisma.user.findFirst({
    where: { organizationId: org.id, isAdmin: true, isActive: true },
  })
  if (admin) {
    await sendJoinRequestEmail(admin.email, data.fullName, data.email, org.name).catch(console.error)
  }

  return { message: 'Запрос отправлен. Ожидайте подтверждения администратора.' }
}

export async function forgotPassword(prisma: PrismaClient, email: string) {
  const user = await prisma.user.findUnique({ where: { email } })
  // Always return success to prevent user enumeration
  if (!user || !user.isActive) return

  // Invalidate previous tokens for this user
  await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } })

  const record = await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      expiresAt: new Date(Date.now() + 3_600_000),
    },
  })

  await sendPasswordResetEmail(email, record.token).catch(console.error)
}

export async function resetPassword(
  prisma: PrismaClient,
  app: FastifyInstance,
  data: { token: string; password: string },
) {
  const record = await prisma.passwordResetToken.findUnique({ where: { token: data.token } })
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw { statusCode: 400, message: 'Ссылка недействительна или истекла' }
  }

  const passwordHash = await hashPassword(data.password)

  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
  ])

  const user = await prisma.user.findUniqueOrThrow({ where: { id: record.userId }, include: { orgRole: { select: { name: true } } } })

  const jwtToken = app.jwt.sign(
    { sub: user.id, orgId: user.organizationId, isAdmin: user.isAdmin, roleId: user.orgRoleId },
    { expiresIn: '7d' },
  )

  return { token: jwtToken, user: formatUser(user) }
}

export function formatUser(user: {
  id: string
  email: string
  fullName: string
  isAdmin: boolean
  orgRoleId: string | null
  organizationId: string
  emailVerifiedAt: Date | null
  isActive: boolean
  orgRole?: { name: string } | null
}) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    isAdmin: user.isAdmin,
    orgRoleId: user.orgRoleId,
    roleName: user.orgRole?.name ?? null,
    organizationId: user.organizationId,
    emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
    isActive: user.isActive,
  }
}
