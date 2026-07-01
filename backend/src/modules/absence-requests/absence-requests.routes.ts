import { FastifyInstance } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { authenticate } from '../../plugins/authenticate'
import {
  getOrgAbsenceTypes, createAbsenceType, updateAbsenceType, deleteAbsenceType, updateAbsenceTypeSteps,
  getDepartments, createDepartment, updateDepartment, deleteDepartment,
  createAbsenceRequest, getAbsenceRequests, decideAbsenceRequestStep, cancelAbsenceRequest,
  checkConflictingTasks, updateAbsenceRequest,
} from './absence-requests.service'

const ApprovalStepSchema = z.object({
  order: z.number().int().min(1),
  role: z.enum(['pm', 'line_manager', 'admin']),
  action: z.enum(['approve', 'notify']),
})

export async function absenceRequestsRoutes(app: FastifyInstance) {
  const a = app.withTypeProvider<ZodTypeProvider>()

  // ── Absence Types ──────────────────────────────────────────────────────────

  a.get('/api/org/absence-types', { preHandler: [authenticate] }, async (req) => {
    const user = req.user as any
    return getOrgAbsenceTypes(req.server.prisma, user.orgId)
  })

  a.post('/api/org/absence-types', {
    preHandler: [authenticate],
    schema: { body: z.object({ name: z.string().min(1).max(100), color: z.string().optional(), approvalSteps: z.array(ApprovalStepSchema).default([]) }) },
  }, async (req, reply) => {
    const user = req.user as any
    if (!user.isAdmin) return reply.status(403).send({ message: 'Только администратор' })
    return createAbsenceType(req.server.prisma, user.orgId, req.body)
  })

  a.patch('/api/org/absence-types/:id', {
    preHandler: [authenticate],
    schema: {
      params: z.object({ id: z.string().uuid() }),
      body: z.object({ name: z.string().min(1).max(100).optional(), color: z.string().optional() }),
    },
  }, async (req, reply) => {
    const user = req.user as any
    if (!user.isAdmin) return reply.status(403).send({ message: 'Только администратор' })
    try {
      return await updateAbsenceType(req.server.prisma, user.orgId, req.params.id, req.body)
    } catch (e: any) { return reply.status(400).send({ message: e.message }) }
  })

  a.put('/api/org/absence-types/:id/steps', {
    preHandler: [authenticate],
    schema: {
      params: z.object({ id: z.string().uuid() }),
      body: z.object({ steps: z.array(ApprovalStepSchema) }),
    },
  }, async (req, reply) => {
    const user = req.user as any
    if (!user.isAdmin) return reply.status(403).send({ message: 'Только администратор' })
    try {
      return await updateAbsenceTypeSteps(req.server.prisma, user.orgId, req.params.id, req.body.steps)
    } catch (e: any) { return reply.status(400).send({ message: e.message }) }
  })

  a.delete('/api/org/absence-types/:id', {
    preHandler: [authenticate],
    schema: { params: z.object({ id: z.string().uuid() }) },
  }, async (req, reply) => {
    const user = req.user as any
    if (!user.isAdmin) return reply.status(403).send({ message: 'Только администратор' })
    try {
      await deleteAbsenceType(req.server.prisma, user.orgId, req.params.id)
      return { ok: true }
    } catch (e: any) { return reply.status(400).send({ message: e.message }) }
  })

  // ── Departments ────────────────────────────────────────────────────────────

  a.get('/api/org/departments', { preHandler: [authenticate] }, async (req) => {
    const user = req.user as any
    return getDepartments(req.server.prisma, user.orgId)
  })

  a.post('/api/org/departments', {
    preHandler: [authenticate],
    schema: { body: z.object({ name: z.string().min(1).max(200), parentId: z.string().uuid().nullable().optional(), headUserId: z.string().uuid().nullable().optional() }) },
  }, async (req, reply) => {
    const user = req.user as any
    if (!user.isAdmin) return reply.status(403).send({ message: 'Только администратор' })
    return createDepartment(req.server.prisma, user.orgId, req.body)
  })

  a.patch('/api/org/departments/:id', {
    preHandler: [authenticate],
    schema: {
      params: z.object({ id: z.string().uuid() }),
      body: z.object({ name: z.string().min(1).max(200).optional(), parentId: z.string().uuid().nullable().optional(), headUserId: z.string().uuid().nullable().optional() }),
    },
  }, async (req, reply) => {
    const user = req.user as any
    if (!user.isAdmin) return reply.status(403).send({ message: 'Только администратор' })
    try {
      return await updateDepartment(req.server.prisma, user.orgId, req.params.id, req.body)
    } catch (e: any) { return reply.status(400).send({ message: e.message }) }
  })

  a.delete('/api/org/departments/:id', {
    preHandler: [authenticate],
    schema: { params: z.object({ id: z.string().uuid() }) },
  }, async (req, reply) => {
    const user = req.user as any
    if (!user.isAdmin) return reply.status(403).send({ message: 'Только администратор' })
    try {
      await deleteDepartment(req.server.prisma, user.orgId, req.params.id)
      return { ok: true }
    } catch (e: any) { return reply.status(400).send({ message: e.message }) }
  })

  // assign user to department
  a.patch('/api/users/:userId/department', {
    preHandler: [authenticate],
    schema: {
      params: z.object({ userId: z.string().uuid() }),
      body: z.object({ departmentId: z.string().uuid().nullable() }),
    },
  }, async (req, reply) => {
    const user = req.user as any
    if (!user.isAdmin) return reply.status(403).send({ message: 'Только администратор' })
    const { userId } = req.params
    await req.server.prisma.user.update({ where: { id: userId }, data: { departmentId: req.body.departmentId } })
    return { ok: true }
  })

  // ── Conflict check ────────────────────────────────────────────────────────
  a.get('/api/absence-requests/conflicts', {
    preHandler: [authenticate],
    schema: {
      querystring: z.object({
        userId: z.string().uuid(),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        approverId: z.string().uuid().optional(),
        approverRole: z.string().optional(),
      }),
    },
  }, async (req) => {
    const { userId, startDate, endDate, approverId, approverRole } = req.query
    return { tasks: await checkConflictingTasks(req.server.prisma, userId, startDate, endDate, approverId, approverRole) }
  })

  // ── Absence Requests ───────────────────────────────────────────────────────

  a.get('/api/absence-requests', {
    preHandler: [authenticate],
    schema: {
      querystring: z.object({
        status: z.string().optional(),
        userId: z.string().uuid().optional(),
        asApprover: z.string().optional(),
      }),
    },
  }, async (req) => {
    const user = req.user as any
    const { status, userId, asApprover } = req.query
    return getAbsenceRequests(req.server.prisma, user.orgId, user.sub, user.isAdmin, {
      status,
      userId,
      asApprover: asApprover === 'true',
    })
  })

  a.post('/api/absence-requests', {
    preHandler: [authenticate],
    schema: {
      body: z.object({
        userId: z.string().uuid(),
        typeId: z.string().uuid(),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        notes: z.string().max(1000).optional(),
      }),
    },
  }, async (req, reply) => {
    const user = req.user as any
    // only admin can create for others; others can only create for themselves
    if (!user.isAdmin && req.body.userId !== user.sub) return reply.status(403).send({ message: 'Нет доступа' })
    try {
      return await createAbsenceRequest(req.server.prisma, user.orgId, user.sub, req.body)
    } catch (e: any) { return reply.status(400).send({ message: e.message }) }
  })

  a.patch('/api/absence-requests/:id', {
    preHandler: [authenticate],
    schema: {
      params: z.object({ id: z.string().uuid() }),
      body: z.object({
        typeId: z.string().uuid().optional(),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        notes: z.string().max(1000).nullable().optional(),
      }),
    },
  }, async (req, reply) => {
    const user = req.user as any
    try {
      return await updateAbsenceRequest(req.server.prisma, req.params.id, user.sub, user.isAdmin, user.orgId, req.body)
    } catch (e: any) { return reply.status(400).send({ message: e.message }) }
  })

  a.post('/api/absence-requests/:id/steps/:stepId/decide', {
    preHandler: [authenticate],
    schema: {
      params: z.object({ id: z.string().uuid(), stepId: z.string().uuid() }),
      body: z.object({ decision: z.enum(['approved', 'rejected']), comment: z.string().max(500).optional() }),
    },
  }, async (req, reply) => {
    const user = req.user as any
    try {
      return await decideAbsenceRequestStep(req.server.prisma, req.params.stepId, user.sub, user.orgId, req.body.decision, req.body.comment)
    } catch (e: any) { return reply.status(400).send({ message: e.message }) }
  })

  a.post('/api/absence-requests/:id/cancel', {
    preHandler: [authenticate],
    schema: { params: z.object({ id: z.string().uuid() }) },
  }, async (req, reply) => {
    const user = req.user as any
    try {
      return await cancelAbsenceRequest(req.server.prisma, req.params.id, user.sub, user.isAdmin)
    } catch (e: any) { return reply.status(400).send({ message: e.message }) }
  })
}
