import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { requireAdmin } from '../../plugins/authenticate'
import {
  StorageSettingsSchema,
  UpdateStorageSettingsSchema,
  VerifyPluginResponseSchema,
} from './storage-settings.schemas'
import {
  getStorageSettings,
  updateStorageSettings,
  verifyPlugin,
} from './storage-settings.service'

export const storageSettingsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/',
    { preHandler: requireAdmin, schema: { response: { 200: StorageSettingsSchema } } },
    async (req, reply) => {
      const settings = await getStorageSettings(app.prisma, req.currentUser.orgId)
      return reply.send(settings)
    },
  )

  app.put(
    '/',
    {
      preHandler: requireAdmin,
      schema: { body: UpdateStorageSettingsSchema, response: { 200: StorageSettingsSchema } },
    },
    async (req, reply) => {
      try {
        const settings = await updateStorageSettings(app.prisma, req.currentUser.orgId, req.body as any)
        return reply.send(settings)
      } catch (err: any) {
        return reply.status(err.statusCode ?? 500).send({ error: err.message })
      }
    },
  )

  app.post(
    '/verify',
    {
      preHandler: requireAdmin,
      schema: {
        body: z.object({ apiKey: z.string().min(1) }),
        response: { 200: VerifyPluginResponseSchema },
      },
    },
    async (req, reply) => {
      try {
        const result = await verifyPlugin(app.prisma, req.currentUser.orgId, req.body.apiKey)
        return reply.send(result)
      } catch (err: any) {
        return reply.send({ ok: false, error: err.message })
      }
    },
  )
}
