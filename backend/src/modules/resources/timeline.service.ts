import { PrismaClient } from '@prisma/client'
import { getOrgWorkConfig, getUserWorkConfig, isWorkDay } from './calendar.service'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DayLoad {
  date: string
  capacityHours: number
  assignedHours: number
  taskCount: number
  loadPct: number
  isOverloaded: boolean      // by hours
  isParallelOverloaded: boolean // by task count (>1 same day)
}

export interface UserTimelineRow {
  userId: string
  fullName: string
  capacity: number // hours/day
  days: DayLoad[]
  tasks?: TaskSlot[] // populated when expanded
}

export interface TaskSlot {
  taskId: string
  taskTitle: string
  projectId: string
  projectName: string
  startDate: string | null
  dueDate: string | null
  effortHours: number | null
  status: string
}

export interface ProjectTimelineRow {
  projectId: string
  projectName: string
  days: DayLoad[]
  members?: UserTimelineRow[]
}

// ── Main timeline query ───────────────────────────────────────────────────────

export async function getResourceTimeline(
  prisma: PrismaClient,
  orgId: string,
  userId: string,
  isAdmin: boolean,
  orgRoleId: string | null,
  from: string,
  to: string,
  groupBy: 'user' | 'project',
  projectId?: string,
) {
  const fromDate = new Date(from)
  const toDate = new Date(to)

  // Determine which users are visible
  const visibleUserIds = await getVisibleUserIds(prisma, orgId, userId, isAdmin, orgRoleId)

  // Get org-level work config (base)
  const orgConfig = await getOrgWorkConfig(prisma, orgId)

  // Get all assigned tasks in range
  const tasks = await prisma.task.findMany({
    where: {
      project: { organizationId: orgId },
      assigneeId: { in: visibleUserIds },
      ...(projectId ? { projectId } : {}),
      OR: [
        { startDate: { lte: toDate }, dueDate: { gte: fromDate } },
        { startDate: { gte: fromDate, lte: toDate } },
        { dueDate: { gte: fromDate, lte: toDate } },
      ],
    },
    select: {
      id: true,
      title: true,
      projectId: true,
      project: { select: { name: true } },
      assigneeId: true,
      startDate: true,
      dueDate: true,
      effortHours: true,
      status: true,
    },
  })

  // Get user info
  const users = await prisma.user.findMany({
    where: { id: { in: visibleUserIds } },
    select: { id: true, fullName: true, dailyCapacityHours: true, workSchedule: true },
  })

  // Get absences in range
  const absences = await prisma.absence.findMany({
    where: {
      userId: { in: visibleUserIds },
      startDate: { lte: toDate },
      endDate: { gte: fromDate },
    },
    select: { userId: true, startDate: true, endDate: true, type: true },
  })

  // Build date array
  const dates: Date[] = []
  for (let d = new Date(fromDate); d <= toDate; d.setDate(d.getDate() + 1)) {
    dates.push(new Date(d))
  }

  if (groupBy === 'user') {
    return buildUserTimeline(tasks, users, absences, dates, orgConfig)
  } else {
    return buildProjectTimeline(tasks, users, absences, dates, orgConfig, prisma, orgId)
  }
}

async function buildProjectTimeline(
  tasks: any[],
  users: any[],
  absences: any[],
  dates: Date[],
  orgConfig: any,
  prisma: PrismaClient,
  orgId: string,
) {
  const projects = await prisma.project.findMany({
    where: { organizationId: orgId, id: { in: [...new Set(tasks.map(t => t.projectId))] } },
    select: { id: true, name: true },
  })

  const userMap = new Map(users.map(u => [u.id, u]))
  const rows: ProjectTimelineRow[] = projects.map(p => {
    const projectTasks = tasks.filter(t => t.projectId === p.id)
    const projectUserIds = [...new Set(projectTasks.map((t: any) => t.assigneeId).filter(Boolean))] as string[]
    const projectUsers = projectUserIds.map(uid => userMap.get(uid)).filter(Boolean)

    const days = dates.map(d => buildDayLoad(d, projectTasks, projectUsers, absences, orgConfig))

    return {
      projectId: p.id,
      projectName: p.name,
      days,
    }
  })

  return { groupBy: 'project', rows }
}

function buildUserTimeline(
  tasks: any[],
  users: any[],
  absences: any[],
  dates: Date[],
  orgConfig: any,
) {
  const rows: UserTimelineRow[] = users.map(user => {
    const userTasks = tasks.filter(t => t.assigneeId === user.id)
    const capacity = Number(user.dailyCapacityHours ?? 8)

    const days = dates.map(d => buildDayLoad(d, userTasks, [user], absences, orgConfig, capacity))

    const taskSlots: TaskSlot[] = userTasks.map((t: any) => ({
      taskId: t.id,
      taskTitle: t.title,
      projectId: t.projectId,
      projectName: t.project?.name ?? '',
      startDate: t.startDate?.toISOString().slice(0, 10) ?? null,
      dueDate: t.dueDate?.toISOString().slice(0, 10) ?? null,
      effortHours: t.effortHours !== null ? Number(t.effortHours) : null,
      status: t.status,
    }))

    return {
      userId: user.id,
      fullName: user.fullName,
      capacity,
      days,
      tasks: taskSlots,
    }
  })

  return { groupBy: 'user', rows }
}

function buildDayLoad(
  date: Date,
  tasks: any[],
  users: any[],
  absences: any[],
  orgConfig: any,
  defaultCapacity?: number,
): DayLoad {
  const dateStr = date.toISOString().slice(0, 10)
  const isWork = isWorkDay(date, orgConfig)
  const capacity = isWork ? (defaultCapacity ?? 8) : 0

  // Check absences
  const onAbsence = absences.some(a => {
    const start = a.startDate.toISOString().slice(0, 10)
    const end = a.endDate.toISOString().slice(0, 10)
    return users.some(u => u.id === a.userId) && dateStr >= start && dateStr <= end
  })

  if (onAbsence) {
    return { date: dateStr, capacityHours: 0, assignedHours: 0, taskCount: 0, loadPct: 0, isOverloaded: false, isParallelOverloaded: false }
  }

  // Tasks active on this date
  const activeTasks = tasks.filter(t => {
    const start = t.startDate ? t.startDate.toISOString().slice(0, 10) : null
    const due = t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null
    if (!start && !due) return false
    if (start && due) return dateStr >= start && dateStr <= due
    if (start) return dateStr >= start
    return dateStr <= due!
  })

  // Distribute effortHours evenly across task duration
  let assignedHours = 0
  activeTasks.forEach(t => {
    if (t.effortHours) {
      const start = t.startDate ? new Date(t.startDate) : date
      const end = t.dueDate ? new Date(t.dueDate) : date
      const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1)
      assignedHours += Number(t.effortHours) / totalDays
    }
  })

  const loadPct = capacity > 0 ? Math.round((assignedHours / capacity) * 100) : 0

  return {
    date: dateStr,
    capacityHours: capacity,
    assignedHours: Math.round(assignedHours * 10) / 10,
    taskCount: activeTasks.length,
    loadPct,
    isOverloaded: assignedHours > capacity && capacity > 0,
    isParallelOverloaded: activeTasks.length > 1,
  }
}

// ── Visibility scope ──────────────────────────────────────────────────────────

async function getVisibleUserIds(
  prisma: PrismaClient,
  orgId: string,
  userId: string,
  isAdmin: boolean,
  orgRoleId: string | null,
): Promise<string[]> {
  if (isAdmin) {
    const all = await prisma.user.findMany({ where: { organizationId: orgId }, select: { id: true } })
    return all.map(u => u.id)
  }

  // Check team_manage permission (line manager → sees everyone)
  if (orgRoleId) {
    const perm = await prisma.rolePermission.findUnique({
      where: { roleId_permission: { roleId: orgRoleId, permission: 'team_manage' } },
    })
    if (perm) {
      const all = await prisma.user.findMany({ where: { organizationId: orgId }, select: { id: true } })
      return all.map(u => u.id)
    }
  }

  // Project manager → team members across owned projects
  const ownedProjects = await prisma.project.findMany({
    where: { organizationId: orgId, ownerId: userId },
    select: { id: true },
  })
  if (ownedProjects.length > 0) {
    const members = await prisma.projectMember.findMany({
      where: { projectId: { in: ownedProjects.map(p => p.id) } },
      select: { userId: true },
    })
    const ids = [...new Set([userId, ...members.map(m => m.userId)])]
    return ids
  }

  return [userId]
}
