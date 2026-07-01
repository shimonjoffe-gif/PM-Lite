import { PrismaClient, TaskStatus, TaskPriority, Prisma } from '@prisma/client'
import { createNotification } from '../notifications/notifications.service'

// ── Types ─────────────────────────────────────────────────────────────────────

interface TaskFilters {
  status?: TaskStatus
  priority?: TaskPriority
  assigneeId?: string
  search?: string
  my?: boolean
  overdue?: boolean
  dueDateFrom?: string
  dueDateTo?: string
  sortBy?: 'deadline_asc' | 'deadline_desc' | 'priority_desc'
  page?: number
  pageSize?: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const taskSelect = {
  id: true,
  projectId: true,
  parentId: true,
  parent: { select: { id: true, title: true } },
  boardColumnId: true,
  assigneeId: true,
  assignee: { select: { fullName: true } },
  createdBy: true,
  title: true,
  description: true,
  status: true,
  priority: true,
  taskType: true,
  effortHours: true,
  duration: true,
  startDate: true,
  dueDate: true,
  percentComplete: true,
  baselineStart: true,
  baselineFinish: true,
  constraintType: true,
  constraintDate: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { children: true } },
} satisfies Prisma.TaskSelect

function mapTask(t: any) {
  return {
    id: t.id,
    projectId: t.projectId,
    parentId: t.parentId ?? null,
    parentTitle: t.parent?.title ?? null,
    boardColumnId: t.boardColumnId,
    assigneeId: t.assigneeId,
    assigneeName: t.assignee?.fullName ?? null,
    createdBy: t.createdBy,
    title: t.title,
    description: t.description ?? null,
    status: t.status,
    priority: t.priority,
    effortHours: t.effortHours !== null ? Number(t.effortHours) : null,
    duration: t.duration ?? null,
    taskType: t.taskType ?? 'task',
    startDate: t.startDate ? t.startDate.toISOString().slice(0, 10) : null,
    dueDate: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null,
    percentComplete: t.percentComplete ?? 0,
    baselineStart: t.baselineStart ? t.baselineStart.toISOString().slice(0, 10) : null,
    baselineFinish: t.baselineFinish ? t.baselineFinish.toISOString().slice(0, 10) : null,
    constraintType: t.constraintType ?? null,
    constraintDate: t.constraintDate ? t.constraintDate.toISOString().slice(0, 10) : null,
    sortOrder: t.sortOrder,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    childCount: t._count?.children ?? 0,
  }
}

function buildTree(flat: ReturnType<typeof mapTask>[]) {
  const map = new Map<string, any>()
  flat.forEach(t => map.set(t.id, { ...t, children: [] }))
  const roots: any[] = []
  flat.forEach(t => {
    if (t.parentId && map.has(t.parentId)) {
      map.get(t.parentId)!.children.push(map.get(t.id))
    } else {
      roots.push(map.get(t.id))
    }
  })
  return roots
}

// ── Task CRUD ─────────────────────────────────────────────────────────────────

export async function getProjectTaskTree(
  prisma: PrismaClient,
  projectId: string,
  filters: TaskFilters,
) {
  const where: Prisma.TaskWhereInput = { projectId }
  if (filters.status) where.status = filters.status
  if (filters.priority) where.priority = filters.priority
  if (filters.assigneeId) where.assigneeId = filters.assigneeId
  if (filters.search) where.title = { contains: filters.search, mode: 'insensitive' }

  const rows = await prisma.task.findMany({
    where,
    select: taskSelect,
    orderBy: [{ parentId: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
  })
  const mapped = rows.map(mapTask)

  if (filters.search || filters.status || filters.priority || filters.assigneeId) {
    // In filtered mode return flat list (tree would be disconnected)
    return { tree: false, items: mapped }
  }
  return { tree: true, items: buildTree(mapped) }
}

export async function getProjectTasksFlat(
  prisma: PrismaClient,
  projectId: string,
  filters: TaskFilters,
) {
  const page = filters.page ?? 1
  const pageSize = filters.pageSize ?? 50
  const where: Prisma.TaskWhereInput = { projectId }
  if (filters.status) where.status = filters.status
  if (filters.priority) where.priority = filters.priority
  if (filters.assigneeId) where.assigneeId = filters.assigneeId
  if (filters.search) where.title = { contains: filters.search, mode: 'insensitive' }

  const [total, rows] = await Promise.all([
    prisma.task.count({ where }),
    prisma.task.findMany({
      where,
      select: taskSelect,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])
  return { items: rows.map(mapTask), total, page, pages: Math.ceil(total / pageSize) }
}

export async function getMyTasks(
  prisma: PrismaClient,
  userId: string,
  orgId: string,
  filters: TaskFilters,
) {
  const page = filters.page ?? 1
  const pageSize = filters.pageSize ?? 200
  const where: Prisma.TaskWhereInput = {
    project: { organizationId: orgId },
    OR: [
      { assigneeId: userId },
      { status: 'review', createdBy: userId },
    ],
  }
  if (filters.status) where.status = filters.status
  if (filters.priority) where.priority = filters.priority
  if (filters.search) where.title = { contains: filters.search, mode: 'insensitive' }

  if (filters.overdue) {
    where.dueDate = { lt: new Date() }
    where.status = { notIn: ['done', 'cancelled'] }
  } else if (filters.dueDateFrom || filters.dueDateTo) {
    const gte = filters.dueDateFrom ? new Date(filters.dueDateFrom) : undefined
    const lteRaw = filters.dueDateTo ? new Date(filters.dueDateTo) : undefined
    if (lteRaw) lteRaw.setHours(23, 59, 59, 999)
    where.dueDate = { gte, lte: lteRaw }
  }

  const orderBy: Prisma.TaskOrderByWithRelationInput[] =
    filters.sortBy === 'deadline_desc' ? [{ dueDate: { sort: 'desc', nulls: 'last' } }, { priority: 'desc' }]
    : filters.sortBy === 'priority_desc' ? [{ priority: 'desc' }, { dueDate: { sort: 'asc', nulls: 'last' } }]
    : [{ dueDate: { sort: 'asc', nulls: 'last' } }, { priority: 'desc' }, { createdAt: 'desc' }]

  const [total, rows] = await Promise.all([
    prisma.task.count({ where }),
    prisma.task.findMany({
      where,
      select: { ...taskSelect, project: { select: { id: true, name: true } } },
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])
  return {
    items: rows.map(r => ({ ...mapTask(r), projectName: (r as any).project?.name ?? null })),
    total,
    page,
    pages: Math.ceil(total / pageSize),
  }
}

export async function getTask(prisma: PrismaClient, taskId: string) {
  const t = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    select: taskSelect,
  })
  return mapTask(t)
}

export async function createTask(
  prisma: PrismaClient,
  projectId: string,
  createdBy: string,
  data: {
    title: string
    description?: string
    parentId?: string
    assigneeId?: string
    boardColumnId?: string
    status?: TaskStatus
    priority?: TaskPriority
    effortHours?: number
    duration?: number | null
    startDate?: string
    dueDate?: string
    constraintType?: string | null
    constraintDate?: string | null
    sortOrder?: number
    insertAfterId?: string | null
  },
) {
  // If placed in a board column that maps to a status, use that status
  let status = data.status
  if (!status && data.boardColumnId) {
    const col = await prisma.boardColumn.findUnique({
      where: { id: data.boardColumnId },
      select: { statusMapping: true },
    })
    if (col?.statusMapping) status = col.statusMapping
  }

  let sortOrder = data.sortOrder ?? 0

  if (data.insertAfterId) {
    const afterTask = await prisma.task.findUnique({
      where: { id: data.insertAfterId },
      select: { sortOrder: true, parentId: true },
    })
    if (afterTask) {
      sortOrder = afterTask.sortOrder + 1
      // Shift all siblings with sortOrder >= new position
      await prisma.task.updateMany({
        where: {
          projectId,
          parentId: afterTask.parentId,
          sortOrder: { gte: sortOrder },
        },
        data: { sortOrder: { increment: 1 } },
      })
    }
  }

  const t = await prisma.task.create({
    data: {
      projectId,
      parentId: data.parentId ?? null,
      assigneeId: data.assigneeId ?? null,
      boardColumnId: data.boardColumnId ?? null,
      createdBy,
      title: data.title,
      description: data.description,
      status: status ?? 'todo',
      priority: data.priority ?? 'medium',
      effortHours: data.effortHours ?? null,
      duration: data.duration ?? null,
      startDate: data.startDate ? new Date(data.startDate) : null,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      constraintType: (data.constraintType as any) ?? null,
      constraintDate: data.constraintDate ? new Date(data.constraintDate) : null,
      sortOrder,
    },
    select: taskSelect,
  })
  return mapTask(t)
}

export async function updateTask(
  prisma: PrismaClient,
  taskId: string,
  data: Partial<{
    title: string
    description: string
    parentId: string | null
    assigneeId: string | null
    boardColumnId: string | null
    status: TaskStatus
    priority: TaskPriority
    effortHours: number | null
    duration: number | null
    startDate: string | null
    dueDate: string | null
    percentComplete: number
    baselineStart: string | null
    baselineFinish: string | null
    constraintType: string | null
    constraintDate: string | null
    taskType: string
    sortOrder: number
  }>,
) {
  const updateData: Prisma.TaskUpdateInput = {}
  if (data.title !== undefined) updateData.title = data.title
  if (data.description !== undefined) updateData.description = data.description
  if ('parentId' in data) updateData.parent = data.parentId ? { connect: { id: data.parentId } } : { disconnect: true }
  if ('assigneeId' in data) updateData.assignee = data.assigneeId ? { connect: { id: data.assigneeId } } : { disconnect: true }
  if ('boardColumnId' in data) {
    updateData.boardColumn = data.boardColumnId ? { connect: { id: data.boardColumnId } } : { disconnect: true }
    // If moved to a column with statusMapping and no explicit status — apply mapping
    if (data.boardColumnId && data.status === undefined) {
      const col = await prisma.boardColumn.findUnique({
        where: { id: data.boardColumnId },
        select: { statusMapping: true },
      })
      if (col?.statusMapping) updateData.status = col.statusMapping
    }
  }
  if (data.status !== undefined) updateData.status = data.status
  if (data.priority !== undefined) updateData.priority = data.priority
  if ('effortHours' in data) updateData.effortHours = data.effortHours ?? null
  if ('duration' in data) updateData.duration = data.duration ?? null
  if ('startDate' in data) updateData.startDate = data.startDate ? new Date(data.startDate) : null
  if ('dueDate' in data) updateData.dueDate = data.dueDate ? new Date(data.dueDate) : null
  if (data.percentComplete !== undefined) updateData.percentComplete = data.percentComplete
  if ('baselineStart' in data) updateData.baselineStart = data.baselineStart ? new Date(data.baselineStart) : null
  if ('baselineFinish' in data) updateData.baselineFinish = data.baselineFinish ? new Date(data.baselineFinish) : null
  if ('constraintType' in data) updateData.constraintType = (data.constraintType as any) ?? null
  if ('constraintDate' in data) updateData.constraintDate = data.constraintDate ? new Date(data.constraintDate) : null
  if (data.taskType !== undefined) updateData.taskType = data.taskType as any
  if (data.sortOrder !== undefined) updateData.sortOrder = data.sortOrder
  updateData.updatedAt = new Date()

  const t = await prisma.task.update({ where: { id: taskId }, data: updateData, select: taskSelect })

  // Recalculate effort periods when dates change
  if ('startDate' in data || 'dueDate' in data) {
    const { recalculateAllPeriodsForTask } = await import('../effort/effort.service')
    await recalculateAllPeriodsForTask(
      prisma,
      taskId,
      t.startDate ? new Date(t.startDate) : null,
      t.dueDate ? new Date(t.dueDate) : null,
    )
  }

  return mapTask(t)
}

export async function moveTask(
  prisma: PrismaClient,
  taskId: string,
  parentId: string | null,
  sortOrder?: number,
) {
  const t = await prisma.task.update({
    where: { id: taskId },
    data: {
      parentId,
      sortOrder: sortOrder ?? 0,
      updatedAt: new Date(),
    },
    select: taskSelect,
  })
  return mapTask(t)
}

export async function deleteTask(prisma: PrismaClient, taskId: string) {
  // Cascade deletes children via DB constraint
  await prisma.task.delete({ where: { id: taskId } })
}

// ── Delegate subtree ──────────────────────────────────────────────────────────

async function collectDescendantIds(prisma: PrismaClient, taskId: string): Promise<string[]> {
  const children = await prisma.task.findMany({
    where: { parentId: taskId },
    select: { id: true },
  })
  const ids = [taskId]
  for (const child of children) {
    ids.push(...(await collectDescendantIds(prisma, child.id)))
  }
  return ids
}

export async function delegateSubtree(
  prisma: PrismaClient,
  taskId: string,
  newAssigneeId: string,
  delegatedBy: string,
  orgId: string,
) {
  const ids = await collectDescendantIds(prisma, taskId)
  await prisma.task.updateMany({
    where: { id: { in: ids } },
    data: { assigneeId: newAssigneeId, updatedAt: new Date() },
  })

  // Notify the new assignee
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { title: true } })
  const delegator = await prisma.user.findUnique({ where: { id: delegatedBy }, select: { fullName: true } })
  await createNotification(prisma, {
    userId: newAssigneeId,
    orgId,
    type: 'task_delegated',
    payload: {
      taskId,
      taskTitle: task?.title ?? '',
      delegatedBy: delegator?.fullName ?? '',
      subtreeSize: ids.length,
    },
  })
  return ids
}

// ── Status transition rules ───────────────────────────────────────────────────

export async function getStatusTransitions(prisma: PrismaClient, orgId: string) {
  const rows = await prisma.taskStatusTransition.findMany({
    where: { organizationId: orgId },
    orderBy: [{ fromStatus: 'asc' }, { toStatus: 'asc' }],
  })
  return rows.map(r => ({
    id: r.id,
    fromStatus: r.fromStatus,
    toStatus: r.toStatus,
    allowedOrgRoleIds: r.allowedOrgRoleIds as string[],
  }))
}

export async function upsertStatusTransition(
  prisma: PrismaClient,
  orgId: string,
  fromStatus: TaskStatus,
  toStatus: TaskStatus,
  allowedOrgRoleIds: string[],
) {
  return prisma.taskStatusTransition.upsert({
    where: { organizationId_fromStatus_toStatus: { organizationId: orgId, fromStatus, toStatus } },
    create: { organizationId: orgId, fromStatus, toStatus, allowedOrgRoleIds },
    update: { allowedOrgRoleIds },
  })
}

export async function deleteStatusTransition(prisma: PrismaClient, transitionId: string) {
  await prisma.taskStatusTransition.delete({ where: { id: transitionId } })
}

// Check if current user can change task status
export async function canChangeStatus(
  prisma: PrismaClient,
  orgId: string,
  orgRoleId: string | null,
  fromStatus: TaskStatus,
  toStatus: TaskStatus,
): Promise<boolean> {
  // Count total rules for this org
  const rulesCount = await prisma.taskStatusTransition.count({ where: { organizationId: orgId } })
  if (rulesCount === 0) return true // No rules = everything allowed

  const rule = await prisma.taskStatusTransition.findUnique({
    where: { organizationId_fromStatus_toStatus: { organizationId: orgId, fromStatus, toStatus } },
  })
  if (!rule) return false // Rules exist but this transition has no rule = forbidden

  const allowed = rule.allowedOrgRoleIds as string[]
  if (!allowed.length) return true // Rule exists but no role restriction = allowed for all
  if (!orgRoleId) return false
  return allowed.includes(orgRoleId)
}

// ── Board columns ─────────────────────────────────────────────────────────────

export async function getBoardColumns(prisma: PrismaClient, projectId: string) {
  const cols = await prisma.boardColumn.findMany({
    where: { projectId },
    orderBy: { sortOrder: 'asc' },
  })
  return cols.map(c => ({
    id: c.id,
    projectId: c.projectId,
    name: c.name,
    color: c.color ?? null,
    sortOrder: c.sortOrder,
    statusMapping: c.statusMapping ?? null,
  }))
}

export async function createBoardColumn(
  prisma: PrismaClient,
  projectId: string,
  data: { name: string; color?: string; sortOrder?: number; statusMapping?: TaskStatus },
) {
  const col = await prisma.boardColumn.create({
    data: {
      projectId,
      name: data.name,
      color: data.color ?? null,
      sortOrder: data.sortOrder ?? 0,
      statusMapping: data.statusMapping ?? null,
    },
  })
  return { id: col.id, projectId: col.projectId, name: col.name, color: col.color ?? null, sortOrder: col.sortOrder, statusMapping: col.statusMapping ?? null }
}

export async function updateBoardColumn(
  prisma: PrismaClient,
  columnId: string,
  data: Partial<{ name: string; color: string; sortOrder: number; statusMapping: TaskStatus | null }>,
) {
  const col = await prisma.boardColumn.update({
    where: { id: columnId },
    data,
  })
  return { id: col.id, projectId: col.projectId, name: col.name, color: col.color ?? null, sortOrder: col.sortOrder, statusMapping: col.statusMapping ?? null }
}

export async function deleteBoardColumn(prisma: PrismaClient, columnId: string) {
  // Move tasks in this column to no column
  await prisma.task.updateMany({ where: { boardColumnId: columnId }, data: { boardColumnId: null } })
  await prisma.boardColumn.delete({ where: { id: columnId } })
}

export async function reorderBoardColumns(prisma: PrismaClient, ids: string[]) {
  await Promise.all(ids.map((id, i) => prisma.boardColumn.update({ where: { id }, data: { sortOrder: i } })))
}

// ── Comments ──────────────────────────────────────────────────────────────────

const commentSelect = {
  id: true,
  taskId: true,
  userId: true,
  user: { select: { fullName: true } },
  text: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} satisfies Prisma.CommentSelect

function mapComment(c: any) {
  return {
    id: c.id,
    taskId: c.taskId,
    userId: c.userId,
    userName: c.user?.fullName ?? '',
    text: c.deletedAt ? '[Удалено]' : c.text,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt?.toISOString() ?? null,
    deletedAt: c.deletedAt?.toISOString() ?? null,
  }
}

export async function getComments(prisma: PrismaClient, taskId: string) {
  const rows = await prisma.comment.findMany({
    where: { taskId },
    select: commentSelect,
    orderBy: { createdAt: 'asc' },
  })
  return rows.map(mapComment)
}

export async function createComment(
  prisma: PrismaClient,
  taskId: string,
  userId: string,
  orgId: string,
  text: string,
) {
  const c = await prisma.comment.create({
    data: { taskId, userId, text },
    select: commentSelect,
  })

  // Parse @mentions: @[fullName](userId) or @userId (UUID pattern)
  const mentionRegex = /@\[([^\]]+)\]\(([a-f0-9-]{36})\)/g
  let m: RegExpExecArray | null
  const notified = new Set<string>()
  while ((m = mentionRegex.exec(text)) !== null) {
    const mentionedId = m[2]
    if (mentionedId !== userId && !notified.has(mentionedId)) {
      notified.add(mentionedId)
      await createNotification(prisma, {
        userId: mentionedId,
        orgId,
        type: 'mention',
        payload: { commentId: c.id, taskId, authorId: userId },
      })
    }
  }

  return mapComment(c)
}

export async function updateComment(
  prisma: PrismaClient,
  commentId: string,
  userId: string,
  text: string,
) {
  const existing = await prisma.comment.findUniqueOrThrow({ where: { id: commentId } })
  if (existing.userId !== userId) throw new Error('Forbidden')
  if (existing.deletedAt) throw new Error('Comment deleted')

  const c = await prisma.comment.update({
    where: { id: commentId },
    data: { text, updatedAt: new Date() },
    select: commentSelect,
  })
  return mapComment(c)
}

export async function deleteComment(
  prisma: PrismaClient,
  commentId: string,
  userId: string,
  isAdmin: boolean,
) {
  const existing = await prisma.comment.findUniqueOrThrow({ where: { id: commentId } })
  if (!isAdmin && existing.userId !== userId) throw new Error('Forbidden')
  const c = await prisma.comment.update({
    where: { id: commentId },
    data: { deletedAt: new Date() },
    select: commentSelect,
  })
  return mapComment(c)
}

// ── Calendar tasks ────────────────────────────────────────────────────────────

export async function getCalendarTasks(
  prisma: PrismaClient,
  orgId: string,
  userId: string,
  isAdmin: boolean,
  orgRoleId: string | null,
  from: string,
  to: string,
  projectId?: string,
) {
  const fromDate = new Date(from)
  const toDate = new Date(to)

  // Determine visibility scope:
  // - org admin: all tasks in org
  // - PM (project owner): tasks in their projects
  // - Line manager (user that has subordinates via orgRole with "team_manage" permission)
  //   We'll approximate: if user has team_manage permission → see all org tasks (they manage people)
  // - Regular user: only own tasks

  let where: Prisma.TaskWhereInput = {
    project: { organizationId: orgId },
    OR: [
      { startDate: { gte: fromDate, lte: toDate } },
      { dueDate: { gte: fromDate, lte: toDate } },
      { startDate: { lte: fromDate }, dueDate: { gte: toDate } },
    ],
  }

  if (projectId) {
    where = { ...where, projectId }
  }

  if (!isAdmin) {
    // Check if user has team_manage permission (line manager)
    let hasTeamManage = false
    if (orgRoleId) {
      const perm = await prisma.rolePermission.findUnique({
        where: { roleId_permission: { roleId: orgRoleId, permission: 'team_manage' } },
      })
      hasTeamManage = !!perm
    }

    if (!hasTeamManage && !projectId) {
      // Scope to: own tasks, tasks in owned projects, tasks on review by creator
      const ownedProjectIds = (await prisma.project.findMany({
        where: { organizationId: orgId, ownerId: userId },
        select: { id: true },
      })).map(p => p.id)

      where.OR = undefined
      where = {
        ...where,
        AND: [
          {
            OR: [
              { startDate: { gte: fromDate, lte: toDate } },
              { dueDate: { gte: fromDate, lte: toDate } },
              { startDate: { lte: fromDate }, dueDate: { gte: toDate } },
            ],
          },
          {
            OR: [
              { assigneeId: userId },
              { projectId: { in: ownedProjectIds } },
              { status: 'review', createdBy: userId },
            ],
          },
        ],
      }
    }
  }

  const rows = await prisma.task.findMany({
    where,
    select: {
      ...taskSelect,
      project: { select: { id: true, name: true } },
    },
    orderBy: [{ startDate: 'asc' }, { dueDate: 'asc' }],
    take: 500,
  })

  return rows.map(r => ({
    ...mapTask(r),
    projectName: (r as any).project?.name ?? null,
  }))
}

// ── Effort unit helpers ───────────────────────────────────────────────────────

// ── Gantt ─────────────────────────────────────────────────────────────────────

export async function getGanttTasks(prisma: PrismaClient, projectId: string) {
  const rows = await prisma.task.findMany({
    where: { projectId },
    select: {
      id: true,
      parentId: true,
      title: true,
      status: true,
      priority: true,
      taskType: true,
      startDate: true,
      dueDate: true,
      percentComplete: true,
      baselineStart: true,
      baselineFinish: true,
      effortHours: true,
      duration: true,
      constraintType: true,
      constraintDate: true,
      assigneeId: true,
      assignee: { select: { fullName: true } },
      sortOrder: true,
      _count: { select: { children: true } },
      dependencies: { select: { id: true, predecessorId: true, type: true, lagDays: true } },
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  })
  return rows.map(t => ({
    id: t.id,
    projectId,
    parentId: t.parentId ?? null,
    title: t.title,
    status: t.status,
    priority: t.priority,
    taskType: t.taskType,
    startDate: t.startDate ? t.startDate.toISOString().slice(0, 10) : null,
    dueDate: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null,
    percentComplete: t.percentComplete,
    baselineStart: t.baselineStart ? t.baselineStart.toISOString().slice(0, 10) : null,
    baselineFinish: t.baselineFinish ? t.baselineFinish.toISOString().slice(0, 10) : null,
    effortHours: t.effortHours !== null ? Number(t.effortHours) : null,
    duration: t.duration ?? null,
    constraintType: t.constraintType ?? null,
    constraintDate: t.constraintDate ? t.constraintDate.toISOString().slice(0, 10) : null,
    assigneeId: t.assigneeId,
    assigneeName: t.assignee?.fullName ?? null,
    sortOrder: t.sortOrder,
    childCount: t._count.children,
    dependencies: t.dependencies,
  }))
}

// ── Task dependencies CRUD ────────────────────────────────────────────────────

export async function getTaskDependencies(prisma: PrismaClient, taskId: string) {
  const rows = await prisma.taskDependency.findMany({
    where: { taskId },
    include: {
      predecessor: {
        select: { id: true, title: true, startDate: true, dueDate: true, duration: true },
      },
    },
    orderBy: { predecessor: { title: 'asc' } },
  })
  return rows.map(r => ({
    id: r.id,
    taskId: r.taskId,
    predecessorId: r.predecessorId,
    type: r.type,
    lagDays: r.lagDays,
    predecessorTitle: r.predecessor.title,
    predecessorStart: r.predecessor.startDate ? r.predecessor.startDate.toISOString().slice(0, 10) : null,
    predecessorEnd: r.predecessor.dueDate ? r.predecessor.dueDate.toISOString().slice(0, 10) : null,
  }))
}

export async function addTaskDependency(
  prisma: PrismaClient,
  taskId: string,
  predecessorId: string,
  type: string,
  lagDays: number,
) {
  // Prevent circular dependency (simple: A→B and B→A)
  const reverse = await prisma.taskDependency.findFirst({
    where: { taskId: predecessorId, predecessorId: taskId },
  })
  if (reverse) throw new Error('Circular dependency: predecessor already depends on this task')

  const dep = await prisma.taskDependency.create({
    data: { taskId, predecessorId, type: type as any, lagDays },
  })
  return dep
}

export async function removeTaskDependency(prisma: PrismaClient, depId: string) {
  await prisma.taskDependency.delete({ where: { id: depId } })
}

export async function setProjectBaseline(prisma: PrismaClient, projectId: string) {
  await prisma.$executeRaw`
    UPDATE tasks
    SET baseline_start = start_date,
        baseline_finish = due_date
    WHERE project_id = ${projectId}::uuid
  `
}

export async function getEffortUnit(prisma: PrismaClient, projectId: string) {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: {
      effortUnit: true,
      organization: { select: { defaultEffortUnit: true } },
    },
  })
  return project.effortUnit ?? project.organization.defaultEffortUnit
}
