import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import {
  StatsQuerySchema,
  StatsResponseSchema,
  CreateFeedbackSchema,
  FeedbackResponseSchema,
} from './analytics.schemas'
import { getStats, createFeedback } from './analytics.service'
import { authenticate, requireAdmin } from '../../plugins/authenticate'
import { sendFeedbackNotification } from '../../utils/email'

export const analyticsRoutes: FastifyPluginAsyncZod = async (app) => {
  // GET /api/analytics/stats — только Администратор
  app.get(
    '/stats',
    {
      preHandler: requireAdmin,
      schema: { querystring: StatsQuerySchema, response: { 200: StatsResponseSchema } },
    },
    async (req, reply) => {
      const now = new Date()
      const from = req.query.from
        ? new Date(req.query.from)
        : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      const to = req.query.to ? new Date(req.query.to) : now
      const stats = await getStats(app.prisma, req.currentUser.orgId, from, to)
      return reply.send(stats)
    },
  )

  // POST /api/analytics/feedback — все авторизованные
  app.post(
    '/feedback',
    {
      preHandler: authenticate,
      schema: { body: CreateFeedbackSchema, response: { 201: FeedbackResponseSchema } },
    },
    async (req, reply) => {
      try {
        const fb = await createFeedback(
          app.prisma,
          req.currentUser.orgId,
          req.currentUser.sub,
          req.body,
        )
        app.log.info(
          { feedbackId: fb.id, type: fb.type, screen: fb.screenContext },
          'New feedback received',
        )
        // Уведомление в dev-почту (MailHog)
        const senderUser = await app.prisma.user.findUnique({ where: { id: req.currentUser.sub }, select: { email: true } })
        sendFeedbackNotification(fb.type, fb.text, fb.screenContext ?? '', senderUser?.email ?? '').catch(
          err => app.log.warn({ err }, 'Failed to send feedback notification email'),
        )
        return reply.status(201).send({ id: fb.id, message: 'Спасибо за обратную связь!' })
      } catch (err: any) {
        return reply.status(err.statusCode ?? 500).send({ error: err.message })
      }
    },
  )
}
