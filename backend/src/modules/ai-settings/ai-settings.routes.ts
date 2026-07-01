import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { PromptKey } from '@prisma/client'
import {
  PlanInfoSchema,
  AiCaseSchema,
  ToggleCaseSchema,
  AiPromptInfoSchema,
  UpdatePromptSchema,
  UpdateLimitsSchema,
  UsageLogSchema,
} from './ai-settings.schemas'
import {
  getPlanInfo,
  listAiCases,
  toggleAiCase,
  listPrompts,
  updatePrompt,
  resetPrompt,
  updateLimits,
} from './ai-settings.service'
import { getUsageLog } from '../ai/ai.service'
import { requireAdmin } from '../../plugins/authenticate'

const promptKeyParam = z.object({ key: z.nativeEnum(PromptKey) })
const msgOk = z.object({ message: z.string() })

export const aiSettingsRoutes: FastifyPluginAsyncZod = async (app) => {
  // GET /api/ai/plan
  app.get('/plan', { preHandler: requireAdmin, schema: { response: { 200: PlanInfoSchema } } }, async (req, reply) => {
    try {
      return reply.send(await getPlanInfo(app.prisma, req.currentUser.orgId))
    } catch (err: any) {
      return reply.status(err.statusCode ?? 500).send({ error: err.message })
    }
  })

  // GET /api/ai/cases
  app.get('/cases', { preHandler: requireAdmin, schema: { response: { 200: z.array(AiCaseSchema) } } }, async (req, reply) => {
    return reply.send(await listAiCases(app.prisma, req.currentUser.orgId))
  })

  // PUT /api/ai/cases/:key
  app.put('/cases/:key', {
    preHandler: requireAdmin,
    schema: { params: promptKeyParam, body: ToggleCaseSchema, response: { 200: msgOk } },
  }, async (req, reply) => {
    try {
      await toggleAiCase(app.prisma, req.currentUser.orgId, req.params.key, req.body.isEnabled)
      return reply.send({ message: 'Настройки AI обновлены' })
    } catch (err: any) {
      return reply.status(err.statusCode ?? 500).send({ error: err.message })
    }
  })

  // GET /api/ai/prompts
  app.get('/prompts', { preHandler: requireAdmin, schema: { response: { 200: z.array(AiPromptInfoSchema) } } }, async (req, reply) => {
    return reply.send(await listPrompts(app.prisma, req.currentUser.orgId))
  })

  // PUT /api/ai/prompts/:key
  app.put('/prompts/:key', {
    preHandler: requireAdmin,
    schema: { params: promptKeyParam, body: UpdatePromptSchema, response: { 200: msgOk } },
  }, async (req, reply) => {
    try {
      await updatePrompt(app.prisma, req.currentUser.orgId, req.params.key, req.body.promptText)
      return reply.send({ message: 'Промт сохранён' })
    } catch (err: any) {
      return reply.status(err.statusCode ?? 500).send({ error: err.message })
    }
  })

  // DELETE /api/ai/prompts/:key
  app.delete('/prompts/:key', {
    preHandler: requireAdmin,
    schema: { params: promptKeyParam, response: { 200: msgOk } },
  }, async (req, reply) => {
    try {
      await resetPrompt(app.prisma, req.currentUser.orgId, req.params.key)
      return reply.send({ message: 'Промт сброшен к стандартному' })
    } catch (err: any) {
      return reply.status(err.statusCode ?? 500).send({ error: err.message })
    }
  })

  // PUT /api/ai/cases/:key/limits
  app.put('/cases/:key/limits', {
    preHandler: requireAdmin,
    schema: { params: promptKeyParam, body: UpdateLimitsSchema, response: { 200: msgOk } },
  }, async (req, reply) => {
    try {
      await updateLimits(
        app.prisma,
        req.currentUser.orgId,
        req.params.key,
        req.body.dailyCallLimit,
        req.body.monthlyTokenLimit,
      )
      return reply.send({ message: 'Лимиты обновлены' })
    } catch (err: any) {
      return reply.status(err.statusCode ?? 500).send({ error: err.message })
    }
  })

  // GET /api/ai/usage-log?days=30
  app.get('/usage-log', {
    preHandler: requireAdmin,
    schema: {
      querystring: z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }),
      response: { 200: UsageLogSchema },
    },
  }, async (req, reply) => {
    const log = await getUsageLog(app.prisma, req.currentUser.orgId, req.query.days)
    return reply.send(log)
  })
}
