import { PrismaClient } from '@prisma/client'
import { createNotification } from '../notifications/notifications.service'

// ─── Absence Types ────────────────────────────────────────────────────────────

export async function getOrgAbsenceTypes(prisma: PrismaClient, orgId: string) {
  const [system, custom] = await Promise.all([
    prisma.absenceType.findMany({ where: { organizationId: null, isSystem: true }, orderBy: { name: 'asc' } }),
    prisma.absenceType.findMany({ where: { organizationId: orgId }, orderBy: { name: 'asc' } }),
  ])
  return [...system, ...custom]
}

export async function createAbsenceType(
  prisma: PrismaClient,
  orgId: string,
  data: { name: string; color?: string; approvalSteps?: object[] },
) {
  return prisma.absenceType.create({
    data: {
      organizationId: orgId,
      name: data.name,
      color: data.color ?? '#6B7280',
      approvalSteps: data.approvalSteps ?? [],
    },
  })
}

export async function updateAbsenceType(
  prisma: PrismaClient,
  orgId: string,
  id: string,
  data: { name?: string; color?: string; approvalSteps?: object[] },
) {
  const type = await prisma.absenceType.findFirst({ where: { id, organizationId: orgId } })
  if (!type) throw new Error('Тип не найден')
  if (type.isSystem) throw new Error('Системные типы нельзя переименовать')
  return prisma.absenceType.update({ where: { id }, data })
}

export async function deleteAbsenceType(prisma: PrismaClient, orgId: string, id: string) {
  const type = await prisma.absenceType.findFirst({ where: { id, organizationId: orgId } })
  if (!type) throw new Error('Тип не найден')
  if (type.isSystem) throw new Error('Системные типы удалять нельзя')
  const used = await prisma.absenceRequest.count({ where: { typeId: id } })
  if (used > 0) throw new Error('Тип используется в заявках')
  return prisma.absenceType.delete({ where: { id } })
}

export async function updateAbsenceTypeSteps(
  prisma: PrismaClient,
  orgId: string,
  id: string,
  steps: object[],
) {
  const type = await prisma.absenceType.findFirst({ where: { id } })
  if (!type) throw new Error('Тип не найден')
  if (type.organizationId !== null && type.organizationId !== orgId) throw new Error('Нет доступа')
  return prisma.absenceType.update({ where: { id }, data: { approvalSteps: steps } })
}

// ─── Departments ──────────────────────────────────────────────────────────────

export async function getDepartments(prisma: PrismaClient, orgId: string) {
  return prisma.department.findMany({
    where: { organizationId: orgId },
    include: {
      headUser: { select: { id: true, fullName: true } },
      _count: { select: { members: true } },
    },
    orderBy: [{ parentId: 'asc' }, { name: 'asc' }],
  })
}

export async function createDepartment(
  prisma: PrismaClient,
  orgId: string,
  data: { name: string; parentId?: string | null; headUserId?: string | null },
) {
  return prisma.department.create({
    data: { organizationId: orgId, name: data.name, parentId: data.parentId ?? null, headUserId: data.headUserId ?? null },
    include: { headUser: { select: { id: true, fullName: true } } },
  })
}

export async function updateDepartment(
  prisma: PrismaClient,
  orgId: string,
  id: string,
  data: { name?: string; parentId?: string | null; headUserId?: string | null },
) {
  const dept = await prisma.department.findFirst({ where: { id, organizationId: orgId } })
  if (!dept) throw new Error('Отдел не найден')
  return prisma.department.update({
    where: { id },
    data,
    include: { headUser: { select: { id: true, fullName: true } } },
  })
}

export async function deleteDepartment(prisma: PrismaClient, orgId: string, id: string) {
  const dept = await prisma.department.findFirst({ where: { id, organizationId: orgId } })
  if (!dept) throw new Error('Отдел не найден')
  await prisma.user.updateMany({ where: { departmentId: id }, data: { departmentId: null } })
  await prisma.department.updateMany({ where: { parentId: id }, data: { parentId: null } })
  return prisma.department.delete({ where: { id } })
}

// ─── Absence Requests ─────────────────────────────────────────────────────────

interface ApprovalStep {
  order: number
  role: 'pm' | 'line_manager' | 'admin'
  action: 'approve' | 'notify'
}

// Returns all approver userIds for a given role — may be multiple (e.g. several PMs)
async function findApproversForStep(
  prisma: PrismaClient,
  userId: string,
  orgId: string,
  role: string,
): Promise<string[]> {
  if (role === 'admin') {
    const admin = await prisma.user.findFirst({ where: { organizationId: orgId, isAdmin: true, isActive: true } })
    return admin ? [admin.id] : []
  }
  if (role === 'line_manager') {
    const user = await prisma.user.findUnique({ where: { id: userId }, include: { department: { include: { headUser: true } } } })
    const headId = user?.department?.headUser?.id
    return headId ? [headId] : []
  }
  if (role === 'pm') {
    // All owners of projects where the user is a member
    const memberships = await prisma.projectMember.findMany({
      where: { userId },
      include: { project: { select: { ownerId: true } } },
    })
    return [...new Set(memberships.map(m => m.project.ownerId).filter(Boolean))] as string[]
  }
  return []
}

export async function createAbsenceRequest(
  prisma: PrismaClient,
  orgId: string,
  createdById: string,
  data: { userId: string; typeId: string; startDate: string; endDate: string; notes?: string },
) {
  if (data.startDate > data.endDate) throw new Error('Дата начала должна быть не позже даты окончания')

  const type = await prisma.absenceType.findUnique({ where: { id: data.typeId } })
  if (!type) throw new Error('Тип отсутствия не найден')

  // Check for overlapping tasks (warn, don't block)
  // Include tasks with no dates (unknown period) + tasks explicitly overlapping
  const conflictingTasks = await prisma.task.findMany({
    where: {
      assigneeId: data.userId,
      status: { notIn: ['done', 'cancelled'] },
      OR: [
        { startDate: null }, // unknown period — include as potential conflict
        {
          startDate: { lte: new Date(data.endDate) },
          dueDate: { gte: new Date(data.startDate) },
        },
        {
          startDate: { lte: new Date(data.endDate) },
          dueDate: null, // started but no end date
        },
      ],
    },
    select: { id: true, title: true, startDate: true, dueDate: true },
    take: 5,
  })
  const warnings = conflictingTasks.length > 0
    ? [`В выбранный период у вас ${conflictingTasks.length} активных задач: ${conflictingTasks.map(t => t.title).join(', ')}`]
    : []

  const steps = (type.approvalSteps as ApprovalStep[]) ?? []

  const request = await prisma.absenceRequest.create({
    data: {
      organizationId: orgId,
      userId: data.userId,
      typeId: data.typeId,
      startDate: new Date(data.startDate),
      endDate: new Date(data.endDate),
      notes: data.notes,
      createdById,
      status: steps.length === 0 ? 'approved' : 'pending',
    },
    include: { type: true, user: { select: { id: true, fullName: true } } },
  })

  if (steps.length === 0) {
    const autoCtx: NotifCtx = { typeName: type.name, userShortName: shortName(request.user.fullName), startDate: data.startDate, endDate: data.endDate }
    await finalizeRequest(prisma, request.id, orgId, data.userId, type, data.startDate, data.endDate, data.notes, autoCtx, true)
    return { ...request, status: 'approved', warnings }
  }

  // create step records — one per approver, deduplicating across all steps
  const usedApproverIds = new Set<string>()
  const stepRecords = (await Promise.all(steps.map(async s => {
    const approverIds = await findApproversForStep(prisma, data.userId, orgId, s.role)
    const freshIds = approverIds.filter(id => !usedApproverIds.has(id))
    freshIds.forEach(id => usedApproverIds.add(id))
    const targets = freshIds.length > 0 ? freshIds : (approverIds.length === 0 ? [null] : [])
    if (targets.length === 0) return []
    return Promise.all(targets.map(approverId =>
      prisma.absenceRequestStep.create({
        data: { requestId: request.id, stepOrder: s.order, role: s.role, action: s.action, approverId, status: 'pending' },
      })
    ))
  }))).flat()

  const createCtx: NotifCtx = { typeName: type.name, userShortName: shortName(request.user.fullName), startDate: data.startDate, endDate: data.endDate }
  await processStep(prisma, request.id, orgId, data.userId, stepRecords, 0, createCtx)

  return { ...request, steps: stepRecords, warnings }
}

interface NotifCtx { typeName: string; userShortName: string; startDate: string; endDate: string }

function fmtDate(d: Date | string) {
  const dt = typeof d === 'string' ? new Date(d) : d
  return `${String(dt.getUTCDate()).padStart(2,'0')}.${String(dt.getUTCMonth()+1).padStart(2,'0')}.${dt.getUTCFullYear()}`
}

function shortName(fullName: string) {
  const parts = fullName.trim().split(/\s+/)
  if (parts.length === 1) return parts[0]
  return `${parts[0]} ${parts[1].charAt(0)}.${parts[2] ? parts[2].charAt(0)+'.' : ''}`
}

function approvalMsg(ctx: NotifCtx) {
  return `Согласование ${ctx.typeName}: ${ctx.userShortName} ${fmtDate(ctx.startDate)}–${fmtDate(ctx.endDate)}`
}
function approvedMsg(ctx: NotifCtx) {
  return `${ctx.typeName} ${fmtDate(ctx.startDate)}–${fmtDate(ctx.endDate)} согласован`
}
function rejectedMsg(ctx: NotifCtx) {
  return `${ctx.typeName} ${fmtDate(ctx.startDate)}–${fmtDate(ctx.endDate)} отклонён`
}
function notifyMsg(ctx: NotifCtx) {
  return `Отсутствие ${ctx.typeName}: ${ctx.userShortName} ${fmtDate(ctx.startDate)}–${fmtDate(ctx.endDate)}`
}

async function processStep(
  prisma: PrismaClient,
  requestId: string,
  orgId: string,
  userId: string,
  steps: { id: string; stepOrder: number; action: string; approverId: string | null }[],
  stepIndex: number,
  ctx?: NotifCtx,
) {
  // All steps at this order level (parallel group)
  const orders = [...new Set(steps.map(s => s.stepOrder))].sort((a, b) => a - b)
  const currentOrder = orders[stepIndex]
  if (currentOrder === undefined) return

  const group = steps.filter(s => s.stepOrder === currentOrder)
  const action = group[0]?.action ?? 'approve'

  // Lazy-load context if not provided
  let notifCtx = ctx
  if (!notifCtx) {
    const req = await prisma.absenceRequest.findUnique({ where: { id: requestId }, include: { type: true, user: { select: { fullName: true } } } })
    if (req) notifCtx = { typeName: req.type.name, userShortName: shortName(req.user.fullName), startDate: req.startDate.toISOString().slice(0,10), endDate: req.endDate.toISOString().slice(0,10) }
  }

  if (action === 'notify') {
    await Promise.all(group.map(async s => {
      await prisma.absenceRequestStep.update({ where: { id: s.id }, data: { status: 'notified', decidedAt: new Date() } })
      if (s.approverId && notifCtx) {
        await createNotification(prisma, { userId: s.approverId, orgId, type: 'absence_request_notify', payload: { requestId, message: notifyMsg(notifCtx) } })
      }
    }))
    await prisma.absenceRequest.update({ where: { id: requestId }, data: { currentStep: stepIndex + 1 } })

    if (stepIndex + 1 < orders.length) {
      await processStep(prisma, requestId, orgId, userId, steps, stepIndex + 1, notifCtx)
    } else {
      const request = await prisma.absenceRequest.findUnique({ where: { id: requestId }, include: { type: true } })
      if (request) await finalizeRequest(prisma, requestId, orgId, userId, request.type, request.startDate.toISOString().slice(0, 10), request.endDate.toISOString().slice(0, 10), request.notes ?? undefined, notifCtx)
    }
  } else {
    // needs manual approve — notify all approvers in this group
    await Promise.all(group.map(async s => {
      if (s.approverId && notifCtx) {
        await createNotification(prisma, { userId: s.approverId, orgId, type: 'absence_request_pending', payload: { requestId, message: approvalMsg(notifCtx) } })
      }
    }))
  }
}

async function finalizeRequest(
  prisma: PrismaClient,
  requestId: string,
  orgId: string,
  userId: string,
  type: { code: string | null; name?: string },
  startDate: string,
  endDate: string,
  notes?: string,
  ctx?: NotifCtx,
  skipNotification?: boolean,
) {
  const kindMap: Record<string, 'vacation' | 'sick' | 'other'> = {
    vacation: 'vacation',
    sick: 'sick',
    other: 'other',
  }
  const kind = kindMap[type.code ?? ''] ?? 'other'

  await prisma.absenceRequest.update({ where: { id: requestId }, data: { status: 'approved' } })
  await prisma.absence.create({
    data: {
      userId,
      organizationId: orgId,
      type: kind,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      notes,
      requestId,
    },
  })

  if (!skipNotification) {
    const msg = ctx ? approvedMsg(ctx) : 'Ваша заявка на отсутствие одобрена'
    await createNotification(prisma, { userId, orgId, type: 'absence_request_approved', payload: { requestId, message: msg } })
  }
}

export async function getAbsenceRequests(
  prisma: PrismaClient,
  orgId: string,
  viewerId: string,
  isAdmin: boolean,
  filter: { status?: string; userId?: string; asApprover?: boolean },
) {
  if (filter.asApprover) {
    // steps where this user is the approver and action is 'approve' and status is 'pending'
    const steps = await prisma.absenceRequestStep.findMany({
      where: { approverId: viewerId, status: 'pending', action: 'approve' },
      include: {
        request: {
          include: {
            user: { select: { id: true, fullName: true } },
            type: true,
          },
        },
      },
      orderBy: { request: { createdAt: 'asc' } },
    })
    return Promise.all(steps.map(async s => {
      const conflictTasks = await prisma.task.findMany({
        where: {
          assigneeId: s.request.userId,
          status: { notIn: ['done', 'cancelled'] },
          OR: [
            { startDate: null },
            { startDate: { lte: s.request.endDate }, dueDate: { gte: s.request.startDate } },
            { startDate: { lte: s.request.endDate }, dueDate: null },
          ],
        },
        select: { title: true },
        take: 5,
      })
      return { ...s.request, pendingStepId: s.id, conflictingTasks: conflictTasks.map(t => t.title) }
    }))
  }

  const where: any = { organizationId: orgId }
  if (filter.userId) {
    where.userId = filter.userId
  } else if (!isAdmin) {
    // non-admin sees own requests + requests where they are an approver
    where.OR = [
      { userId: viewerId },
      { steps: { some: { approverId: viewerId } } },
    ]
  }
  if (filter.status) where.status = filter.status

  return prisma.absenceRequest.findMany({
    where,
    include: {
      user: { select: { id: true, fullName: true } },
      type: true,
      steps: { include: { approver: { select: { id: true, fullName: true } } }, orderBy: { stepOrder: 'asc' } },
      absence: { select: { id: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
}

export async function decideAbsenceRequestStep(
  prisma: PrismaClient,
  stepId: string,
  approverId: string,
  orgId: string,
  decision: 'approved' | 'rejected',
  comment?: string,
) {
  const step = await prisma.absenceRequestStep.findUnique({
    where: { id: stepId },
    include: { request: { include: { type: true, steps: { orderBy: { stepOrder: 'asc' } }, user: { select: { id: true, fullName: true } } } } },
  })
  if (!step) throw new Error('Шаг не найден')
  if (step.approverId !== approverId) throw new Error('Нет прав на согласование')
  if (step.status !== 'pending') throw new Error('Шаг уже обработан')

  await prisma.absenceRequestStep.update({
    where: { id: stepId },
    data: { status: decision, comment, decidedAt: new Date() },
  })

  const req = step.request
  const reqCtx: NotifCtx = {
    typeName: req.type.name,
    userShortName: shortName(req.user.fullName),
    startDate: req.startDate.toISOString().slice(0, 10),
    endDate: req.endDate.toISOString().slice(0, 10),
  }

  if (decision === 'rejected') {
    await prisma.absenceRequest.update({ where: { id: req.id }, data: { status: 'rejected' } })
    await createNotification(prisma, { userId: req.userId, orgId, type: 'absence_request_rejected', payload: { requestId: req.id, message: rejectedMsg(reqCtx) } })
    return { status: 'rejected' }
  }

  // approved — check if all parallel siblings at same stepOrder are done
  const allSteps = req.steps
  const siblingsAtSameOrder = allSteps.filter(s => s.stepOrder === step.stepOrder)
  const updatedSiblings = siblingsAtSameOrder.map(s => s.id === stepId ? { ...s, status: decision } : s)
  const allSiblingsDone = updatedSiblings.every(s => s.status === 'approved' || s.status === 'notified')

  if (!allSiblingsDone) {
    // waiting for other parallel approvers
    return { status: 'waiting_parallel' }
  }

  // All parallel approvers done — find next order level
  const orders = [...new Set(allSteps.map(s => s.stepOrder))].sort((a, b) => a - b)
  const currentOrderIdx = orders.indexOf(step.stepOrder)
  const nextOrder = orders[currentOrderIdx + 1]

  if (nextOrder === undefined) {
    await finalizeRequest(
      prisma, req.id, orgId, req.userId, req.type,
      req.startDate.toISOString().slice(0, 10),
      req.endDate.toISOString().slice(0, 10),
      req.notes ?? undefined,
      reqCtx,
    )
  } else {
    await prisma.absenceRequest.update({ where: { id: req.id }, data: { currentStep: nextOrder } })
    await processStep(prisma, req.id, orgId, req.userId, allSteps, currentOrderIdx + 1, reqCtx)
  }

  return { status: 'approved' }
}

export async function checkConflictingTasks(
  prisma: PrismaClient,
  userId: string,
  startDate: string,
  endDate: string,
  approverId?: string,
  approverRole?: string,
) {
  const dateFilter = {
    status: { notIn: ['done', 'cancelled'] as any[] },
    OR: [
      { startDate: null },
      { startDate: { lte: new Date(endDate) }, dueDate: { gte: new Date(startDate) } },
      { startDate: { lte: new Date(endDate) }, dueDate: null },
    ],
  }

  if (approverRole === 'pm' && approverId) {
    // PM sees only tasks from their own projects
    const tasks = await prisma.task.findMany({
      where: {
        assigneeId: userId,
        project: { ownerId: approverId },
        ...dateFilter,
      },
      select: {
        id: true, title: true, startDate: true, dueDate: true,
        project: { select: { id: true, name: true } },
      },
      take: 10,
    })
    return tasks
  }

  // line_manager / employee — all tasks with PM name
  const tasks = await prisma.task.findMany({
    where: { assigneeId: userId, ...dateFilter },
    select: {
      id: true, title: true, startDate: true, dueDate: true,
      project: { select: { id: true, name: true, owner: { select: { id: true, fullName: true } } } },
    },
    take: 10,
  })
  return tasks
}

export async function updateAbsenceRequest(
  prisma: PrismaClient,
  requestId: string,
  userId: string,
  isAdmin: boolean,
  orgId: string,
  data: { typeId?: string; startDate?: string; endDate?: string; notes?: string | null },
) {
  const req = await prisma.absenceRequest.findUnique({
    where: { id: requestId },
    include: { type: true },
  })
  if (!req) throw new Error('Заявка не найдена')
  if (!isAdmin && req.userId !== userId) throw new Error('Нет доступа')
  if (req.status === 'cancelled') throw new Error('Нельзя редактировать отменённую заявку')

  // Delete old steps and reset
  await prisma.absenceRequestStep.deleteMany({ where: { requestId } })

  const newRevision = req.revision + 1
  const typeId = data.typeId ?? req.typeId
  const startDate = data.startDate ?? req.startDate.toISOString().slice(0, 10)
  const endDate = data.endDate ?? req.endDate.toISOString().slice(0, 10)

  const type = await prisma.absenceType.findUnique({ where: { id: typeId } })
  if (!type) throw new Error('Тип отсутствия не найден')
  const steps = (type.approvalSteps as ApprovalStep[]) ?? []

  const updated = await prisma.absenceRequest.update({
    where: { id: requestId },
    data: {
      typeId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      notes: data.notes !== undefined ? data.notes : req.notes,
      status: steps.length === 0 ? 'approved' : 'pending',
      currentStep: 0,
      revision: newRevision,
    },
    include: { type: true, user: { select: { id: true, fullName: true } } },
  })

  if (steps.length === 0) {
    await finalizeRequest(prisma, requestId, orgId, req.userId, type, startDate, endDate, data.notes ?? req.notes ?? undefined)
    return { ...updated, status: 'approved', revision: newRevision }
  }

  const usedApproverIdsUpd = new Set<string>()
  const stepRecords = (await Promise.all(steps.map(async s => {
    const approverIds = await findApproversForStep(prisma, req.userId, orgId, s.role)
    const freshIds = approverIds.filter(id => !usedApproverIdsUpd.has(id))
    freshIds.forEach(id => usedApproverIdsUpd.add(id))
    const targets = freshIds.length > 0 ? freshIds : (approverIds.length === 0 ? [null] : [])
    if (targets.length === 0) return []
    return Promise.all(targets.map(approverId =>
      prisma.absenceRequestStep.create({
        data: { requestId, stepOrder: s.order, role: s.role, action: s.action, approverId, status: 'pending' },
      })
    ))
  }))).flat()

  await processStep(prisma, requestId, orgId, req.userId, stepRecords, 0)

  return { ...updated, steps: stepRecords, revision: newRevision }
}

export async function cancelAbsenceRequest(
  prisma: PrismaClient,
  requestId: string,
  userId: string,
  isAdmin: boolean,
) {
  const req = await prisma.absenceRequest.findUnique({ where: { id: requestId } })
  if (!req) throw new Error('Заявка не найдена')
  if (!isAdmin && req.userId !== userId) throw new Error('Нет доступа')
  if (req.status === 'cancelled') throw new Error('Заявка уже отменена')
  return prisma.absenceRequest.update({ where: { id: requestId }, data: { status: 'cancelled' } })
}
