import type { FastifyPluginAsync } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/authenticate'
import {
  UpsertRoleEffortSchema,
  UpsertTimeEntrySchema,
  ResourceLoadQuerySchema,
  TimeLogQuerySchema,
} from './effort.schemas'
import {
  getTaskEffort,
  upsertRoleEffort,
  deleteRoleEffort,
  upsertTimeEntry,
  getTimeEntries,
  deleteTimeEntry,
  getResourceLoad,
} from './effort.service'

export const effortRoutes: FastifyPluginAsync = async (app) => {
  const prisma = app.prisma

  // ── Role effort plan ────────────────────────────────────────────────────────

  // GET /api/effort/task/:taskId — role efforts + periods for a task
  app.get('/task/:taskId', {
    preHandler: [authenticate, requirePermission('schedule_view')],
  }, async (req) => {
    const { taskId } = req.params as { taskId: string }
    return getTaskEffort(prisma, taskId, req.currentUser.orgId)
  })

  // PUT /api/effort/task/:taskId/role — create/update a role effort entry
  app.put('/task/:taskId/role', {
    preHandler: [authenticate, requirePermission('schedule_edit')],
  }, async (req, reply) => {
    const { taskId } = req.params as { taskId: string }
    const data = UpsertRoleEffortSchema.parse(req.body)
    const result = await upsertRoleEffort(prisma, taskId, req.currentUser.orgId, data)
    return reply.status(200).send(result)
  })

  // DELETE /api/effort/role/:id
  app.delete('/role/:id', {
    preHandler: [authenticate, requirePermission('schedule_edit')],
  }, async (req, reply) => {
    const { id } = req.params as { id: string }
    await deleteRoleEffort(prisma, id, req.currentUser.orgId)
    return reply.status(204).send()
  })

  // ── Time entries (tabель) ───────────────────────────────────────────────────

  // GET /api/effort/time-entries?taskId=&userId=&from=&to=
  app.get('/time-entries', {
    preHandler: [authenticate],
  }, async (req) => {
    const q = TimeLogQuerySchema.parse(req.query)
    return getTimeEntries(prisma, req.currentUser.orgId, q)
  })

  // PUT /api/effort/time-entries — upsert (zero hours = delete)
  app.put('/time-entries', {
    preHandler: [authenticate],
  }, async (req) => {
    const data = UpsertTimeEntrySchema.parse(req.body)
    return upsertTimeEntry(prisma, req.currentUser.sub, req.currentUser.orgId, data)
  })

  // DELETE /api/effort/time-entries/:id
  app.delete('/time-entries/:id', {
    preHandler: [authenticate],
  }, async (req, reply) => {
    const { id } = req.params as { id: string }
    await deleteTimeEntry(prisma, id, req.currentUser.sub, req.currentUser.orgId)
    return reply.status(204).send()
  })

  // ── Resource load ───────────────────────────────────────────────────────────

  // GET /api/effort/resource-load?projectId=&from=&to=
  app.get('/resource-load', {
    preHandler: [authenticate, requirePermission('team_view')],
  }, async (req) => {
    const q = ResourceLoadQuerySchema.parse(req.query)
    return getResourceLoad(prisma, req.currentUser.orgId, q.projectId, q.from, q.to)
  })
}
