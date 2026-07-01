import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import {
  CreateInvitationSchema,
  AcceptInvitationSchema,
  InvitationInfoSchema,
} from './invitations.schemas'
import { createInvitation, getInvitationByToken, acceptInvitation } from './invitations.service'
import { requireAdmin } from '../../plugins/authenticate'
import { AuthResponseSchema } from '../auth/auth.schemas'
import { JwtPayload } from '../../plugins/authenticate'

export const invitationsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/',
    { preHandler: requireAdmin, schema: { body: CreateInvitationSchema, response: { 201: z.object({ id: z.string(), message: z.string() }) } } },
    async (request, reply) => {
      try {
        const { sub: adminId, orgId } = request.currentUser as JwtPayload
        const invitation = await createInvitation(app.prisma, adminId, orgId, request.body)
        return reply.status(201).send({ id: invitation.id, message: 'Приглашение отправлено' })
      } catch (err: any) {
        return reply.status(err.statusCode ?? 500).send({ error: err.message })
      }
    },
  )

  app.get(
    '/:token',
    { schema: { params: z.object({ token: z.string() }), response: { 200: InvitationInfoSchema } } },
    async (request, reply) => {
      try {
        return reply.send(await getInvitationByToken(app.prisma, request.params.token))
      } catch (err: any) {
        return reply.status(err.statusCode ?? 500).send({ error: err.message })
      }
    },
  )

  app.post(
    '/:token/accept',
    { schema: { params: z.object({ token: z.string() }), body: AcceptInvitationSchema, response: { 201: AuthResponseSchema } } },
    async (request, reply) => {
      try {
        return reply.status(201).send(await acceptInvitation(app.prisma, app, request.params.token, request.body))
      } catch (err: any) {
        return reply.status(err.statusCode ?? 500).send({ error: err.message })
      }
    },
  )
}
