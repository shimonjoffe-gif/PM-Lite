// ── Constants ─────────────────────────────────────────────────────────────────

export type ZoomLevel = 'day' | 'week' | 'month' | 'quarter'

export const DAY_PX: Record<ZoomLevel, number> = { day: 40, week: 24, month: 8, quarter: 3 }
export const ROW_H = 36
export const HEADER_H = 60   // two sub-rows × 30px each
export const MS_PER_DAY = 86_400_000

// ── Date helpers ──────────────────────────────────────────────────────────────

export function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null
  const d = new Date(s + 'T00:00:00')
  return isNaN(d.getTime()) ? null : d
}

export function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * MS_PER_DAY)
}

export function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY)
}

export function startOfWeek(d: Date): Date {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  const dow = r.getDay()
  r.setDate(r.getDate() - (dow === 0 ? 6 : dow - 1))
  return r
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

export function startOfYear(d: Date): Date {
  return new Date(d.getFullYear(), 0, 1)
}

export function startOfQuarter(d: Date): Date {
  const q = Math.floor(d.getMonth() / 3)
  return new Date(d.getFullYear(), q * 3, 1)
}

// ── Position helpers ──────────────────────────────────────────────────────────

export function dateToX(date: Date | string, origin: Date, dayWidth: number): number {
  const d = typeof date === 'string' ? parseDate(date)! : date
  return ((d.getTime() - origin.getTime()) / MS_PER_DAY) * dayWidth
}

export function xToDate(x: number, origin: Date, dayWidth: number): Date {
  const ms = (x / dayWidth) * MS_PER_DAY
  const d = new Date(origin.getTime() + ms)
  d.setHours(0, 0, 0, 0)
  return d
}

// ── Timeline header segments ──────────────────────────────────────────────────

export interface TimelineSegment {
  label: string
  x: number
  width: number
}

export function getTimelineSegments(
  origin: Date,
  totalDays: number,
  zoom: ZoomLevel,
  dayWidth: number,
): { major: TimelineSegment[]; minor: TimelineSegment[] } {
  const end = addDays(origin, totalDays)
  const major: TimelineSegment[] = []
  const minor: TimelineSegment[] = []

  const MONTHS_RU = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек']
  const MONTHS_FULL = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
  const DAYS_RU = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']

  if (zoom === 'quarter') {
    // Major: Years, Minor: Months
    let cur = startOfYear(origin)
    while (cur < end) {
      const next = new Date(cur.getFullYear() + 1, 0, 1)
      const x = dateToX(cur, origin, dayWidth)
      const w = dateToX(next < end ? next : end, origin, dayWidth) - x
      major.push({ label: String(cur.getFullYear()), x, width: w })
      cur = next
    }
    cur = startOfMonth(origin)
    while (cur < end) {
      const next = new Date(cur.getFullYear(), cur.getMonth() + 1, 1)
      const x = dateToX(cur < origin ? origin : cur, origin, dayWidth)
      const endX = dateToX(next < end ? next : end, origin, dayWidth)
      minor.push({ label: MONTHS_RU[cur.getMonth()], x, width: endX - x })
      cur = next
    }
  } else if (zoom === 'month') {
    // Major: Month+Year, Minor: Weeks
    let cur = startOfMonth(origin)
    while (cur < end) {
      const next = new Date(cur.getFullYear(), cur.getMonth() + 1, 1)
      const x = dateToX(cur < origin ? origin : cur, origin, dayWidth)
      const endX = dateToX(next < end ? next : end, origin, dayWidth)
      major.push({ label: `${MONTHS_FULL[cur.getMonth()]} ${cur.getFullYear()}`, x, width: endX - x })
      cur = next
    }
    cur = startOfWeek(origin)
    while (cur < end) {
      const next = addDays(cur, 7)
      const x = dateToX(cur < origin ? origin : cur, origin, dayWidth)
      const endX = dateToX(next < end ? next : end, origin, dayWidth)
      // ISO week number
      const wk = getISOWeek(cur)
      minor.push({ label: `Нед ${wk}`, x, width: endX - x })
      cur = next
    }
  } else if (zoom === 'week') {
    // Major: Week+Month, Minor: Days
    let cur = startOfWeek(origin)
    while (cur < end) {
      const next = addDays(cur, 7)
      const x = dateToX(cur < origin ? origin : cur, origin, dayWidth)
      const endX = dateToX(next < end ? next : end, origin, dayWidth)
      const mo = cur.getDate() <= 7 ? `${MONTHS_RU[cur.getMonth()]}` : ''
      major.push({ label: `Нед ${getISOWeek(cur)} ${mo}`, x, width: endX - x })
      cur = next
    }
    let day = new Date(origin)
    day.setHours(0, 0, 0, 0)
    while (day < end) {
      const next = addDays(day, 1)
      const x = dateToX(day, origin, dayWidth)
      const w = dayWidth
      const isWeekend = day.getDay() === 0 || day.getDay() === 6
      minor.push({ label: `${DAYS_RU[day.getDay()]} ${day.getDate()}`, x, width: w })
      void isWeekend
      day = next
    }
  } else {
    // day zoom — Major: Week, Minor: Day with date
    let cur = startOfWeek(origin)
    while (cur < end) {
      const next = addDays(cur, 7)
      const x = dateToX(cur < origin ? origin : cur, origin, dayWidth)
      const endX = dateToX(next < end ? next : end, origin, dayWidth)
      major.push({ label: `${cur.getDate()} ${MONTHS_RU[cur.getMonth()]} — ${addDays(cur, 6).getDate()} ${MONTHS_RU[addDays(cur, 6).getMonth()]}`, x, width: endX - x })
      cur = next
    }
    let day = new Date(origin)
    day.setHours(0, 0, 0, 0)
    while (day < end) {
      const x = dateToX(day, origin, dayWidth)
      minor.push({ label: `${day.getDate()}`, x, width: dayWidth })
      day = addDays(day, 1)
    }
  }

  return { major, minor }
}

function getISOWeek(d: Date): number {
  const date = new Date(d)
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7))
  const week1 = new Date(date.getFullYear(), 0, 4)
  return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7)
}

// ── Task tree flatten ─────────────────────────────────────────────────────────

export interface GanttTask {
  id: string
  projectId: string
  parentId: string | null
  title: string
  status: string
  priority: string
  taskType: string
  startDate: string | null
  dueDate: string | null
  percentComplete: number
  baselineStart: string | null
  baselineFinish: string | null
  effortHours: number | null
  duration: number | null
  constraintType: string | null
  constraintDate: string | null
  assigneeId: string | null
  assigneeName: string | null
  sortOrder: number
  childCount: number
  dependencies: { id: string; predecessorId: string; type: string; lagDays: number }[]
}

export interface VisibleRow {
  task: GanttTask
  depth: number
  hasChildren: boolean
  isExpanded: boolean
}

export function flattenForDisplay(tasks: GanttTask[], expanded: Set<string>): VisibleRow[] {
  const childrenOf = new Map<string | null, GanttTask[]>()
  for (const t of tasks) {
    const pid = t.parentId
    if (!childrenOf.has(pid)) childrenOf.set(pid, [])
    childrenOf.get(pid)!.push(t)
  }
  for (const children of childrenOf.values()) {
    children.sort((a, b) => a.sortOrder - b.sortOrder)
  }

  const result: VisibleRow[] = []
  function walk(parentId: string | null, depth: number) {
    for (const task of childrenOf.get(parentId) ?? []) {
      const hasChildren = (childrenOf.get(task.id)?.length ?? 0) > 0
      const isExpanded = expanded.has(task.id)
      result.push({ task, depth, hasChildren, isExpanded })
      if (hasChildren && isExpanded) walk(task.id, depth + 1)
    }
  }
  walk(null, 0)
  return result
}

// ── WBS numbering ─────────────────────────────────────────────────────────────

export function computeWbs(visibleRows: VisibleRow[]): Map<string, string> {
  const wbs = new Map<string, string>()
  const counters: number[] = []

  for (const row of visibleRows) {
    const depth = row.depth
    if (counters.length <= depth) {
      while (counters.length <= depth) counters.push(0)
    } else {
      counters.length = depth + 1
    }
    counters[depth]++
    wbs.set(row.task.id, counters.slice(0, depth + 1).join('.'))
  }
  return wbs
}

// ── Critical Path Method ──────────────────────────────────────────────────────

export function computeCriticalPath(tasks: GanttTask[]): Set<string> {
  if (tasks.length === 0) return new Set()

  const taskMap = new Map(tasks.map(t => [t.id, t]))
  const succsOf = new Map<string, string[]>()
  for (const t of tasks) {
    if (!succsOf.has(t.id)) succsOf.set(t.id, [])
    for (const dep of t.dependencies) {
      if (!succsOf.has(dep.predecessorId)) succsOf.set(dep.predecessorId, [])
      succsOf.get(dep.predecessorId)!.push(t.id)
    }
  }

  function dur(t: GanttTask): number {
    const s = parseDate(t.startDate)
    const e = parseDate(t.dueDate)
    if (!s || !e) return 1
    return Math.max(1, diffDays(s, e) + 1)
  }

  // Topological sort (Kahn's algorithm)
  const inDeg = new Map(tasks.map(t => [t.id, t.dependencies.length]))
  const queue = tasks.filter(t => (inDeg.get(t.id) ?? 0) === 0).map(t => t.id)
  const topo: string[] = []
  while (queue.length) {
    const id = queue.shift()!
    topo.push(id)
    for (const succ of succsOf.get(id) ?? []) {
      const deg = (inDeg.get(succ) ?? 0) - 1
      inDeg.set(succ, deg)
      if (deg === 0) queue.push(succ)
    }
  }
  // Handle cycles (just return empty)
  if (topo.length < tasks.length) return new Set()

  // Forward pass
  const es = new Map<string, number>()
  const ef = new Map<string, number>()
  const REF = new Date('2000-01-01').getTime()
  for (const id of topo) {
    const t = taskMap.get(id)!
    const sDay = parseDate(t.startDate) ? Math.floor((parseDate(t.startDate)!.getTime() - REF) / MS_PER_DAY) : 0
    let start = sDay
    for (const dep of t.dependencies) {
      if (dep.type === 'FS') start = Math.max(start, (ef.get(dep.predecessorId) ?? 0) + 1 + dep.lagDays)
      if (dep.type === 'SS') start = Math.max(start, (es.get(dep.predecessorId) ?? 0) + dep.lagDays)
    }
    es.set(id, start)
    ef.set(id, start + dur(t) - 1)
  }

  const projectEnd = Math.max(...[...ef.values()])

  // Backward pass
  const ls = new Map<string, number>()
  const lf = new Map<string, number>()
  for (const id of topo) lf.set(id, projectEnd)
  for (const id of [...topo].reverse()) {
    const t = taskMap.get(id)!
    const lfi = lf.get(id) ?? projectEnd
    const lsi = lfi - dur(t) + 1
    ls.set(id, lsi)
    for (const dep of t.dependencies) {
      if (dep.type === 'FS') {
        const predLF = lsi - 1 - dep.lagDays
        lf.set(dep.predecessorId, Math.min(lf.get(dep.predecessorId) ?? projectEnd, predLF))
      }
      if (dep.type === 'SS') {
        const predLS = lsi - dep.lagDays
        ls.set(dep.predecessorId, Math.min(ls.get(dep.predecessorId) ?? 0, predLS))
        lf.set(dep.predecessorId, Math.min(lf.get(dep.predecessorId) ?? projectEnd, predLS + dur(taskMap.get(dep.predecessorId)!) - 1))
      }
    }
  }

  const critical = new Set<string>()
  for (const id of topo) {
    const totalFloat = (ls.get(id) ?? 0) - (es.get(id) ?? 0)
    if (totalFloat <= 0) critical.add(id)
  }
  return critical
}

// ── Dependency arrow paths ─────────────────────────────────────────────────────

export interface DepArrow {
  key: string
  d: string
  isCritical: boolean
  type: string
}

export function buildDepArrows(
  visibleRows: VisibleRow[],
  origin: Date,
  dayWidth: number,
  criticalIds: Set<string>,
  rowY: (i: number) => number,
  rowH: (i: number) => number,
): DepArrow[] {
  const rowIndex = new Map(visibleRows.map((r, i) => [r.task.id, i]))
  const arrows: DepArrow[] = []

  for (const row of visibleRows) {
    const { task } = row
    for (const dep of task.dependencies) {
      const predRow = rowIndex.get(dep.predecessorId)
      const succRow = rowIndex.get(task.id)
      if (predRow === undefined || succRow === undefined) continue

      const predTask = visibleRows[predRow].task
      const yFrom = rowY(predRow) + rowH(predRow) / 2
      const yTo = rowY(succRow) + rowH(succRow) / 2
      const BEND = 8

      let x1: number, x2: number
      if (dep.type === 'FS') {
        x1 = predTask.dueDate ? dateToX(predTask.dueDate, origin, dayWidth) + dayWidth : 0
        x2 = task.startDate ? dateToX(task.startDate, origin, dayWidth) : 0
      } else if (dep.type === 'SS') {
        x1 = predTask.startDate ? dateToX(predTask.startDate, origin, dayWidth) : 0
        x2 = task.startDate ? dateToX(task.startDate, origin, dayWidth) : 0
      } else if (dep.type === 'FF') {
        x1 = predTask.dueDate ? dateToX(predTask.dueDate, origin, dayWidth) + dayWidth : 0
        x2 = task.dueDate ? dateToX(task.dueDate, origin, dayWidth) + dayWidth : 0
      } else {
        x1 = predTask.startDate ? dateToX(predTask.startDate, origin, dayWidth) : 0
        x2 = task.dueDate ? dateToX(task.dueDate, origin, dayWidth) + dayWidth : 0
      }

      const midX = x1 + BEND
      const d = x2 > midX
        ? `M${x1},${yFrom} L${midX},${yFrom} L${midX},${yTo} L${x2},${yTo}`
        : `M${x1},${yFrom} L${x1 + BEND},${yFrom} L${x1 + BEND},${(yFrom + yTo) / 2} L${x2 - BEND},${(yFrom + yTo) / 2} L${x2 - BEND},${yTo} L${x2},${yTo}`

      const isCritical = criticalIds.has(task.id) && criticalIds.has(dep.predecessorId)
      arrows.push({ key: `${dep.predecessorId}-${task.id}`, d, isCritical, type: dep.type })
    }
  }
  return arrows
}

// ── Project date range ────────────────────────────────────────────────────────

export function getProjectDateRange(tasks: GanttTask[]): { origin: Date; totalDays: number } {
  let minDate: Date | null = null
  let maxDate: Date | null = null
  for (const t of tasks) {
    const s = parseDate(t.startDate) ?? parseDate(t.baselineStart)
    const e = parseDate(t.dueDate) ?? parseDate(t.baselineFinish)
    if (s && (!minDate || s < minDate)) minDate = s
    if (e && (!maxDate || e > maxDate)) maxDate = e
  }
  const origin = minDate ? addDays(minDate, -14) : addDays(new Date(), -30)
  const end = maxDate ? addDays(maxDate, 21) : addDays(new Date(), 180)
  const totalDays = Math.max(diffDays(origin, end), 60)
  return { origin, totalDays }
}
