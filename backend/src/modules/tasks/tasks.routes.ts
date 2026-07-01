import { FastifyPluginAsync } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/authenticate'
import {
  CreateTaskSchema,
  UpdateTaskSchema,
  MoveTaskSchema,
  DelegateSubtreeSchema,
  ListTasksQuerySchema,
  CalendarQuerySchema,
  CreateBoardColumnSchema,
  UpdateBoardColumnSchema,
  ReorderColumnsSchema,
  UpsertTransitionSchema,
  CreateCommentSchema,
  UpdateCommentSchema,
} from './tasks.schemas'
import * as svc from './tasks.service'
import { assertProjectAccess } from '../projects/projects.service'
import { recalculateProjectSchedule } from './cpm.service'

const CPM_FIELDS = new Set(['duration', 'startDate', 'dueDate', 'constraintType', 'constraintDate'])

export const tasksRoutes: FastifyPluginAsync = async (app) => {
  // ── My tasks (global) ────────────────────────────────────────────────────

  app.get('/api/tasks/my', { preHandler: [authenticate] }, async (req, reply) => {
    const user = req.currentUser
    const query = ListTasksQuerySchema.parse(req.query)
    const result = await svc.getMyTasks(app.prisma, user.sub, user.orgId, query)
    reply.send(result)
  })

  // ── Calendar (global) ────────────────────────────────────────────────────

  app.get('/api/tasks/calendar', { preHandler: [authenticate] }, async (req, reply) => {
    const user = req.currentUser
    const { from, to, projectId } = CalendarQuerySchema.parse(req.query)
    const dbUser = await app.prisma.user.findUniqueOrThrow({
      where: { id: user.sub },
      select: { isAdmin: true, orgRoleId: true },
    })
    const tasks = await svc.getCalendarTasks(
      app.prisma,
      user.orgId,
      user.sub,
      dbUser.isAdmin,
      dbUser.orgRoleId,
      from,
      to,
      projectId,
    )
    reply.send({ items: tasks })
  })

  // ── Project tasks ─────────────────────────────────────────────────────────

  // ── Gantt ─────────────────────────────────────────────────────────────────

  app.get('/api/projects/:projectId/gantt', { preHandler: [authenticate] }, async (req) => {
    const { projectId } = req.params as { projectId: string }
    const user = req.currentUser
    await assertProjectAccess(app.prisma, user.orgId, projectId, user.sub, user.isAdmin)
    return svc.getGanttTasks(app.prisma, projectId)
  })

  app.post('/api/projects/:projectId/set-baseline', {
    preHandler: [authenticate, requirePermission('schedule_edit')],
  }, async (req, reply) => {
    const { projectId } = req.params as { projectId: string }
    const user = req.currentUser
    await assertProjectAccess(app.prisma, user.orgId, projectId, user.sub, user.isAdmin)
    await svc.setProjectBaseline(app.prisma, projectId)
    return reply.status(204).send()
  })

  // ── Project tasks list ────────────────────────────────────────────────────

  app.get('/api/projects/:projectId/tasks', { preHandler: [authenticate] }, async (req, reply) => {
    const user = req.currentUser
    const { projectId } = req.params as { projectId: string }
    await assertProjectAccess(app.prisma, user.orgId, projectId, user.sub, user.isAdmin)

    const query = ListTasksQuerySchema.parse(req.query)

    if (query.flat) {
      const result = await svc.getProjectTasksFlat(app.prisma, projectId, query)
      reply.send(result)
    } else {
      const result = await svc.getProjectTaskTree(app.prisma, projectId, query)
      reply.send(result)
    }
  })

  app.post('/api/projects/:projectId/tasks', {
    preHandler: [authenticate, requirePermission('task_create')],
  }, async (req, reply) => {
    const user = req.currentUser
    const { projectId } = req.params as { projectId: string }
    await assertProjectAccess(app.prisma, user.orgId, projectId, user.sub, user.isAdmin)

    const data = CreateTaskSchema.parse(req.body)
    const task = await svc.createTask(app.prisma, projectId, user.sub, data as any)
    reply.code(201).send(task)
  })

  // ── Single task ───────────────────────────────────────────────────────────

  app.get('/api/tasks/:taskId', { preHandler: [authenticate] }, async (req, reply) => {
    const { taskId } = req.params as { taskId: string }
    const task = await svc.getTask(app.prisma, taskId)
    reply.send(task)
  })

  app.patch('/api/tasks/:taskId', {
    preHandler: [authenticate, requirePermission('task_edit')],
  }, async (req, reply) => {
    const user = req.currentUser
    const { taskId } = req.params as { taskId: string }
    const data = UpdateTaskSchema.parse(req.body)

    // If changing status — check transition rules
    if (data.status !== undefined) {
      const current = await svc.getTask(app.prisma, taskId)
      if (current.status !== data.status) {
        const dbUser = await app.prisma.user.findUniqueOrThrow({
          where: { id: user.sub },
          select: { orgRoleId: true },
        })
        const allowed = await svc.canChangeStatus(
          app.prisma, user.orgId, dbUser.orgRoleId,
          current.status as any, data.status as any,
        )
        if (!allowed) {
          return reply.code(403).send({ error: 'Переход статуса запрещён для вашей роли' })
        }
      }
    }

    const task = await svc.updateTask(app.prisma, taskId, data as any)

    // Run CPM synchronously before responding so client gets fresh dates on next fetch
    const needsCpm = Object.keys(data).some(k => CPM_FIELDS.has(k))
    if (needsCpm) {
      await recalculateProjectSchedule(app.prisma, task.projectId).catch(e =>
        app.log.error('[CPM] ' + e),
      )
    }

    reply.send(task)
  })

  app.delete('/api/tasks/:taskId', {
    preHandler: [authenticate, requirePermission('task_edit')],
  }, async (req, reply) => {
    const { taskId } = req.params as { taskId: string }
    await svc.deleteTask(app.prisma, taskId)
    reply.code(204).send()
  })

  // ── Move task (change parent / reorder) ───────────────────────────────────

  app.patch('/api/tasks/:taskId/move', {
    preHandler: [authenticate, requirePermission('task_edit')],
  }, async (req, reply) => {
    const { taskId } = req.params as { taskId: string }
    const { parentId, sortOrder } = MoveTaskSchema.parse(req.body)
    const task = await svc.moveTask(app.prisma, taskId, parentId, sortOrder)
    reply.send(task)
  })

  // ── Delegate subtree ──────────────────────────────────────────────────────

  app.post('/api/tasks/:taskId/delegate', {
    preHandler: [authenticate, requirePermission('task_edit')],
  }, async (req, reply) => {
    const user = req.currentUser
    const { taskId } = req.params as { taskId: string }
    const { assigneeId } = DelegateSubtreeSchema.parse(req.body)
    const ids = await svc.delegateSubtree(app.prisma, taskId, assigneeId, user.sub, user.orgId)
    reply.send({ updatedCount: ids.length, taskIds: ids })
  })

  // ── Comments ──────────────────────────────────────────────────────────────

  app.get('/api/tasks/:taskId/comments', { preHandler: [authenticate] }, async (req, reply) => {
    const { taskId } = req.params as { taskId: string }
    const comments = await svc.getComments(app.prisma, taskId)
    reply.send({ items: comments })
  })

  app.post('/api/tasks/:taskId/comments', {
    preHandler: [authenticate],
  }, async (req, reply) => {
    const user = req.currentUser
    const { taskId } = req.params as { taskId: string }
    const { text } = CreateCommentSchema.parse(req.body)
    const comment = await svc.createComment(app.prisma, taskId, user.sub, user.orgId, text)
    reply.code(201).send(comment)
  })

  app.patch('/api/tasks/:taskId/comments/:commentId', {
    preHandler: [authenticate],
  }, async (req, reply) => {
    const user = req.currentUser
    const { commentId } = req.params as { taskId: string; commentId: string }
    const { text } = UpdateCommentSchema.parse(req.body)
    try {
      const comment = await svc.updateComment(app.prisma, commentId, user.sub, text)
      reply.send(comment)
    } catch (e: any) {
      reply.code(403).send({ error: e.message })
    }
  })

  app.delete('/api/tasks/:taskId/comments/:commentId', {
    preHandler: [authenticate],
  }, async (req, reply) => {
    const user = req.currentUser
    const { commentId } = req.params as { taskId: string; commentId: string }
    try {
      const dbUser = await app.prisma.user.findUniqueOrThrow({
        where: { id: user.sub },
        select: { isAdmin: true },
      })
      const comment = await svc.deleteComment(app.prisma, commentId, user.sub, dbUser.isAdmin)
      reply.send(comment)
    } catch (e: any) {
      reply.code(403).send({ error: e.message })
    }
  })

  // ── Board columns ─────────────────────────────────────────────────────────

  app.get('/api/projects/:projectId/board-columns', {
    preHandler: [authenticate],
  }, async (req, reply) => {
    const user = req.currentUser
    const { projectId } = req.params as { projectId: string }
    await assertProjectAccess(app.prisma, user.orgId, projectId, user.sub, user.isAdmin)
    const cols = await svc.getBoardColumns(app.prisma, projectId)
    reply.send({ items: cols })
  })

  app.post('/api/projects/:projectId/board-columns', {
    preHandler: [authenticate],
  }, async (req, reply) => {
    const user = req.currentUser
    const { projectId } = req.params as { projectId: string }
    await assertProjectAccess(app.prisma, user.orgId, projectId, user.sub, user.isAdmin, 'admin')
    const data = CreateBoardColumnSchema.parse(req.body)
    const col = await svc.createBoardColumn(app.prisma, projectId, data as any)
    reply.code(201).send(col)
  })

  app.patch('/api/projects/:projectId/board-columns/:columnId', {
    preHandler: [authenticate],
  }, async (req, reply) => {
    const user = req.currentUser
    const { projectId, columnId } = req.params as { projectId: string; columnId: string }
    await assertProjectAccess(app.prisma, user.orgId, projectId, user.sub, user.isAdmin, 'admin')
    const data = UpdateBoardColumnSchema.parse(req.body)
    const col = await svc.updateBoardColumn(app.prisma, columnId, data as any)
    reply.send(col)
  })

  app.delete('/api/projects/:projectId/board-columns/:columnId', {
    preHandler: [authenticate],
  }, async (req, reply) => {
    const user = req.currentUser
    const { projectId, columnId } = req.params as { projectId: string; columnId: string }
    await assertProjectAccess(app.prisma, user.orgId, projectId, user.sub, user.isAdmin, 'admin')
    await svc.deleteBoardColumn(app.prisma, columnId)
    reply.code(204).send()
  })

  app.post('/api/projects/:projectId/board-columns/reorder', {
    preHandler: [authenticate],
  }, async (req, reply) => {
    const user = req.currentUser
    const { projectId } = req.params as { projectId: string }
    await assertProjectAccess(app.prisma, user.orgId, projectId, user.sub, user.isAdmin, 'admin')
    const { ids } = ReorderColumnsSchema.parse(req.body)
    await svc.reorderBoardColumns(app.prisma, ids)
    reply.send({ ok: true })
  })

  // ── Effort unit ───────────────────────────────────────────────────────────

  app.get('/api/projects/:projectId/effort-unit', {
    preHandler: [authenticate],
  }, async (req, reply) => {
    const { projectId } = req.params as { projectId: string }
    const unit = await svc.getEffortUnit(app.prisma, projectId)
    reply.send({ effortUnit: unit })
  })

  // ── Status transition rules (org-level) ──────────────────────────────────

  app.get('/api/org/task-transitions', {
    preHandler: [authenticate],
  }, async (req, reply) => {
    const rules = await svc.getStatusTransitions(app.prisma, req.currentUser.orgId)
    reply.send({ items: rules })
  })

  app.put('/api/org/task-transitions', {
    preHandler: [authenticate, requirePermission('settings_manage')],
  }, async (req, reply) => {
    const user = req.currentUser
    const data = UpsertTransitionSchema.parse(req.body)
    const rule = await svc.upsertStatusTransition(
      app.prisma, user.orgId, data.fromStatus as any, data.toStatus as any, data.allowedOrgRoleIds,
    )
    reply.send(rule)
  })

  app.delete('/api/org/task-transitions/:transitionId', {
    preHandler: [authenticate, requirePermission('settings_manage')],
  }, async (req, reply) => {
    const { transitionId } = req.params as { transitionId: string }
    await svc.deleteStatusTransition(app.prisma, transitionId)
    reply.code(204).send()
  })

  // ── CPM recalculate ───────────────────────────────────────────────────────

  app.post('/api/projects/:projectId/recalculate', {
    preHandler: [authenticate, requirePermission('schedule_edit')],
  }, async (req, reply) => {
    const { projectId } = req.params as { projectId: string }
    const user = req.currentUser
    await assertProjectAccess(app.prisma, user.orgId, projectId, user.sub, user.isAdmin)
    await recalculateProjectSchedule(app.prisma, projectId)
    reply.send({ ok: true })
  })
}
