import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { authenticate, requireAdmin } from '../../plugins/authenticate'
import {
  DocumentTypeListSchema,
  DocumentTypeSchema,
  CreateDocumentTypeSchema,
  UpdateDocumentTypeSchema,
} from './document-types.schemas'
import {
  listDocumentTypes,
  createDocumentType,
  updateDocumentType,
  archiveDocumentType,
} from './document-types.service'

const idParam = z.object({ id: z.string().uuid() })
const msgOk = z.object({ message: z.string() })

export const documentTypesRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/',
    { preHandler: authenticate, schema: { response: { 200: DocumentTypeListSchema } } },
    async (req, reply) => {
      const result = await listDocumentTypes(app.prisma, req.currentUser.orgId)
      return reply.send(result)
    },
  )

  app.post(
    '/',
    {
      preHandler: requireAdmin,
      schema: { body: CreateDocumentTypeSchema, response: { 201: DocumentTypeSchema } },
    },
    async (req, reply) => {
      try {
        const type = await createDocumentType(app.prisma, req.currentUser.orgId, req.body)
        return reply.status(201).send(type)
      } catch (err: any) {
        return reply.status(err.statusCode ?? 500).send({ error: err.message })
      }
    },
  )

  app.patch(
    '/:id',
    {
      preHandler: requireAdmin,
      schema: { params: idParam, body: UpdateDocumentTypeSchema, response: { 200: DocumentTypeSchema } },
    },
    async (req, reply) => {
      try {
        const type = await updateDocumentType(app.prisma, req.currentUser.orgId, req.params.id, req.body)
        return reply.send(type)
      } catch (err: any) {
        return reply.status(err.statusCode ?? 500).send({ error: err.message })
      }
    },
  )

  app.delete(
    '/:id',
    { preHandler: requireAdmin, schema: { params: idParam, response: { 200: msgOk } } },
    async (req, reply) => {
      try {
        await archiveDocumentType(app.prisma, req.currentUser.orgId, req.params.id)
        return reply.send({ message: 'Тип архивирован' })
      } catch (err: any) {
        return reply.status(err.statusCode ?? 500).send({ error: err.message })
      }
    },
  )
}
