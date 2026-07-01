import { PrismaClient, TaskStatus } from '@prisma/client'
import { getOrgWorkConfig, addWorkDays, isWorkDay } from './calendar.service'

// ── Queue management ──────────────────────────────────────────────────────────

export async function getUserQueue(prisma: PrismaClient, userId: string, orgId: string) {
  const tasks = await prisma.task.findMany({
    where: {
      assigneeId: userId,
      project: { organizationId: orgId },
      status: { notIn: ['done', 'cancelled'] },
    },
    select: {
      id: true,
      title: true,
      projectId: true,
      project: { select: { name: true, schedulingPriority: true } },
      status: true,
      priority: true,
      taskType: true,
      effortHours: true,
      startDate: true,
      dueDate: true,
      queueOrder: true,
      constraintType: true,
      constraintDate: true,
    },
    orderBy: [{ queueOrder: 'asc' }, { dueDate: 'asc' }, { priority: 'desc' }],
  })

  return tasks.map(t => ({
    id: t.id,
    title: t.title,
    projectId: t.projectId,
    projectName: (t as any).project?.name ?? null,
    projectPriority: (t as any).project?.schedulingPriority ?? 0,
    status: t.status,
    priority: t.priority,
    taskType: t.taskType,
    effortHours: t.effortHours !== null ? Number(t.effortHours) : null,
    startDate: t.startDate?.toISOString().slice(0, 10) ?? null,
    dueDate: t.dueDate?.toISOString().slice(0, 10) ?? null,
    queueOrder: t.queueOrder,
    constraintType: t.constraintType,
    constraintDate: t.constraintDate?.toISOString().slice(0, 10) ?? null,
  }))
}

export async function reorderQueue(
  prisma: PrismaClient,
  userId: string,
  taskIds: string[],
) {
  // Set queueOrder in given order, then recalculate dates
  await Promise.all(
    taskIds.map((id, i) => prisma.task.update({ where: { id }, data: { queueOrder: i + 1 } }))
  )
  return recalcQueueDates(prisma, userId)
}

// ── Date recalculation after reorder ─────────────────────────────────────────

export async function recalcQueueDates(prisma: PrismaClient, userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { organizationId: true, dailyCapacityHours: true, workSchedule: true },
  })

  const orgConfig = await getOrgWorkConfig(prisma, user.organizationId)
  const userSchedule = await prisma.userWorkSchedule.findUnique({ where: { userId } })
  const hoursPerDay = userSchedule ? Number(userSchedule.hoursPerDay) : Number(user.dailyCapacityHours ?? 8)

  const tasks = await prisma.task.findMany({
    where: {
      assigneeId: userId,
      status: { notIn: ['done', 'cancelled'] },
      queueOrder: { not: null },
    },
    orderBy: [{ queueOrder: 'asc' }],
  })

  // Sequential scheduling: each task starts after the previous one ends
  let cursor = new Date()
  // Move cursor to next work day if today is not a work day
  while (!isWorkDay(cursor, orgConfig)) {
    cursor.setDate(cursor.getDate() + 1)
  }

  const updates: Array<{ id: string; startDate: Date; dueDate: Date }> = []

  for (const task of tasks) {
    // Respect constraint: SNET (start not earlier than)
    if (task.constraintType === 'snet' && task.constraintDate && task.constraintDate > cursor) {
      cursor = new Date(task.constraintDate)
    }
    // EXACT / MSO: start is fixed
    if ((task.constraintType === 'exact' || task.constraintType === 'mso') && task.constraintDate) {
      cursor = new Date(task.constraintDate)
    }
    // MFO: finish is fixed — keep cursor from backing up further
    if (task.constraintType === 'mfo' && task.constraintDate) {
      const duration = task.effortHours ? Math.max(1, Math.ceil(Number(task.effortHours) / hoursPerDay)) : 1
      const fixedFinish = new Date(task.constraintDate)
      const computedStart = addWorkDays(fixedFinish, -(duration - 1), orgConfig)
      cursor = computedStart
    }
    // ALAP: skip for now, place as late as possible before deadline
    // For MVP, ALAP keeps existing dates

    const startDate = new Date(cursor)
    const effort = task.effortHours ? Number(task.effortHours) : hoursPerDay
    const workDaysNeeded = Math.max(1, Math.ceil(effort / hoursPerDay))
    const endDate = addWorkDays(startDate, workDaysNeeded - 1, orgConfig)

    updates.push({ id: task.id, startDate, dueDate: endDate })

    // Move cursor to next work day after end
    cursor = addWorkDays(endDate, 1, orgConfig)
  }

  await Promise.all(
    updates.map(u =>
      prisma.task.update({
        where: { id: u.id },
        data: { startDate: u.startDate, dueDate: u.dueDate, updatedAt: new Date() },
      })
    )
  )

  return updates.map(u => ({
    taskId: u.id,
    startDate: u.startDate.toISOString().slice(0, 10),
    dueDate: u.dueDate.toISOString().slice(0, 10),
  }))
}

// ── Auto-leveling ─────────────────────────────────────────────────────────────

interface LevelWeights {
  dueDate: number
  projectPriority: number
  criticalPath: number
  freeFloat: number
}

const DEFAULT_WEIGHTS: LevelWeights = {
  dueDate: 0.4,
  projectPriority: 0.3,
  criticalPath: 0.2,
  freeFloat: 0.1,
}

export async function autoLevel(
  prisma: PrismaClient,
  orgId: string,
  from: string,
  userIds?: string[],
  weights: LevelWeights = DEFAULT_WEIGHTS,
) {
  // Get all assignees to level
  let targetUsers: string[]
  if (userIds && userIds.length > 0) {
    targetUsers = userIds
  } else {
    const users = await prisma.user.findMany({ where: { organizationId: orgId }, select: { id: true } })
    targetUsers = users.map(u => u.id)
  }

  const results: Record<string, any[]> = {}

  for (const uid of targetUsers) {
    const tasks = await prisma.task.findMany({
      where: {
        assigneeId: uid,
        project: { organizationId: orgId },
        status: { notIn: ['done', 'cancelled'] },
      },
      select: {
        id: true,
        dueDate: true,
        priority: true,
        effortHours: true,
        project: { select: { schedulingPriority: true } },
        constraintType: true,
        constraintDate: true,
      },
    })

    // Score each task (higher = earlier in queue)
    const now = new Date(from)
    const scored = tasks.map(t => {
      // Due-date score: how soon is the deadline (inverse of days remaining)
      const dueDays = t.dueDate
        ? Math.max(0, Math.round((t.dueDate.getTime() - now.getTime()) / 86400000))
        : 9999
      const dueDateScore = dueDays === 0 ? 1 : Math.max(0, 1 - dueDays / 365)

      // Project priority score (0-10 → 0-1)
      const projPriScore = Math.min(1, ((t as any).project?.schedulingPriority ?? 0) / 10)

      // Priority score
      const prioMap: Record<string, number> = { critical: 1, high: 0.75, medium: 0.5, low: 0.25 }
      const prioScore = prioMap[t.priority] ?? 0.5

      // For MVP, critical path and free float use priority as approximation
      const critScore = prioScore
      const floatScore = dueDateScore

      const total =
        weights.dueDate * dueDateScore +
        weights.projectPriority * projPriScore +
        weights.criticalPath * critScore +
        weights.freeFloat * (1 - floatScore) // less float = higher urgency

      return { ...t, score: total }
    })

    // Sort descending by score
    scored.sort((a, b) => b.score - a.score)

    // Assign queue orders
    await Promise.all(
      scored.map((t, i) => prisma.task.update({ where: { id: t.id }, data: { queueOrder: i + 1 } }))
    )

    // Recalc dates
    results[uid] = await recalcQueueDates(prisma, uid)
  }

  return results
}

// ── Dependencies ──────────────────────────────────────────────────────────────

export async function getTaskDependencies(prisma: PrismaClient, taskId: string) {
  const deps = await prisma.taskDependency.findMany({
    where: { taskId },
    select: {
      id: true,
      predecessorId: true,
      predecessor: { select: { title: true } },
      type: true,
      lagDays: true,
    },
  })
  return deps.map(d => ({
    id: d.id,
    predecessorId: d.predecessorId,
    predecessorTitle: d.predecessor.title,
    type: d.type,
    lagDays: d.lagDays,
  }))
}

export async function createDependency(
  prisma: PrismaClient,
  taskId: string,
  predecessorId: string,
  type: string,
  lagDays: number,
) {
  if (taskId === predecessorId) throw new Error('Задача не может зависеть сама от себя')
  // Simple cycle check: predecessorId should not transitively depend on taskId
  const isCircular = await checkCircular(prisma, predecessorId, taskId)
  if (isCircular) throw new Error('Обнаружена циклическая зависимость')

  const dep = await prisma.taskDependency.create({
    data: { taskId, predecessorId, type: type as any, lagDays },
  })
  return dep
}

async function checkCircular(
  prisma: PrismaClient,
  startId: string,
  targetId: string,
  visited = new Set<string>(),
): Promise<boolean> {
  if (startId === targetId) return true
  if (visited.has(startId)) return false
  visited.add(startId)

  const preds = await prisma.taskDependency.findMany({
    where: { taskId: startId },
    select: { predecessorId: true },
  })
  for (const p of preds) {
    if (await checkCircular(prisma, p.predecessorId, targetId, visited)) return true
  }
  return false
}

export async function deleteDependency(prisma: PrismaClient, depId: string) {
  await prisma.taskDependency.delete({ where: { id: depId } })
}
