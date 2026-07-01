import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import {
  OrgInfoSchema,
  UpdateLogoSchema,
  ProjectStatusSchema,
  CreateProjectStatusSchema,
  UpdateProjectStatusSchema,
  ReorderStatusesSchema,
  ClientSchema,
  CreateClientSchema,
  UpdateClientSchema,
} from './org.schemas'
import {
  getOrgInfo,
  updateLogo,
  listStatuses,
  createStatus,
  updateStatus,
  deleteStatus,
  reorderStatuses,
  listClients,
  createClient,
  updateClient,
  deleteClient,
} from './org.service'
import { authenticate, requireAdmin } from '../../plugins/authenticate'

const idParam = z.object({ id: z.string().uuid() })
const msgOk = z.object({ message: z.string() })

function fmtOrg(org: { id: string; name: string; slug: string; logoUrl: string | null; planType: string }) {
  return { id: org.id, name: org.name, slug: org.slug, logoUrl: org.logoUrl, planType: org.planType }
}

function fmtStatus(s: { id: string; name: string; color: string; sortOrder: number }) {
  return { id: s.id, name: s.name, color: s.color, sortOrder: s.sortOrder }
}

function fmtClient(c: { id: string; name: string; contactInfo: string | null; notes: string | null; createdAt: Date }) {
  return { id: c.id, name: c.name, contactInfo: c.contactInfo, notes: c.notes, createdAt: c.createdAt.toISOString() }
}

export const orgRoutes: FastifyPluginAsyncZod = async (app) => {
  // GET /api/org
  app.get('/', { preHandler: authenticate, schema: { response: { 200: OrgInfoSchema } } }, async (req, reply) => {
    const org = await getOrgInfo(app.prisma, req.currentUser.orgId)
    return reply.send(fmtOrg(org))
  })

  // PUT /api/org/logo
  app.put('/logo', { preHandler: requireAdmin, schema: { body: UpdateLogoSchema, response: { 200: OrgInfoSchema } } }, async (req, reply) => {
    try {
      const org = await updateLogo(app.prisma, req.currentUser.orgId, req.body.logoDataUrl)
      return reply.send(fmtOrg(org))
    } catch (err: any) {
      return reply.status(err.statusCode ?? 500).send({ error: err.message })
    }
  })

  // DELETE /api/org/logo
  app.delete('/logo', { preHandler: requireAdmin, schema: { response: { 200: msgOk } } }, async (req, reply) => {
    await updateLogo(app.prisma, req.currentUser.orgId, null)
    return reply.send({ message: 'Логотип удалён' })
  })

  // ─── Project Statuses ───────────────────────────────────────────────────────

  // GET /api/org/project-statuses
  app.get('/project-statuses', { preHandler: authenticate, schema: { response: { 200: z.array(ProjectStatusSchema) } } }, async (req, reply) => {
    const list = await listStatuses(app.prisma, req.currentUser.orgId)
    return reply.send(list.map(fmtStatus))
  })

  // PUT /api/org/project-statuses/reorder — must be before /:id
  app.put('/project-statuses/reorder', { preHandler: requireAdmin, schema: { body: ReorderStatusesSchema, response: { 200: msgOk } } }, async (req, reply) => {
    try {
      await reorderStatuses(app.prisma, req.currentUser.orgId, req.body.ids)
      return reply.send({ message: 'Порядок обновлён' })
    } catch (err: any) {
      return reply.status(err.statusCode ?? 500).send({ error: err.message })
    }
  })

  // POST /api/org/project-statuses
  app.post('/project-statuses', { preHandler: requireAdmin, schema: { body: CreateProjectStatusSchema, response: { 201: ProjectStatusSchema } } }, async (req, reply) => {
    try {
      const s = await createStatus(app.prisma, req.currentUser.orgId, req.body)
      return reply.status(201).send(fmtStatus(s))
    } catch (err: any) {
      return reply.status(err.statusCode ?? 500).send({ error: err.message })
    }
  })

  // PATCH /api/org/project-statuses/:id
  app.patch('/project-statuses/:id', { preHandler: requireAdmin, schema: { params: idParam, body: UpdateProjectStatusSchema, response: { 200: ProjectStatusSchema } } }, async (req, reply) => {
    try {
      const s = await updateStatus(app.prisma, req.currentUser.orgId, req.params.id, req.body)
      return reply.send(fmtStatus(s))
    } catch (err: any) {
      return reply.status(err.statusCode ?? 500).send({ error: err.message })
    }
  })

  // DELETE /api/org/project-statuses/:id
  app.delete('/project-statuses/:id', { preHandler: requireAdmin, schema: { params: idParam, response: { 200: msgOk } } }, async (req, reply) => {
    try {
      await deleteStatus(app.prisma, req.currentUser.orgId, req.params.id)
      return reply.send({ message: 'Статус удалён' })
    } catch (err: any) {
      return reply.status(err.statusCode ?? 500).send({ error: err.message })
    }
  })

  // ─── Clients ────────────────────────────────────────────────────────────────

  // GET /api/org/clients
  app.get('/clients', { preHandler: authenticate, schema: { response: { 200: z.array(ClientSchema) } } }, async (req, reply) => {
    const list = await listClients(app.prisma, req.currentUser.orgId)
    return reply.send(list.map(fmtClient))
  })

  // POST /api/org/clients
  app.post('/clients', { preHandler: requireAdmin, schema: { body: CreateClientSchema, response: { 201: ClientSchema } } }, async (req, reply) => {
    try {
      const c = await createClient(app.prisma, req.currentUser.orgId, req.body)
      return reply.status(201).send(fmtClient(c))
    } catch (err: any) {
      return reply.status(err.statusCode ?? 500).send({ error: err.message })
    }
  })

  // PATCH /api/org/clients/:id
  app.patch('/clients/:id', { preHandler: requireAdmin, schema: { params: idParam, body: UpdateClientSchema, response: { 200: ClientSchema } } }, async (req, reply) => {
    try {
      const c = await updateClient(app.prisma, req.currentUser.orgId, req.params.id, req.body)
      return reply.send(fmtClient(c))
    } catch (err: any) {
      return reply.status(err.statusCode ?? 500).send({ error: err.message })
    }
  })

  // DELETE /api/org/clients/:id
  app.delete('/clients/:id', { preHandler: requireAdmin, schema: { params: idParam, response: { 200: msgOk } } }, async (req, reply) => {
    try {
      await deleteClient(app.prisma, req.currentUser.orgId, req.params.id)
      return reply.send({ message: 'Клиент удалён' })
    } catch (err: any) {
      return reply.status(err.statusCode ?? 500).send({ error: err.message })
    }
  })
}
