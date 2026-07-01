import { PrismaClient, DistributionRule } from '@prisma/client'
import type { z } from 'zod'
import type { UpsertRoleEffortSchema, UpsertTimeEntrySchema } from './effort.schemas'

// ── Distribution calculation ──────────────────────────────────────────────────

function getMondayOf(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const dow = d.getDay() // 0=Sun
  const diff = dow === 0 ? -6 : 1 - dow
  d.setDate(d.getDate() + diff)
  return d
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

/** Returns all ISO-week Mondays between startDate and endDate inclusive */
function getWeekStarts(startDate: Date, endDate: Date): Date[] {
  const weeks: Date[] = []
  let cur = getMondayOf(startDate)
  const endMonday = getMondayOf(endDate)
  while (cur <= endMonday) {
    weeks.push(new Date(cur))
    cur = addDays(cur, 7)
  }
  return weeks
}

function computeWeights(n: number, rule: DistributionRule, manualPcts?: number[]): number[] {
  if (n === 0) return []
  switch (rule) {
    case 'uniform':
      return Array(n).fill(1)
    case 'front_loaded':
      return Array.from({ length: n }, (_, i) => n - i)
    case 'back_loaded':
      return Array.from({ length: n }, (_, i) => i + 1)
    case 's_curve': {
      // Bell curve peaking in the middle
      return Array.from({ length: n }, (_, i) => {
        const x = (i + 0.5) / n
        return Math.exp(-0.5 * Math.pow((x - 0.5) / 0.18, 2))
      })
    }
    case 'manual':
      return manualPcts?.length === n ? manualPcts : Array(n).fill(1)
    default:
      return Array(n).fill(1)
  }
}

export function distributeHours(
  totalHours: number,
  weekStarts: Date[],
  rule: DistributionRule,
  manualDistJson?: { weekStart: string; pct: number }[] | null,
): { weekStart: Date; hours: number }[] {
  const n = weekStarts.length
  if (n === 0) return []

  let manualPcts: number[] | undefined
  if (rule === 'manual' && manualDistJson?.length) {
    const pctMap = new Map(manualDistJson.map(m => [m.weekStart, m.pct]))
    manualPcts = weekStarts.map(w => pctMap.get(w.toISOString().split('T')[0]) ?? 0)
  }

  const weights = computeWeights(n, rule, manualPcts)
  const totalWeight = weights.reduce((a, b) => a + b, 0)
  if (totalWeight === 0) return weekStarts.map(w => ({ weekStart: w, hours: 0 }))

  const result = weekStarts.map((w, i) => ({
    weekStart: w,
    hours: Math.round((weights[i] / totalWeight) * totalHours * 100) / 100,
  }))

  // Fix rounding error on last period
  const allocated = result.reduce((s, r) => s + r.hours, 0)
  const diff = Math.round((totalHours - allocated) * 100) / 100
  if (diff !== 0 && result.length > 0) result[result.length - 1].hours += diff

  return result
}

// ── TaskRoleEffort CRUD ───────────────────────────────────────────────────────

export async function getTaskEffort(prisma: PrismaClient, taskId: string, orgId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { project: { select: { organizationId: true } } },
  })
  if (!task || task.project.organizationId !== orgId) throw { statusCode: 404, message: 'Задача не найдена' }

  const roleEfforts = await prisma.taskRoleEffort.findMany({
    where: { taskId },
    include: {
      role: { select: { id: true, name: true } },
      periods: { orderBy: { weekStart: 'asc' } },
    },
    orderBy: { createdAt: 'asc' },
  })

  return roleEfforts
}

export async function upsertRoleEffort(
  prisma: PrismaClient,
  taskId: string,
  orgId: string,
  data: z.infer<typeof UpsertRoleEffortSchema>,
) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { project: { select: { organizationId: true } } },
  })
  if (!task || task.project.organizationId !== orgId) throw { statusCode: 404, message: 'Задача не найдена' }

  const roleEffort = await prisma.taskRoleEffort.upsert({
    where: { taskId_roleId: { taskId, roleId: data.roleId } },
    create: {
      taskId,
      roleId: data.roleId,
      plannedHours: data.plannedHours,
      distribution: data.distribution as DistributionRule,
      manualDistJson: data.manualDistJson as any,
      note: data.note,
    },
    update: {
      plannedHours: data.plannedHours,
      distribution: data.distribution as DistributionRule,
      manualDistJson: data.manualDistJson as any,
      note: data.note,
    },
  })

  await regeneratePeriods(prisma, roleEffort.id, task.startDate, task.dueDate)
  return roleEffort
}

export async function deleteRoleEffort(prisma: PrismaClient, roleEffortId: string, orgId: string) {
  const effort = await prisma.taskRoleEffort.findUnique({
    where: { id: roleEffortId },
    include: { task: { include: { project: { select: { organizationId: true } } } } },
  })
  if (!effort || effort.task.project.organizationId !== orgId) throw { statusCode: 404, message: 'Не найдено' }
  await prisma.taskRoleEffort.delete({ where: { id: roleEffortId } })
}

// ── Period regeneration ───────────────────────────────────────────────────────

export async function regeneratePeriods(
  prisma: PrismaClient,
  roleEffortId: string,
  startDate: Date | null | undefined,
  endDate: Date | null | undefined,
) {
  const effort = await prisma.taskRoleEffort.findUnique({ where: { id: roleEffortId } })
  if (!effort) return

  // Without dates we can't distribute — clear existing periods
  if (!startDate || !endDate) {
    await prisma.taskEffortPeriod.deleteMany({ where: { roleEffortId } })
    return
  }

  const weekStarts = getWeekStarts(new Date(startDate), new Date(endDate))
  const distribution = distributeHours(
    Number(effort.plannedHours),
    weekStarts,
    effort.distribution,
    effort.manualDistJson as any,
  )

  // Rebuild periods
  await prisma.$transaction([
    prisma.taskEffortPeriod.deleteMany({ where: { roleEffortId } }),
    ...distribution.map(d =>
      prisma.taskEffortPeriod.create({
        data: {
          roleEffortId,
          taskId: effort.taskId,
          roleId: effort.roleId,
          weekStart: d.weekStart,
          plannedHours: d.hours,
        },
      }),
    ),
  ])
}

/** Called when a task's start/due dates change */
export async function recalculateAllPeriodsForTask(
  prisma: PrismaClient,
  taskId: string,
  startDate: Date | null | undefined,
  dueDate: Date | null | undefined,
) {
  const efforts = await prisma.taskRoleEffort.findMany({ where: { taskId } })
  for (const e of efforts) {
    await regeneratePeriods(prisma, e.id, startDate, dueDate)
  }
}

// ── Time entries ──────────────────────────────────────────────────────────────

export async function upsertTimeEntry(
  prisma: PrismaClient,
  userId: string,
  orgId: string,
  data: z.infer<typeof UpsertTimeEntrySchema>,
) {
  const task = await prisma.task.findUnique({
    where: { id: data.taskId },
    include: { project: { select: { organizationId: true } } },
  })
  if (!task || task.project.organizationId !== orgId) throw { statusCode: 404, message: 'Задача не найдена' }

  if (data.hours === 0) {
    // Delete if zero hours
    await prisma.timeEntry.deleteMany({
      where: { taskId: data.taskId, userId, date: new Date(data.date) },
    })
    return null
  }

  return prisma.timeEntry.upsert({
    where: { taskId_userId_date: { taskId: data.taskId, userId, date: new Date(data.date) } },
    create: { taskId: data.taskId, userId, date: new Date(data.date), hours: data.hours, note: data.note },
    update: { hours: data.hours, note: data.note },
  })
}

export async function getTimeEntries(
  prisma: PrismaClient,
  orgId: string,
  opts: { taskId?: string; userId?: string; from?: string; to?: string },
) {
  const where: any = {}

  if (opts.taskId) where.taskId = opts.taskId
  if (opts.userId) where.userId = opts.userId
  if (opts.from || opts.to) {
    where.date = {}
    if (opts.from) where.date.gte = new Date(opts.from)
    if (opts.to) where.date.lte = new Date(opts.to)
  }

  // Filter by org via task.project
  where.task = { project: { organizationId: orgId } }

  return prisma.timeEntry.findMany({
    where,
    include: {
      user: { select: { id: true, fullName: true, orgRoleId: true } },
      task: { select: { id: true, title: true, projectId: true } },
    },
    orderBy: [{ date: 'asc' }, { userId: 'asc' }],
  })
}

export async function deleteTimeEntry(prisma: PrismaClient, id: string, userId: string, orgId: string) {
  const entry = await prisma.timeEntry.findUnique({
    where: { id },
    include: { task: { include: { project: { select: { organizationId: true } } } } },
  })
  if (!entry || entry.task.project.organizationId !== orgId) throw { statusCode: 404, message: 'Не найдено' }
  if (entry.userId !== userId) throw { statusCode: 403, message: 'Нет доступа' }
  await prisma.timeEntry.delete({ where: { id } })
}

// ── Resource load view ────────────────────────────────────────────────────────

export type ResourceLoadResult = {
  weeks: string[]
  byRole: RoleLoadRow[]
  byUser: UserLoadRow[]
}

type RoleLoadRow = {
  roleId: string
  roleName: string
  weeks: { weekStart: string; plannedHours: number; actualHours: number }[]
  totalPlanned: number
  totalActual: number
}

type UserLoadRow = {
  userId: string
  fullName: string
  roleId: string | null
  roleName: string | null
  dailyCapacityHours: number
  weeks: { weekStart: string; actualHours: number; capacityHours: number; overloaded: boolean }[]
  totalActual: number
}

export async function getResourceLoad(
  prisma: PrismaClient,
  orgId: string,
  projectId: string | undefined,
  from: string,
  to: string,
): Promise<ResourceLoadResult> {
  const fromDate = new Date(from)
  const toDate = new Date(to)

  const taskFilter = projectId
    ? { project: { organizationId: orgId, id: projectId } }
    : { project: { organizationId: orgId } }

  // Role-level planned periods
  const periods = await prisma.taskEffortPeriod.findMany({
    where: {
      weekStart: { gte: fromDate, lte: toDate },
      task: taskFilter,
    },
    include: { role: { select: { id: true, name: true } } },
  })

  // Actual time entries (aggregated by user+week)
  const timeEntries = await prisma.timeEntry.findMany({
    where: {
      date: { gte: fromDate, lte: toDate },
      task: taskFilter,
    },
    include: {
      user: { select: { id: true, fullName: true, orgRoleId: true, dailyCapacityHours: true, orgRole: { select: { id: true, name: true } } } },
    },
  })

  // Build week list
  const allWeeks = getWeekStarts(fromDate, toDate).map(w => w.toISOString().split('T')[0])

  // By role — aggregate planned
  const roleMap = new Map<string, { name: string; planned: Map<string, number>; actual: Map<string, number> }>()

  for (const p of periods) {
    const wk = p.weekStart.toISOString().split('T')[0]
    if (!roleMap.has(p.roleId)) roleMap.set(p.roleId, { name: p.role.name, planned: new Map(), actual: new Map() })
    const row = roleMap.get(p.roleId)!
    row.planned.set(wk, (row.planned.get(wk) ?? 0) + Number(p.plannedHours))
  }

  // By role — aggregate actual (via user's orgRole)
  for (const e of timeEntries) {
    if (!e.user.orgRoleId) continue
    const wk = getMondayOf(e.date).toISOString().split('T')[0]
    if (!roleMap.has(e.user.orgRoleId)) {
      roleMap.set(e.user.orgRoleId, {
        name: e.user.orgRole?.name ?? '—',
        planned: new Map(),
        actual: new Map(),
      })
    }
    const row = roleMap.get(e.user.orgRoleId)!
    row.actual.set(wk, (row.actual.get(wk) ?? 0) + Number(e.hours))
  }

  const byRole: RoleLoadRow[] = [...roleMap.entries()].map(([roleId, data]) => {
    const weeks = allWeeks.map(wk => ({
      weekStart: wk,
      plannedHours: data.planned.get(wk) ?? 0,
      actualHours: data.actual.get(wk) ?? 0,
    }))
    return {
      roleId,
      roleName: data.name,
      weeks,
      totalPlanned: weeks.reduce((s, w) => s + w.plannedHours, 0),
      totalActual: weeks.reduce((s, w) => s + w.actualHours, 0),
    }
  })

  // By user — actual and capacity
  const userMap = new Map<string, {
    fullName: string
    roleId: string | null
    roleName: string | null
    dailyCapacityHours: number
    actual: Map<string, number>
  }>()

  for (const e of timeEntries) {
    if (!userMap.has(e.userId)) {
      userMap.set(e.userId, {
        fullName: e.user.fullName,
        roleId: e.user.orgRoleId,
        roleName: e.user.orgRole?.name ?? null,
        dailyCapacityHours: Number(e.user.dailyCapacityHours),
        actual: new Map(),
      })
    }
    const wk = getMondayOf(e.date).toISOString().split('T')[0]
    const row = userMap.get(e.userId)!
    row.actual.set(wk, (row.actual.get(wk) ?? 0) + Number(e.hours))
  }

  const workDaysPerWeek = 5
  const byUser: UserLoadRow[] = [...userMap.entries()].map(([userId, data]) => {
    const capacityPerWeek = data.dailyCapacityHours * workDaysPerWeek
    const weeks = allWeeks.map(wk => {
      const actualHours = data.actual.get(wk) ?? 0
      return { weekStart: wk, actualHours, capacityHours: capacityPerWeek, overloaded: actualHours > capacityPerWeek }
    })
    return {
      userId,
      fullName: data.fullName,
      roleId: data.roleId,
      roleName: data.roleName,
      dailyCapacityHours: data.dailyCapacityHours,
      weeks,
      totalActual: weeks.reduce((s, w) => s + w.actualHours, 0),
    }
  })

  return { weeks: allWeeks, byRole, byUser }
}
