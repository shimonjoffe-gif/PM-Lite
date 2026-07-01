import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { authenticate } from '../../plugins/authenticate'
import { createCloudReadStream, downloadFromPlugin } from '../../utils/storage'
import { getStorageConfig } from '../storage-settings/storage-settings.service'
import {
  DocumentSchema,
  DocumentListResponseSchema,
  DocumentVersionSchema,
  ListDocumentsQuerySchema,
  CreateDocumentBodySchema,
  AddVersionBodySchema,
} from './documents.schemas'
import {
  listDocuments,
  createDocument,
  getDocument,
  deleteDocument,
  addVersion,
  listVersions,
  getVersionForDownload,
} from './documents.service'

const idParam = z.object({ id: z.string().uuid() })
const versionParam = z.object({ id: z.string().uuid(), versionId: z.string().uuid() })
const msgOk = z.object({ message: z.string() })

// Helper: parse multipart with one file field
async function parseMultipart(req: any) {
  const parts = req.parts()
  let fileBuffer: Buffer | null = null
  let fileName = 'file'
  let mimeType = 'application/octet-stream'
  const fields: Record<string, string> = {}

  for await (const part of parts) {
    if (part.type === 'file') {
      fileBuffer = await part.toBuffer()
      fileName = part.filename || 'file'
      mimeType = part.mimetype || 'application/octet-stream'
    } else {
      fields[part.fieldname] = part.value as string
    }
  }

  return { fileBuffer, fileName, mimeType, fields }
}

export const documentsRoutes: FastifyPluginAsyncZod = async (app) => {
  // ─── Library (cross-project) ────────────────────────────────────────────────

  app.get(
    '/api/documents',
    {
      preHandler: authenticate,
      schema: { querystring: ListDocumentsQuerySchema, response: { 200: DocumentListResponseSchema } },
    },
    async (req, reply) => {
      const result = await listDocuments(
        app.prisma,
        req.currentUser.orgId,
        req.currentUser.isAdmin,
        req.currentUser.roleId,
        req.query,
      )
      return reply.send(result)
    },
  )

  // ─── Documents by project ───────────────────────────────────────────────────

  app.get(
    '/api/projects/:id/documents',
    {
      preHandler: authenticate,
      schema: { params: idParam, querystring: ListDocumentsQuerySchema.omit({ projectId: true }), response: { 200: DocumentListResponseSchema } },
    },
    async (req, reply) => {
      const result = await listDocuments(
        app.prisma,
        req.currentUser.orgId,
        req.currentUser.isAdmin,
        req.currentUser.roleId,
        { ...req.query, projectId: req.params.id },
      )
      return reply.send(result)
    },
  )

  // ─── Documents by task ──────────────────────────────────────────────────────

  app.get(
    '/api/tasks/:id/documents',
    {
      preHandler: authenticate,
      schema: { params: idParam, response: { 200: DocumentListResponseSchema } },
    },
    async (req, reply) => {
      const result = await listDocuments(
        app.prisma,
        req.currentUser.orgId,
        req.currentUser.isAdmin,
        req.currentUser.roleId,
        { taskId: req.params.id, pageSize: 100 },
      )
      return reply.send(result)
    },
  )

  // ─── Create document (multipart) ────────────────────────────────────────────

  app.post(
    '/api/documents',
    { preHandler: authenticate },
    async (req, reply) => {
      try {
        const { fileBuffer, fileName, mimeType, fields } = await parseMultipart(req)
        if (!fileBuffer) return reply.status(400).send({ error: 'Файл обязателен' })

        const bodyResult = CreateDocumentBodySchema.safeParse({
          title: fields.title,
          description: fields.description,
          documentTypeId: fields.documentTypeId,
          parentType: fields.parentType,
          parentId: fields.parentId,
          comment: fields.comment,
        })
        if (!bodyResult.success) {
          return reply.status(400).send({ error: bodyResult.error.issues[0]?.message ?? 'Validation error' })
        }

        const doc = await createDocument(
          app.prisma,
          req.currentUser.orgId,
          req.currentUser.sub,
          req.currentUser.isAdmin,
          req.currentUser.roleId,
          fileBuffer,
          fileName,
          mimeType,
          bodyResult.data,
        )
        return reply.status(201).send(doc)
      } catch (err: any) {
        return reply.status(err.statusCode ?? 500).send({ error: err.message })
      }
    },
  )

  // ─── Get document ───────────────────────────────────────────────────────────

  app.get(
    '/api/documents/:id',
    {
      preHandler: authenticate,
      schema: { params: idParam, response: { 200: DocumentSchema } },
    },
    async (req, reply) => {
      try {
        const doc = await getDocument(
          app.prisma,
          req.currentUser.orgId,
          req.params.id,
          req.currentUser.isAdmin,
          req.currentUser.roleId,
        )
        return reply.send(doc)
      } catch (err: any) {
        return reply.status(err.statusCode ?? 500).send({ error: err.message })
      }
    },
  )

  // ─── Delete document ────────────────────────────────────────────────────────

  app.delete(
    '/api/documents/:id',
    { preHandler: authenticate, schema: { params: idParam, response: { 200: msgOk } } },
    async (req, reply) => {
      try {
        await deleteDocument(
          app.prisma,
          req.currentUser.orgId,
          req.params.id,
          req.currentUser.sub,
          req.currentUser.isAdmin,
        )
        return reply.send({ message: 'Документ удалён' })
      } catch (err: any) {
        return reply.status(err.statusCode ?? 500).send({ error: err.message })
      }
    },
  )

  // ─── Versions ───────────────────────────────────────────────────────────────

  app.get(
    '/api/documents/:id/versions',
    {
      preHandler: authenticate,
      schema: { params: idParam, response: { 200: z.array(DocumentVersionSchema) } },
    },
    async (req, reply) => {
      try {
        const versions = await listVersions(
          app.prisma,
          req.currentUser.orgId,
          req.params.id,
          req.currentUser.isAdmin,
          req.currentUser.roleId,
        )
        return reply.send(versions)
      } catch (err: any) {
        return reply.status(err.statusCode ?? 500).send({ error: err.message })
      }
    },
  )

  app.post(
    '/api/documents/:id/versions',
    { preHandler: authenticate, schema: { params: idParam } },
    async (req, reply) => {
      try {
        const { fileBuffer, fileName, mimeType, fields } = await parseMultipart(req)
        if (!fileBuffer) return reply.status(400).send({ error: 'Файл обязателен' })

        const version = await addVersion(
          app.prisma,
          req.currentUser.orgId,
          req.params.id,
          req.currentUser.sub,
          req.currentUser.isAdmin,
          req.currentUser.roleId,
          fileBuffer,
          fileName,
          mimeType,
          fields.comment,
        )
        return reply.status(201).send(version)
      } catch (err: any) {
        return reply.status(err.statusCode ?? 500).send({ error: err.message })
      }
    },
  )

  // ─── Download ────────────────────────────────────────────────────────────────

  app.get(
    '/api/documents/:id/versions/:versionId/download',
    { preHandler: authenticate, schema: { params: versionParam } },
    async (req, reply) => {
      try {
        const version = await getVersionForDownload(
          app.prisma,
          req.currentUser.orgId,
          req.params.id,
          req.params.versionId,
          req.currentUser.isAdmin,
          req.currentUser.roleId,
        )

        reply.header(
          'Content-Disposition',
          `attachment; filename="${encodeURIComponent(version.fileName)}"`,
        )
        reply.header('Content-Type', version.mimeType || 'application/octet-stream')

        if (version.storagePath) {
          // Cloud: stream from disk
          const stream = createCloudReadStream(version.storagePath)
          return reply.send(stream)
        }

        if (version.externalId) {
          // External plugin: fetch and proxy
          const storageConfig = await getStorageConfig(app.prisma, req.currentUser.orgId)
          if (!storageConfig.pluginUrl || !storageConfig.pluginApiKeyHash) {
            return reply.status(503).send({ error: 'Плагин не настроен' })
          }
          const { buffer, mimeType, fileName } = await downloadFromPlugin(
            storageConfig.pluginUrl,
            storageConfig.pluginApiKeyHash,
            version.externalId,
          )
          reply.header('Content-Type', mimeType)
          reply.header('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`)
          return reply.send(buffer)
        }

        return reply.status(404).send({ error: 'Файл не найден' })
      } catch (err: any) {
        return reply.status(err.statusCode ?? 500).send({ error: err.message })
      }
    },
  )
}
