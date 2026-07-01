import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { NotificationsListSchema } from './notifications.schemas'
import { listNotifications, markRead, markAllRead } from './notifications.service'
import { authenticate } from '../../plugins/authenticate'

const idParam = z.object({ id: z.string().uuid() })
const msgOk = z.object({ message: z.string() })

export const notificationsRoutes: FastifyPluginAsyncZod = async (app) => {
  // GET /api/notifications
  app.get(
    '/',
    { preHandler: authenticate, schema: { response: { 200: NotificationsListSchema } } },
    async (req, reply) => {
      const result = await listNotifications(app.prisma, req.currentUser.sub)
      return reply.send(result)
    },
  )

  // PATCH /api/notifications/:id/read
  app.patch(
    '/:id/read',
    { preHandler: authenticate, schema: { params: idParam, response: { 200: msgOk } } },
    async (req, reply) => {
      try {
        await markRead(app.prisma, req.currentUser.sub, req.params.id)
        return reply.send({ message: 'Прочитано' })
      } catch (err: any) {
        return reply.status(err.statusCode ?? 500).send({ error: err.message })
      }
    },
  )

  // POST /api/notifications/read-all
  app.post(
    '/read-all',
    { preHandler: authenticate, schema: { response: { 200: msgOk } } },
    async (req, reply) => {
      await markAllRead(app.prisma, req.currentUser.sub)
      return reply.send({ message: 'Все уведомления прочитаны' })
    },
  )
}
