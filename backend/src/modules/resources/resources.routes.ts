import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { authenticate, requirePermission } from '../../plugins/authenticate'
import {
  WorkScheduleSchema,
  UpsertNonWorkingDaySchema,
  BulkImportCalendarSchema,
  CreateOrgTaskTypeSchema,
  UpdateOrgTaskTypeSchema,
  CreateDependencySchema,
  UpdateTaskConstraintSchema,
  TimelineQuerySchema,
  ReorderQueueSchema,
  AutoLevelSchema,
  CreatePresetSchema,
  UpdatePresetSchema,
  AssignUserScheduleSchema,
} from './resources.schemas'
import {
  getNonWorkingDays,
  upsertNonWorkingDay,
  deleteNonWorkingDay,
  importCountryCalendar,
  getOrgSchedule,
  upsertOrgSchedule,
  getUserSchedule,
  upsertUserSchedule,
  deleteUserSchedule,
  getWorkSchedulePresets,
  createWorkSchedulePreset,
  updateWorkSchedulePreset,
  deleteWorkSchedulePreset,
  assignPresetToUser,
} from './calendar.service'
import {
  getUserQueue,
  reorderQueue,
  recalcQueueDates,
  autoLevel,
  getTaskDependencies,
  createDependency,
  deleteDependency,
} from './leveling.service'
import { getResourceTimeline } from './timeline.service'
import { recalculateProjectSchedule } from '../tasks/cpm.service'
import {
  importMSProjectXml,
  importExcel,
  importPrimaveraXml,
} from './import.service'

export const resourcesRoutes: FastifyPluginAsyncZod = async (app) => {
  // ── Resource Timeline ───────────────────────────────────────────────────────
  app.get('/api/resources/timeline', {
    preHandler: [authenticate],
    schema: { querystring: TimelineQuerySchema },
  }, async (req, reply) => {
    const { from, to, projectId, groupBy } = req.query
    const user = req.user as any
    const result = await getResourceTimeline(
      req.server.prisma,
      user.orgId,
      user.id,
      user.isAdmin,
      user.orgRoleId ?? null,
      from,
      to,
      groupBy,
      projectId,
    )
    return result
  })

  // ── Queue ────────────────────────────────────────────────────────────────────
  app.get('/api/resources/queue/:userId', {
    preHandler: [authenticate],
    schema: { params: z.object({ userId: z.string().uuid() }) },
  }, async (req, reply) => {
    const user = req.user as any
    const { userId } = req.params
    // Can only see own queue unless admin or team_manage
    if (userId !== user.id && !user.isAdmin) {
      const perm = await req.server.prisma.rolePermission.findUnique({
        where: { roleId_permission: { roleId: user.orgRoleId ?? '', permission: 'team_manage' } },
      })
      if (!perm) return reply.status(403).send({ message: 'Доступ запрещён' })
    }
    return getUserQueue(req.server.prisma, userId, user.orgId)
  })

  app.get('/api/resources/queue', {
    preHandler: [authenticate],
  }, async (req) => {
    const user = req.user as any
    return getUserQueue(req.server.prisma, user.id, user.orgId)
  })

  app.post('/api/resources/queue/:userId/reorder', {
    preHandler: [authenticate],
    schema: {
      params: z.object({ userId: z.string().uuid() }),
      body: ReorderQueueSchema,
    },
  }, async (req, reply) => {
    const user = req.user as any
    const { userId } = req.params
    if (userId !== user.id && !user.isAdmin) {
      return reply.status(403).send({ message: 'Доступ запрещён' })
    }
    return reorderQueue(req.server.prisma, userId, req.body.taskIds)
  })

  app.post('/api/resources/queue/reorder', {
    preHandler: [authenticate],
    schema: { body: ReorderQueueSchema },
  }, async (req) => {
    const user = req.user as any
    return reorderQueue(req.server.prisma, user.id, req.body.taskIds)
  })

  app.post('/api/resources/auto-level', {
    preHandler: [authenticate, requirePermission('team_manage')],
    schema: { body: AutoLevelSchema },
  }, async (req) => {
    const user = req.user as any
    const { userIds, from, weights } = req.body
    return autoLevel(req.server.prisma, user.orgId, from, userIds, weights as any)
  })

  // ── Task Dependencies ────────────────────────────────────────────────────────
  app.get('/api/tasks/:taskId/dependencies', {
    preHandler: [authenticate],
    schema: { params: z.object({ taskId: z.string().uuid() }) },
  }, async (req) => {
    return getTaskDependencies(req.server.prisma, req.params.taskId)
  })

  app.post('/api/tasks/:taskId/dependencies', {
    preHandler: [authenticate],
    schema: {
      params: z.object({ taskId: z.string().uuid() }),
      body: CreateDependencySchema,
    },
  }, async (req, reply) => {
    const { taskId } = req.params
    const { predecessorId, type, lagDays } = req.body
    try {
      const dep = await createDependency(req.server.prisma, taskId, predecessorId, type, lagDays)
      const task = await req.server.prisma.task.findUnique({ where: { id: taskId }, select: { projectId: true } })
      if (task) {
        await recalculateProjectSchedule(req.server.prisma, task.projectId).catch(e =>
          req.server.log.error('[CPM] ' + e),
        )
      }
      return dep
    } catch (err: any) {
      return reply.status(400).send({ message: err.message })
    }
  })

  app.delete('/api/tasks/dependencies/:depId', {
    preHandler: [authenticate],
    schema: { params: z.object({ depId: z.string().uuid() }) },
  }, async (req) => {
    const dep = await req.server.prisma.taskDependency.findUnique({
      where: { id: req.params.depId },
      select: { task: { select: { projectId: true } } },
    })
    await deleteDependency(req.server.prisma, req.params.depId)
    if (dep?.task?.projectId) {
      await recalculateProjectSchedule(req.server.prisma, dep.task.projectId).catch(e =>
        req.server.log.error('[CPM] ' + e),
      )
    }
    return { ok: true }
  })

  app.patch('/api/tasks/:taskId/constraint', {
    preHandler: [authenticate],
    schema: {
      params: z.object({ taskId: z.string().uuid() }),
      body: UpdateTaskConstraintSchema,
    },
  }, async (req) => {
    const { taskId } = req.params
    const { constraintType, constraintDate } = req.body
    const task = await req.server.prisma.task.update({
      where: { id: taskId },
      data: {
        constraintType: constraintType ?? null,
        constraintDate: constraintDate ? new Date(constraintDate) : null,
      },
    })
    return { taskId: task.id, constraintType: task.constraintType, constraintDate: task.constraintDate }
  })

  // ── Org Task Types ───────────────────────────────────────────────────────────
  app.get('/api/org/task-types', {
    preHandler: [authenticate],
  }, async (req) => {
    const user = req.user as any
    return req.server.prisma.orgTaskType.findMany({
      where: { organizationId: user.orgId },
      orderBy: [{ isSystem: 'desc' }, { createdAt: 'asc' }],
    })
  })

  app.post('/api/org/task-types', {
    preHandler: [authenticate, requirePermission('settings_manage')],
    schema: { body: CreateOrgTaskTypeSchema },
  }, async (req) => {
    const user = req.user as any
    return req.server.prisma.orgTaskType.create({
      data: {
        organizationId: user.orgId,
        name: req.body.name,
        color: req.body.color ?? '#6B7280',
      },
    })
  })

  app.patch('/api/org/task-types/:id', {
    preHandler: [authenticate, requirePermission('settings_manage')],
    schema: {
      params: z.object({ id: z.string().uuid() }),
      body: UpdateOrgTaskTypeSchema,
    },
  }, async (req, reply) => {
    const user = req.user as any
    const type = await req.server.prisma.orgTaskType.findFirst({
      where: { id: req.params.id, organizationId: user.orgId },
    })
    if (!type) return reply.status(404).send({ message: 'Не найдено' })
    if (type.isSystem) return reply.status(400).send({ message: 'Системный тип нельзя изменить' })
    return req.server.prisma.orgTaskType.update({ where: { id: req.params.id }, data: req.body })
  })

  app.delete('/api/org/task-types/:id', {
    preHandler: [authenticate, requirePermission('settings_manage')],
    schema: { params: z.object({ id: z.string().uuid() }) },
  }, async (req, reply) => {
    const user = req.user as any
    const type = await req.server.prisma.orgTaskType.findFirst({
      where: { id: req.params.id, organizationId: user.orgId },
    })
    if (!type) return reply.status(404).send({ message: 'Не найдено' })
    if (type.isSystem) return reply.status(400).send({ message: 'Системный тип нельзя удалить' })
    await req.server.prisma.orgTaskType.delete({ where: { id: req.params.id } })
    return { ok: true }
  })

  // ── Work Schedules (org default) ─────────────────────────────────────────────
  app.get('/api/org/work-schedule', {
    preHandler: [authenticate],
  }, async (req) => {
    const user = req.user as any
    return getOrgSchedule(req.server.prisma, user.orgId)
  })

  app.put('/api/org/work-schedule', {
    preHandler: [authenticate, requirePermission('settings_manage')],
    schema: { body: WorkScheduleSchema },
  }, async (req) => {
    const user = req.user as any
    return upsertOrgSchedule(req.server.prisma, user.orgId, req.body)
  })

  // ── Work Schedule Presets ────────────────────────────────────────────────────
  app.get('/api/org/work-schedule-presets', {
    preHandler: [authenticate],
  }, async (req) => {
    const user = req.user as any
    return getWorkSchedulePresets(req.server.prisma, user.orgId)
  })

  app.post('/api/org/work-schedule-presets', {
    preHandler: [authenticate, requirePermission('team_manage')],
    schema: { body: CreatePresetSchema },
  }, async (req) => {
    const user = req.user as any
    return createWorkSchedulePreset(req.server.prisma, user.orgId, req.body)
  })

  app.patch('/api/org/work-schedule-presets/:id', {
    preHandler: [authenticate, requirePermission('team_manage')],
    schema: {
      params: z.object({ id: z.string().uuid() }),
      body: UpdatePresetSchema,
    },
  }, async (req, reply) => {
    const user = req.user as any
    try {
      return await updateWorkSchedulePreset(req.server.prisma, user.orgId, req.params.id, req.body)
    } catch (e: any) {
      return reply.status(400).send({ message: e.message })
    }
  })

  app.delete('/api/org/work-schedule-presets/:id', {
    preHandler: [authenticate, requirePermission('team_manage')],
    schema: { params: z.object({ id: z.string().uuid() }) },
  }, async (req, reply) => {
    const user = req.user as any
    try {
      await deleteWorkSchedulePreset(req.server.prisma, user.orgId, req.params.id)
      return { ok: true }
    } catch (e: any) {
      return reply.status(400).send({ message: e.message })
    }
  })

  // ── Per-user schedule assignment ─────────────────────────────────────────────
  app.get('/api/users/:userId/work-schedule', {
    preHandler: [authenticate],
    schema: { params: z.object({ userId: z.string().uuid() }) },
  }, async (req, reply) => {
    const user = req.user as any
    const { userId } = req.params
    const canAccess = userId === user.id || user.isAdmin
      || await req.server.prisma.rolePermission.findUnique({
          where: { roleId_permission: { roleId: user.orgRoleId ?? '', permission: 'team_manage' } },
        })
    if (!canAccess) return reply.status(403).send({ message: 'Доступ запрещён' })
    const s = await getUserSchedule(req.server.prisma, userId)
    if (!s) return getOrgSchedule(req.server.prisma, user.orgId)
    return s
  })

  app.put('/api/users/:userId/work-schedule', {
    preHandler: [authenticate],
    schema: {
      params: z.object({ userId: z.string().uuid() }),
      body: AssignUserScheduleSchema,
    },
  }, async (req, reply) => {
    const user = req.user as any
    const { userId } = req.params
    const canManage = user.isAdmin
      || await req.server.prisma.rolePermission.findUnique({
          where: { roleId_permission: { roleId: user.orgRoleId ?? '', permission: 'team_manage' } },
        })
    if (!canManage) return reply.status(403).send({ message: 'Доступ запрещён' })
    try {
      const result = await assignPresetToUser(
        req.server.prisma, userId, user.orgId,
        req.body.presetId ?? null,
        {
          name: req.body.name,
          hoursPerDay: req.body.hoursPerDay,
          hoursPerDayMap: req.body.hoursPerDayMap,
          workDays: req.body.workDays,
          cycleStartDate: req.body.cycleStartDate,
        },
      )
      return result
    } catch (e: any) {
      return reply.status(400).send({ message: e.message })
    }
  })

  app.delete('/api/users/:userId/work-schedule', {
    preHandler: [authenticate],
    schema: { params: z.object({ userId: z.string().uuid() }) },
  }, async (req, reply) => {
    const user = req.user as any
    const { userId } = req.params
    const canManage = user.isAdmin
      || await req.server.prisma.rolePermission.findUnique({
          where: { roleId_permission: { roleId: user.orgRoleId ?? '', permission: 'team_manage' } },
        })
    if (!canManage) return reply.status(403).send({ message: 'Доступ запрещён' })
    await deleteUserSchedule(req.server.prisma, userId)
    return { ok: true }
  })

  // ── Production Calendar ──────────────────────────────────────────────────────
  app.get('/api/org/calendar', {
    preHandler: [authenticate],
    schema: { querystring: z.object({ year: z.coerce.number().int().optional() }) },
  }, async (req) => {
    const user = req.user as any
    return getNonWorkingDays(req.server.prisma, user.orgId, req.query.year)
  })

  app.post('/api/org/calendar', {
    preHandler: [authenticate, requirePermission('settings_manage')],
    schema: { body: UpsertNonWorkingDaySchema },
  }, async (req) => {
    const user = req.user as any
    const result = await upsertNonWorkingDay(req.server.prisma, user.orgId, {
      date: req.body.date,
      type: req.body.type,
      name: req.body.name,
    })
    return { id: result.id, date: result.date.toISOString().slice(0, 10), type: result.type, name: result.name }
  })

  app.delete('/api/org/calendar/:id', {
    preHandler: [authenticate, requirePermission('settings_manage')],
    schema: { params: z.object({ id: z.string().uuid() }) },
  }, async (req) => {
    await deleteNonWorkingDay(req.server.prisma, req.params.id)
    return { ok: true }
  })

  app.post('/api/org/calendar/import-preset', {
    preHandler: [authenticate, requirePermission('settings_manage')],
    schema: { body: BulkImportCalendarSchema },
  }, async (req) => {
    const user = req.user as any
    return importCountryCalendar(req.server.prisma, user.orgId, req.body.country, req.body.year)
  })

  // ── Import ───────────────────────────────────────────────────────────────────
  app.post('/api/import', {
    preHandler: [authenticate],
  }, async (req, reply) => {
    const user = req.user as any
    const data = await req.file()
    if (!data) return reply.status(400).send({ message: 'Файл не найден' })

    const filename = data.filename ?? ''
    const buffer = await data.toBuffer()
    const lc = filename.toLowerCase()

    try {
      let result
      if (lc.endsWith('.csv') || lc.endsWith('.xlsx') || lc.endsWith('.xls')) {
        result = await importExcel(req.server.prisma, user.orgId, user.id, buffer, filename)
      } else if (lc.endsWith('.xml')) {
        const text = buffer.toString('utf-8')
        if (text.includes('APIBusinessObjects') || text.includes('primavera')) {
          result = await importPrimaveraXml(req.server.prisma, user.orgId, user.id, buffer)
        } else {
          result = await importMSProjectXml(req.server.prisma, user.orgId, user.id, buffer)
        }
      } else {
        return reply.status(400).send({ message: `Формат ${filename.split('.').pop()} не поддерживается` })
      }
      return result
    } catch (err: any) {
      return reply.status(400).send({ message: err.message })
    }
  })
}
