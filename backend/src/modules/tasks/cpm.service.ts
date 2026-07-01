import { PrismaClient } from '@prisma/client'

// ── Work calendar ─────────────────────────────────────────────────────────────

interface WorkCalendar {
  workDays: Set<number>   // 1=Mon..7=Sun
  holidays: Set<string>   // YYYY-MM-DD
  extraWorkdays: Set<string>
}

async function loadCalendar(prisma: PrismaClient, orgId: string): Promise<WorkCalendar> {
  const [ws, nonWorking] = await Promise.all([
    prisma.workSchedule.findUnique({
      where: { organizationId: orgId },
      select: { workDays: true },
    }),
    prisma.nonWorkingDay.findMany({
      where: { organizationId: orgId },
      select: { date: true, type: true },
    }),
  ])

  const workDays = new Set<number>(
    (ws?.workDays as number[] | null) ?? [1, 2, 3, 4, 5],
  )
  const holidays = new Set<string>()
  const extraWorkdays = new Set<string>()
  for (const d of nonWorking) {
    const key = d.date.toISOString().slice(0, 10)
    if (d.type === 'holiday') holidays.add(key)
    else extraWorkdays.add(key)
  }
  return { workDays, holidays, extraWorkdays }
}

function isWorkingDay(date: Date, cal: WorkCalendar): boolean {
  const key = date.toISOString().slice(0, 10)
  if (cal.extraWorkdays.has(key)) return true
  if (cal.holidays.has(key)) return false
  const dow = date.getDay() === 0 ? 7 : date.getDay()
  return cal.workDays.has(dow)
}

function nextWorkDay(date: Date, cal: WorkCalendar): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  while (!isWorkingDay(d, cal)) d.setDate(d.getDate() + 1)
  return d
}

// Add n working days (n may be negative)
function addWorkDays(date: Date, n: number, cal: WorkCalendar): Date {
  if (n === 0) {
    const d = new Date(date)
    d.setHours(0, 0, 0, 0)
    return d
  }
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  let remaining = Math.abs(n)
  const dir = n > 0 ? 1 : -1
  while (remaining > 0) {
    d.setDate(d.getDate() + dir)
    if (isWorkingDay(d, cal)) remaining--
  }
  return d
}

// Count working days from start to end inclusive
function countWorkDays(start: Date, end: Date, cal: WorkCalendar): number {
  let count = 0
  const d = new Date(start)
  d.setHours(0, 0, 0, 0)
  const e = new Date(end)
  e.setHours(0, 0, 0, 0)
  while (d.getTime() <= e.getTime()) {
    if (isWorkingDay(d, cal)) count++
    d.setDate(d.getDate() + 1)
  }
  return Math.max(1, count)
}

// ── CPM core ──────────────────────────────────────────────────────────────────

interface CpmTask {
  id: string
  duration: number | null
  startDate: Date | null
  dueDate: Date | null
  constraintType: string | null
  constraintDate: Date | null
  taskType: string
  parentId: string | null
  dependencies: Array<{ predecessorId: string; type: string; lagDays: number }>
}

function getEffectiveDuration(t: CpmTask, cal: WorkCalendar): number {
  if (t.duration && t.duration > 0) return t.duration
  if (t.startDate && t.dueDate) return countWorkDays(t.startDate, t.dueDate, cal)
  return 1
}

function topoSort(tasks: CpmTask[], skip: Set<string>): string[] {
  const inDeg = new Map<string, number>()
  const succsOf = new Map<string, string[]>()
  const filtered = tasks.filter(t => !skip.has(t.id))

  for (const t of filtered) {
    if (!inDeg.has(t.id)) inDeg.set(t.id, 0)
    if (!succsOf.has(t.id)) succsOf.set(t.id, [])
    for (const dep of t.dependencies) {
      if (skip.has(dep.predecessorId)) continue
      if (!succsOf.has(dep.predecessorId)) succsOf.set(dep.predecessorId, [])
      succsOf.get(dep.predecessorId)!.push(t.id)
      inDeg.set(t.id, (inDeg.get(t.id) ?? 0) + 1)
    }
  }

  const queue = filtered.filter(t => (inDeg.get(t.id) ?? 0) === 0).map(t => t.id)
  const result: string[] = []
  while (queue.length) {
    const id = queue.shift()!
    result.push(id)
    for (const succ of succsOf.get(id) ?? []) {
      const d = (inDeg.get(succ) ?? 1) - 1
      inDeg.set(succ, d)
      if (d === 0) queue.push(succ)
    }
  }
  return result
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function recalculateProjectSchedule(
  prisma: PrismaClient,
  projectId: string,
): Promise<void> {
  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { startDate: true, organizationId: true },
    })
    if (!project) return

    const cal = await loadCalendar(prisma, project.organizationId)

    const rows = await prisma.task.findMany({
      where: { projectId },
      select: {
        id: true,
        duration: true,
        startDate: true,
        dueDate: true,
        constraintType: true,
        constraintDate: true,
        taskType: true,
        parentId: true,
        dependencies: { select: { predecessorId: true, type: true, lagDays: true } },
      },
    })
    if (rows.length === 0) return

    const tasks: CpmTask[] = rows as CpmTask[]
    const taskMap = new Map(tasks.map(t => [t.id, t]))

    // Build children map for hammock tasks
    const childrenOf = new Map<string | null, string[]>()
    for (const t of tasks) {
      const pid = t.parentId ?? null
      if (!childrenOf.has(pid)) childrenOf.set(pid, [])
      childrenOf.get(pid)!.push(t.id)
    }

    const hammockIds = new Set(tasks.filter(t => t.constraintType === 'hammock').map(t => t.id))

    // Only schedule tasks that have explicit duration or are constrained by deps
    // Tasks without duration AND without dep predecessors keep existing dates
    const hasDepsAsSuccessor = new Set(
      tasks.flatMap(t => t.dependencies.map(d => t.id)),
    )
    const schedulable = new Set(
      tasks
        .filter(t => !hammockIds.has(t.id) && (t.duration !== null || hasDepsAsSuccessor.has(t.id)))
        .map(t => t.id),
    )

    const topo = topoSort(tasks, hammockIds)

    const projectStart = nextWorkDay(project.startDate ?? new Date(), cal)

    // ── Forward pass ───────────────────────────────────────────────────────────
    const ES = new Map<string, Date>()
    const EF = new Map<string, Date>()

    for (const id of topo) {
      const t = taskMap.get(id)!
      const dur = getEffectiveDuration(t, cal)

      // MSO / exact: start date is fixed hard constraint
      if ((t.constraintType === 'exact' || t.constraintType === 'mso') && t.startDate) {
        const es = nextWorkDay(new Date(t.startDate), cal)
        ES.set(id, es)
        EF.set(id, dur > 1 ? addWorkDays(es, dur - 1, cal) : new Date(es))
        continue
      }
      // MFO: finish date is fixed hard constraint, start computed backwards
      if (t.constraintType === 'mfo' && t.dueDate) {
        const ef = new Date(t.dueDate)
        EF.set(id, ef)
        ES.set(id, dur > 1 ? addWorkDays(ef, -(dur - 1), cal) : new Date(ef))
        continue
      }

      // Use existing startDate as default ES if task has no explicit duration
      // and no dependencies constraining it
      const baseES: Date = schedulable.has(id)
        ? new Date(projectStart)
        : (t.startDate ? nextWorkDay(new Date(t.startDate), cal) : new Date(projectStart))

      let es = new Date(baseES)

      for (const dep of t.dependencies) {
        if (hammockIds.has(dep.predecessorId)) continue
        const predES = ES.get(dep.predecessorId)
        const predEF = EF.get(dep.predecessorId)

        let candidate: Date | null = null
        if (dep.type === 'FS' && predEF) {
          candidate = addWorkDays(predEF, dep.lagDays + 1, cal)
        } else if (dep.type === 'SS' && predES) {
          candidate = dep.lagDays > 0
            ? addWorkDays(predES, dep.lagDays, cal)
            : new Date(predES)
        } else if (dep.type === 'FF' && predEF) {
          const cEF = addWorkDays(predEF, dep.lagDays, cal)
          candidate = dur > 1 ? addWorkDays(cEF, -(dur - 1), cal) : new Date(cEF)
        } else if (dep.type === 'SF' && predES) {
          const cEF = addWorkDays(predES, dep.lagDays, cal)
          candidate = dur > 1 ? addWorkDays(cEF, -(dur - 1), cal) : new Date(cEF)
        }

        if (candidate && candidate.getTime() > es.getTime()) es = candidate
      }

      // SNET constraint
      if (t.constraintType === 'snet' && t.constraintDate) {
        const snet = nextWorkDay(new Date(t.constraintDate), cal)
        if (snet.getTime() > es.getTime()) es = snet
      }

      es = nextWorkDay(es, cal)
      ES.set(id, es)
      EF.set(id, dur > 1 ? addWorkDays(es, dur - 1, cal) : new Date(es))
    }

    // Hammock tasks: span over relevant task group
    // If hammock has own WBS children → span them (summary model)
    // Otherwise → span all siblings in the same parent group (sibling model — "stage management")
    for (const id of hammockIds) {
      const t = taskMap.get(id)!
      const ownChildren = (childrenOf.get(id) ?? []).filter(cid => !hammockIds.has(cid))
      const rootIds = ownChildren.length > 0
        ? ownChildren
        : (childrenOf.get(t.parentId ?? null) ?? []).filter(sid => sid !== id && !hammockIds.has(sid))

      let minES: Date | null = null
      let maxEF: Date | null = null
      // Traverse rootIds and all their descendants
      // Use CPM-computed ES/EF if available, fall back to the task's existing dates
      const stack = [...rootIds]
      while (stack.length) {
        const cid = stack.pop()!
        const ct = taskMap.get(cid)
        const ces = ES.get(cid) ?? (ct?.startDate ? new Date(ct.startDate) : null)
        const cef = EF.get(cid) ?? (ct?.dueDate  ? new Date(ct.dueDate)  : null)
        if (ces && (!minES || ces.getTime() < minES.getTime())) minES = ces
        if (cef && (!maxEF || cef.getTime() > maxEF.getTime())) maxEF = cef
        stack.push(...(childrenOf.get(cid) ?? []).filter(c => !hammockIds.has(c)))
      }
      if (minES) ES.set(id, minES)
      if (maxEF) EF.set(id, maxEF)
    }

    // Project end
    const allEFs = [...EF.values()]
    if (allEFs.length === 0) return
    const projectEnd = allEFs.reduce((m, d) => (d.getTime() > m.getTime() ? d : m))

    // ── Backward pass ──────────────────────────────────────────────────────────
    const LF = new Map<string, Date>()
    for (const id of topo) LF.set(id, new Date(projectEnd))

    for (const id of [...topo].reverse()) {
      const t = taskMap.get(id)!
      const dur = getEffectiveDuration(t, cal)
      const lf = LF.get(id)!
      const ls = dur > 1 ? addWorkDays(lf, -(dur - 1), cal) : new Date(lf)

      for (const dep of t.dependencies) {
        if (hammockIds.has(dep.predecessorId)) continue
        const predT = taskMap.get(dep.predecessorId)
        if (!predT) continue
        const predDur = getEffectiveDuration(predT, cal)
        const curPredLF = LF.get(dep.predecessorId) ?? new Date(projectEnd)

        let newPredLF: Date | null = null
        if (dep.type === 'FS') {
          newPredLF = addWorkDays(ls, -(dep.lagDays + 1), cal)
        } else if (dep.type === 'SS') {
          const predLS = addWorkDays(ls, -dep.lagDays, cal)
          newPredLF = predDur > 1 ? addWorkDays(predLS, predDur - 1, cal) : new Date(predLS)
        } else if (dep.type === 'FF') {
          newPredLF = addWorkDays(lf, -dep.lagDays, cal)
        } else if (dep.type === 'SF') {
          const predLS = addWorkDays(lf, -dep.lagDays, cal)
          newPredLF = predDur > 1 ? addWorkDays(predLS, predDur - 1, cal) : new Date(predLS)
        }

        if (newPredLF && newPredLF.getTime() < curPredLF.getTime()) {
          LF.set(dep.predecessorId, newPredLF)
        }
      }
    }

    // ── Compute total float and build update list ──────────────────────────────
    const updates: Array<{ id: string; startDate: Date; dueDate: Date }> = []

    for (const id of [...topo, ...hammockIds]) {
      const t = taskMap.get(id)
      if (!t) continue
      // Fixed tasks keep their dates
      if (t.constraintType === 'exact' || t.constraintType === 'mso' || t.constraintType === 'mfo') continue
      // Non-schedulable tasks without deps: skip (keep existing dates)
      if (!topo.includes(id) && !hammockIds.has(id)) continue

      let start = ES.get(id)
      let end = EF.get(id)
      if (!start || !end) continue

      // ALAP: use late dates
      if (t.constraintType === 'alap') {
        const lf = LF.get(id)
        if (lf) {
          end = new Date(lf)
          const dur = getEffectiveDuration(t, cal)
          start = dur > 1 ? addWorkDays(lf, -(dur - 1), cal) : new Date(lf)
        }
      }

      // Only write if dates actually changed (avoid unnecessary updates)
      const existingStart = t.startDate ? new Date(t.startDate) : null
      const existingEnd = t.dueDate ? new Date(t.dueDate) : null
      const startChanged = !existingStart || Math.abs(start.getTime() - existingStart.getTime()) > 43200000 // >12h diff
      const endChanged = !existingEnd || Math.abs(end.getTime() - existingEnd.getTime()) > 43200000

      if (schedulable.has(id) || hammockIds.has(id)) {
        if (startChanged || endChanged) {
          updates.push({ id, startDate: start, dueDate: end })
        }
      }
    }

    if (updates.length > 0) {
      await prisma.$transaction(
        updates.map(u =>
          prisma.task.update({
            where: { id: u.id },
            data: { startDate: u.startDate, dueDate: u.dueDate, updatedAt: new Date() },
          }),
        ),
      )
    }
  } catch (err) {
    console.error('[CPM] recalculate error:', err)
  }
}
