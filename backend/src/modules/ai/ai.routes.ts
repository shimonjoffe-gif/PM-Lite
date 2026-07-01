import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { authenticate } from '../../plugins/authenticate'
import { generateProjectStatus, summarizeTask, suggestTaskFields } from './ai.service'

const textResult = z.object({ text: z.string() })
const suggestResult = z.object({
  description: z.string(),
  dueDate: z.string().nullable(),
  priority: z.string(),
  subtasks: z.array(z.string()),
})

export const aiRoutes: FastifyPluginAsyncZod = async (app) => {
  // POST /api/ai/generate/project-status/:projectId
  app.post('/generate/project-status/:projectId', {
    preHandler: authenticate,
    schema: {
      params: z.object({ projectId: z.string().uuid() }),
      response: { 200: textResult },
    },
  }, async (req, reply) => {
    try {
      const text = await generateProjectStatus(
        app.prisma, req.params.projectId, req.currentUser.orgId, req.currentUser.sub,
      )
      return reply.send({ text })
    } catch (err: any) {
      return reply.status(err.statusCode ?? 500).send({ error: err.message })
    }
  })

  // POST /api/ai/generate/task-summary/:taskId
  app.post('/generate/task-summary/:taskId', {
    preHandler: authenticate,
    schema: {
      params: z.object({ taskId: z.string().uuid() }),
      response: { 200: textResult },
    },
  }, async (req, reply) => {
    try {
      const text = await summarizeTask(
        app.prisma, req.params.taskId, req.currentUser.orgId, req.currentUser.sub,
      )
      return reply.send({ text })
    } catch (err: any) {
      return reply.status(err.statusCode ?? 500).send({ error: err.message })
    }
  })

  // POST /api/ai/generate/task-suggest
  app.post('/generate/task-suggest', {
    preHandler: authenticate,
    schema: {
      body: z.object({ name: z.string().min(1), projectId: z.string().uuid() }),
      response: { 200: suggestResult },
    },
  }, async (req, reply) => {
    try {
      const result = await suggestTaskFields(
        app.prisma, req.body.name, req.body.projectId, req.currentUser.orgId, req.currentUser.sub,
      )
      return reply.send(result)
    } catch (err: any) {
      return reply.status(err.statusCode ?? 500).send({ error: err.message })
    }
  })
}
