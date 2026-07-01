import { PrismaClient, Prisma } from '@prisma/client'
import { createNotification } from '../notifications/notifications.service'
import { sendProjectDelegatedEmail } from '../../utils/email'

const PAGE_SIZE = 20

// ─── Types ────────────────────────────────────────────────────────────────────

interface ListFilters {
  statusId?: string
  ownerId?: string
  clientId?: string
  search?: string
  archived?: boolean
}

interface TaskStats {
  totalTasks: number
  doneTasks: number
  overdueTasks: number
  totalEffortHours: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildWhere(orgId: string, f: ListFilters): Prisma.ProjectWhereInput {
  return {
    organizationId: orgId,
    isArchived: f.archived ?? false,
    ...(f.statusId ? { statusId: f.statusId } : {}),
    ...(f.ownerId ? { ownerId: f.ownerId } : {}),
    ...(f.clientId ? { clientId: f.clientId } : {}),
    ...(f.search
      ? { name: { contains: f.search, mode: Prisma.QueryMode.insensitive } }
      : {}),
  }
}

async function fetchTaskStats(
  prisma: PrismaClient,
  projectIds: string[],
): Promise<Record<string, TaskStats>> {
  if (!projectIds.length) return {}

  const now = new Date()

  const [byStatus, overdue, effort] = await Promise.all([
    prisma.task.groupBy({
      by: ['projectId', 'status'],
      where: { projectId: { in: projectIds } },
      _count: { id: true },
    }),
    prisma.task.groupBy({
      by: ['projectId'],
      where: {
        projectId: { in: projectIds },
        dueDate: { lt: now },
        status: { notIn: ['done', 'cancelled'] },
      },
      _count: { id: true },
    }),
    prisma.task.groupBy({
      by: ['projectId'],
      where: { projectId: { in: projectIds } },
      _sum: { effortHours: true },
    }),
  ])

  const map: Record<string, TaskStats> = {}
  const ensure = (id: string) => {
    if (!map[id]) map[id] = { totalTasks: 0, doneTasks: 0, overdueTasks: 0, totalEffortHours: 0 }
  }

  for (const row of byStatus) {
    ensure(row.projectId)
    map[row.projectId].totalTasks += row._count.id
    if (row.status === 'done') map[row.projectId].doneTasks += row._count.id
  }
  for (const row of overdue) {
    ensure(row.projectId)
    map[row.projectId].overdueTasks = row._count.id
  }
  for (const row of effort) {
    ensure(row.projectId)
    map[row.projectId].totalEffortHours = Number(row._sum.effortHours ?? 0)
  }

  return map
}

async function fetchMemberCounts(
  prisma: PrismaClient,
  projectIds: string[],
): Promise<Record<string, number>> {
  if (!projectIds.length) return {}
  const rows = await prisma.projectMember.groupBy({
    by: ['projectId'],
    where: { projectId: { in: projectIds } },
    _count: { userId: true },
  })
  return Object.fromEntries(rows.map(r => [r.projectId, r._count.userId]))
}

function fmtProject(
  p: any,
  stats: TaskStats,
  membersCount: number,
) {
  const total = stats.totalTasks
  const done = stats.doneTasks
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    startDate: p.startDate ? (p.startDate as Date).toISOString().slice(0, 10) : null,
    endDate: p.endDate ? (p.endDate as Date).toISOString().slice(0, 10) : null,
    isArchived: p.isArchived,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    clientId: p.client?.id ?? null,
    clientName: p.client?.name ?? null,
    statusId: p.status?.id ?? null,
    statusName: p.status?.name ?? null,
    statusColor: p.status?.color ?? null,
    ownerId: p.owner?.id ?? null,
    ownerName: p.owner?.fullName ?? null,
    kpi: {
      totalTasks: total,
      doneTasks: done,
      overdueTasks: stats.overdueTasks,
      completionPct: total > 0 ? Math.round((done / total) * 100) : 0,
      totalEffortHours: stats.totalEffortHours,
      membersCount,
    },
  }
}

const projectInclude = {
  client: { select: { id: true, name: true } },
  status: { select: { id: true, name: true, color: true } },
  owner: { select: { id: true, fullName: true } },
} as const

// ─── Access check ─────────────────────────────────────────────────────────────

export async function assertProjectAccess(
  prisma: PrismaClient,
  orgId: string,
  projectId: string,
  userId: string,
  isAdmin: boolean,
  requiredRole?: 'admin' | 'owner',
) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId: orgId },
    select: { id: true, isArchived: true, ownerId: true },
  })
  if (!project) throw { statusCode: 404, message: 'Проект не найден' }

  if (isAdmin) return project

  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  })
  if (!membership) throw { statusCode: 403, message: 'Нет доступа к проекту' }

  if (requiredRole === 'owner' && membership.role !== 'owner') {
    throw { statusCode: 403, message: 'Требуется роль владельца проекта' }
  }
  if (requiredRole === 'admin' && !['owner', 'admin'].includes(membership.role)) {
    throw { statusCode: 403, message: 'Требуется роль администратора проекта' }
  }

  return project
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function listProjects(
  prisma: PrismaClient,
  orgId: string,
  filters: ListFilters,
  page = 1,
) {
  const where = buildWhere(orgId, filters)

  const [items, total] = await Promise.all([
    prisma.project.findMany({
      where,
      include: projectInclude,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.project.count({ where }),
  ])

  const ids = items.map(p => p.id)
  const [taskStats, memberCounts] = await Promise.all([
    fetchTaskStats(prisma, ids),
    fetchMemberCounts(prisma, ids),
  ])

  return {
    items: items.map(p =>
      fmtProject(p, taskStats[p.id] ?? { totalTasks: 0, doneTasks: 0, overdueTasks: 0, totalEffortHours: 0 }, memberCounts[p.id] ?? 0),
    ),
    total,
    page,
    pages: Math.ceil(total / PAGE_SIZE),
  }
}

export async function getProjectAggregates(
  prisma: PrismaClient,
  orgId: string,
  filters: ListFilters,
) {
  const where = buildWhere(orgId, filters)

  const projects = await prisma.project.findMany({
    where,
    select: {
      id: true,
      ownerId: true,
      statusId: true,
      clientId: true,
      owner: { select: { id: true, fullName: true } },
      status: { select: { id: true, name: true, color: true } },
      client: { select: { id: true, name: true } },
    },
  })

  const ids = projects.map(p => p.id)
  const taskStats = await fetchTaskStats(prisma, ids)

  // Build totals
  let totalTasks = 0, doneTasks = 0, overdueTasks = 0, totalEffortHours = 0
  for (const s of Object.values(taskStats)) {
    totalTasks += s.totalTasks
    doneTasks += s.doneTasks
    overdueTasks += s.overdueTasks
    totalEffortHours += s.totalEffortHours
  }

  // Group by owner
  const ownerMap = new Map<string | null, any>()
  for (const p of projects) {
    const key = p.ownerId ?? '__none__'
    if (!ownerMap.has(key)) {
      ownerMap.set(key, {
        id: p.owner?.id ?? null,
        name: p.owner?.fullName ?? 'Не назначен',
        projectCount: 0, totalTasks: 0, doneTasks: 0, overdueTasks: 0, totalEffortHours: 0,
      })
    }
    const g = ownerMap.get(key)!
    const s = taskStats[p.id] ?? { totalTasks: 0, doneTasks: 0, overdueTasks: 0, totalEffortHours: 0 }
    g.projectCount++; g.totalTasks += s.totalTasks; g.doneTasks += s.doneTasks
    g.overdueTasks += s.overdueTasks; g.totalEffortHours += s.totalEffortHours
  }

  // Group by status
  const statusMap = new Map<string | null, any>()
  for (const p of projects) {
    const key = p.statusId ?? '__none__'
    if (!statusMap.has(key)) {
      statusMap.set(key, {
        id: p.status?.id ?? null,
        name: p.status?.name ?? 'Без статуса',
        color: p.status?.color ?? null,
        projectCount: 0, totalTasks: 0, doneTasks: 0, overdueTasks: 0, totalEffortHours: 0,
      })
    }
    const g = statusMap.get(key)!
    const s = taskStats[p.id] ?? { totalTasks: 0, doneTasks: 0, overdueTasks: 0, totalEffortHours: 0 }
    g.projectCount++; g.totalTasks += s.totalTasks; g.doneTasks += s.doneTasks
    g.overdueTasks += s.overdueTasks; g.totalEffortHours += s.totalEffortHours
  }

  // Group by client
  const clientMap = new Map<string | null, any>()
  for (const p of projects) {
    const key = p.clientId ?? '__none__'
    if (!clientMap.has(key)) {
      clientMap.set(key, {
        id: p.client?.id ?? null,
        name: p.client?.name ?? 'Без клиента',
        projectCount: 0, totalTasks: 0, doneTasks: 0, overdueTasks: 0, totalEffortHours: 0,
      })
    }
    const g = clientMap.get(key)!
    const s = taskStats[p.id] ?? { totalTasks: 0, doneTasks: 0, overdueTasks: 0, totalEffortHours: 0 }
    g.projectCount++; g.totalTasks += s.totalTasks; g.doneTasks += s.doneTasks
    g.overdueTasks += s.overdueTasks; g.totalEffortHours += s.totalEffortHours
  }

  return {
    totals: {
      projectCount: projects.length,
      totalTasks,
      doneTasks,
      overdueTasks,
      completionPct: totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0,
      totalEffortHours,
    },
    byOwner: Array.from(ownerMap.values()),
    byStatus: Array.from(statusMap.values()),
    byClient: Array.from(clientMap.values()),
  }
}

export async function getProject(
  prisma: PrismaClient,
  orgId: string,
  projectId: string,
) {
  const p = await prisma.project.findFirst({
    where: { id: projectId, organizationId: orgId },
    include: {
      ...projectInclude,
      members: {
        include: { user: { select: { id: true, fullName: true, email: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
  })
  if (!p) throw { statusCode: 404, message: 'Проект не найден' }

  const [taskStats, memberCounts] = await Promise.all([
    fetchTaskStats(prisma, [projectId]),
    fetchMemberCounts(prisma, [projectId]),
  ])

  return {
    ...fmtProject(p, taskStats[projectId] ?? { totalTasks: 0, doneTasks: 0, overdueTasks: 0, totalEffortHours: 0 }, memberCounts[projectId] ?? 0),
    members: p.members.map(m => ({
      userId: m.userId,
      fullName: m.user.fullName,
      email: m.user.email,
      role: m.role,
      createdAt: m.createdAt.toISOString(),
    })),
  }
}

export async function createProject(
  prisma: PrismaClient,
  orgId: string,
  userId: string,
  data: {
    name: string
    description?: string
    startDate?: string
    endDate?: string
    clientId?: string
    newClientName?: string
    statusId?: string
    ownerId?: string
  },
) {
  // Resolve or create client
  let clientId = data.clientId ?? null
  if (!clientId && data.newClientName) {
    const client = await prisma.client.create({
      data: { organizationId: orgId, name: data.newClientName },
    })
    clientId = client.id
  }

  // Resolve status: use provided or fall back to "Новый"
  let statusId = data.statusId ?? null
  if (!statusId) {
    const novyj = await prisma.projectStatus.findFirst({
      where: { organizationId: orgId, name: 'Новый' },
    })
    statusId = novyj?.id ?? null
  }

  const ownerId = data.ownerId ?? userId

  const project = await prisma.project.create({
    data: {
      organizationId: orgId,
      name: data.name,
      description: data.description ?? null,
      startDate: data.startDate ? new Date(data.startDate) : null,
      endDate: data.endDate ? new Date(data.endDate) : null,
      clientId,
      statusId,
      ownerId,
      createdBy: userId,
      members: {
        create: { userId: ownerId, role: 'owner' },
      },
    },
    include: projectInclude,
  })

  // If creator != owner, also add creator as admin (has edit rights)
  if (ownerId !== userId) {
    await prisma.projectMember.upsert({
      where: { projectId_userId: { projectId: project.id, userId } },
      create: { projectId: project.id, userId, role: 'admin' },
      update: {},
    })
  }

  return fmtProject(project, { totalTasks: 0, doneTasks: 0, overdueTasks: 0, totalEffortHours: 0 }, 1)
}

export async function updateProject(
  prisma: PrismaClient,
  orgId: string,
  projectId: string,
  data: {
    name?: string
    description?: string | null
    startDate?: string | null
    endDate?: string | null
    clientId?: string | null
    newClientName?: string
    statusId?: string | null
    ownerId?: string | null
  },
) {
  // Resolve inline client creation
  let clientId = data.clientId
  if (data.newClientName && clientId === undefined) {
    const client = await prisma.client.create({
      data: { organizationId: orgId, name: data.newClientName },
    })
    clientId = client.id
  }

  const updated = await prisma.project.update({
    where: { id: projectId },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.startDate !== undefined ? { startDate: data.startDate ? new Date(data.startDate) : null } : {}),
      ...(data.endDate !== undefined ? { endDate: data.endDate ? new Date(data.endDate) : null } : {}),
      ...(clientId !== undefined ? { clientId } : {}),
      ...(data.statusId !== undefined ? { statusId: data.statusId } : {}),
      ...(data.ownerId !== undefined ? { ownerId: data.ownerId } : {}),
    },
    include: projectInclude,
  })

  const [taskStats, memberCounts] = await Promise.all([
    fetchTaskStats(prisma, [projectId]),
    fetchMemberCounts(prisma, [projectId]),
  ])
  return fmtProject(updated, taskStats[projectId] ?? { totalTasks: 0, doneTasks: 0, overdueTasks: 0, totalEffortHours: 0 }, memberCounts[projectId] ?? 0)
}

export async function archiveProject(
  prisma: PrismaClient,
  orgId: string,
  projectId: string,
  userId: string,
  isAdmin: boolean,
) {
  await assertProjectAccess(prisma, orgId, projectId, userId, isAdmin, 'admin')

  await prisma.project.update({
    where: { id: projectId },
    data: { isArchived: true },
  })
}

export async function unarchiveProject(
  prisma: PrismaClient,
  orgId: string,
  projectId: string,
  userId: string,
  isAdmin: boolean,
) {
  await assertProjectAccess(prisma, orgId, projectId, userId, isAdmin, 'admin')

  await prisma.project.update({
    where: { id: projectId },
    data: { isArchived: false },
  })
}

// ─── Delegation ───────────────────────────────────────────────────────────────

export async function delegateProject(
  prisma: PrismaClient,
  orgId: string,
  projectId: string,
  currentUserId: string,
  isAdmin: boolean,
  newOwnerId: string,
) {
  const project = await assertProjectAccess(prisma, orgId, projectId, currentUserId, isAdmin, 'owner')

  // Verify new owner is in org
  const newOwner = await prisma.user.findFirst({
    where: { id: newOwnerId, organizationId: orgId, isActive: true },
    select: { id: true, fullName: true, email: true },
  })
  if (!newOwner) throw { statusCode: 404, message: 'Пользователь не найден в организации' }

  const oldOwnerId = (project as any).ownerId as string | null

  await prisma.$transaction([
    // Update project owner
    prisma.project.update({ where: { id: projectId }, data: { ownerId: newOwnerId } }),
    // Set old owner to admin (if was owner member)
    ...(oldOwnerId
      ? [prisma.projectMember.upsert({
          where: { projectId_userId: { projectId, userId: oldOwnerId } },
          create: { projectId, userId: oldOwnerId, role: 'admin' },
          update: { role: 'admin' },
        })]
      : []),
    // Set new owner in project_members
    prisma.projectMember.upsert({
      where: { projectId_userId: { projectId, userId: newOwnerId } },
      create: { projectId, userId: newOwnerId, role: 'owner' },
      update: { role: 'owner' },
    }),
  ])

  // Notifications
  const currentUser = await prisma.user.findUnique({
    where: { id: currentUserId },
    select: { fullName: true },
  })
  const projectData = await prisma.project.findUnique({
    where: { id: projectId },
    select: { name: true },
  })

  const payload = {
    projectId,
    projectName: projectData?.name ?? '',
    delegatedBy: currentUser?.fullName ?? '',
    role: 'owner',
  }

  await Promise.all([
    createNotification(prisma, { userId: newOwnerId, orgId, type: 'project_delegated', payload }),
    sendProjectDelegatedEmail(newOwner.email, payload).catch(console.error),
  ])
}

// ─── Project Members ──────────────────────────────────────────────────────────

export async function listMembers(prisma: PrismaClient, projectId: string) {
  const members = await prisma.projectMember.findMany({
    where: { projectId },
    include: { user: { select: { id: true, fullName: true, email: true } } },
    orderBy: { createdAt: 'asc' },
  })
  return members.map(m => ({
    userId: m.userId,
    fullName: m.user.fullName,
    email: m.user.email,
    role: m.role,
    createdAt: m.createdAt.toISOString(),
  }))
}

export async function addMember(
  prisma: PrismaClient,
  orgId: string,
  projectId: string,
  userId: string,
  role: 'admin' | 'member',
) {
  const user = await prisma.user.findFirst({
    where: { id: userId, organizationId: orgId, isActive: true },
    select: { id: true, fullName: true, email: true },
  })
  if (!user) throw { statusCode: 404, message: 'Пользователь не найден в организации' }

  const existing = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  })
  if (existing) throw { statusCode: 409, message: 'Пользователь уже участник проекта' }

  const member = await prisma.projectMember.create({
    data: { projectId, userId, role },
    include: { user: { select: { id: true, fullName: true, email: true } } },
  })

  return {
    userId: member.userId,
    fullName: member.user.fullName,
    email: member.user.email,
    role: member.role,
    createdAt: member.createdAt.toISOString(),
  }
}

export async function updateMember(
  prisma: PrismaClient,
  projectId: string,
  targetUserId: string,
  role: 'admin' | 'member',
) {
  const existing = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: targetUserId } },
  })
  if (!existing) throw { statusCode: 404, message: 'Участник не найден' }
  if (existing.role === 'owner') throw { statusCode: 400, message: 'Нельзя изменить роль владельца. Используйте делегирование.' }

  const updated = await prisma.projectMember.update({
    where: { projectId_userId: { projectId, userId: targetUserId } },
    data: { role },
    include: { user: { select: { id: true, fullName: true, email: true } } },
  })
  return {
    userId: updated.userId,
    fullName: updated.user.fullName,
    email: updated.user.email,
    role: updated.role,
    createdAt: updated.createdAt.toISOString(),
  }
}

export async function removeMember(
  prisma: PrismaClient,
  projectId: string,
  targetUserId: string,
) {
  const existing = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: targetUserId } },
  })
  if (!existing) throw { statusCode: 404, message: 'Участник не найден' }
  if (existing.role === 'owner') throw { statusCode: 400, message: 'Нельзя удалить владельца проекта' }

  await prisma.projectMember.delete({
    where: { projectId_userId: { projectId, userId: targetUserId } },
  })
}
