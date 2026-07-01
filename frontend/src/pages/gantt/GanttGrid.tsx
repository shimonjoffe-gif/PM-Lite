import { useRef, useCallback, useEffect, useState, useMemo } from 'react'
import type { VisibleRow, GanttTask } from './ganttUtils'
import { ROW_H, HEADER_H } from './ganttUtils'

// ── Column definitions ─────────────────────────────────────────────────────────

export type ColumnKey = 'seq' | 'wbs' | 'name' | 'duration' | 'start' | 'finish' | 'pct' | 'status' | 'assignee' | 'type' | 'predecessor' | 'constraint'

const COL_WIDTHS: Record<ColumnKey, number> = {
  seq: 36,
  wbs: 42,
  name: 220,
  duration: 56,
  start: 88,
  finish: 88,
  pct: 50,
  status: 90,
  assignee: 110,
  type: 72,
  predecessor: 100,
  constraint: 72,
}

const COL_LABELS: Record<ColumnKey, string> = {
  seq: 'Стр',
  wbs: 'СДР',
  name: 'Название',
  duration: 'Дн',
  start: 'Начало',
  finish: 'Конец',
  pct: '%',
  status: 'Статус',
  assignee: 'Исполнитель',
  type: 'Тип',
  predecessor: 'Предш.',
  constraint: 'Ограничение',
}

const COL_MIN_W: Record<ColumnKey, number> = {
  seq: 28, wbs: 30, name: 150, duration: 40, start: 60, finish: 60,
  pct: 40, status: 60, assignee: 60, type: 50, predecessor: 60, constraint: 50,
}

// Columns where Enter should activate editing; others are display-only and are skipped
const EDITABLE_COLS = new Set<ColumnKey>(['name', 'pct', 'predecessor', 'type', 'constraint', 'status', 'assignee'])

const STATUS_LABELS: Record<string, string> = {
  todo: 'К выполнению',
  in_progress: 'В работе',
  review: 'На проверке',
  done: 'Выполнено',
  cancelled: 'Отменено',
}
const STATUS_DOTS: Record<string, string> = {
  todo: 'bg-gray-400',
  in_progress: 'bg-blue-500',
  review: 'bg-amber-400',
  done: 'bg-green-500',
  cancelled: 'bg-red-400',
}

// ── Domain options ─────────────────────────────────────────────────────────────

const CONSTRAINT_OPTS = [
  { value: 'asap',    label: 'КМР',  full: 'как можно раньше' },
  { value: 'alap',    label: 'КМП',  full: 'как можно позже' },
  { value: 'snet',    label: 'ННР',  full: 'начало не ранее' },
  { value: 'snlt',    label: 'ННП',  full: 'начало не позднее' },
  { value: 'fnet',    label: 'ОНР',  full: 'окончание не ранее' },
  { value: 'fnlt',    label: 'ОНП',  full: 'окончание не позднее' },
  { value: 'mso',     label: 'МНД',  full: 'начало должно быть (Must Start On)' },
  { value: 'mfo',     label: 'МОД',  full: 'окончание должно быть (Must Finish On)' },
  { value: 'hammock', label: 'Гамак',full: 'гамак' },
]

const TASK_TYPE_OPTS = [
  { value: 'task',           label: 'Задача' },
  { value: 'milestone',      label: 'Веха' },
  { value: 'billable_stage', label: 'Этап' },
  { value: 'management',     label: 'Управление' },
]

// Russian dep notation: ОН=FS, НН=SS, ОО=FF, НО=SF
const RU_TO_EN: Record<string, string> = { ОН: 'FS', НН: 'SS', ОО: 'FF', НО: 'SF' }
const EN_TO_RU: Record<string, string> = { FS: 'ОН', SS: 'НН', FF: 'ОО', SF: 'НО' }

// ── Helpers ────────────────────────────────────────────────────────────────────

function dateDiff(a: string | null, b: string | null): number | null {
  if (!a || !b) return null
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000) + 1
}

function addDays(date: string, days: number): string {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

// Constraints where finish date is anchor: changing duration moves start
const FIXED_FINISH = new Set(['alap', 'fnet', 'fnlt', 'mfo'])
// All date/duration fields are read-only (auto-computed from children)
const READ_ONLY_SCHED = new Set(['hammock'])

function isDescendantOf(tasks: GanttTask[], childId: string, ancestorId: string): boolean {
  let current: GanttTask | undefined = tasks.find(t => t.id === childId)
  while (current?.parentId) {
    if (current.parentId === ancestorId) return true
    current = tasks.find(t => t.id === current!.parentId)
  }
  return false
}

/** Parse text like "2ОН+5,3НН,-1ОО" → array of {predecessorId, type, lagDays} */
function parsePredText(
  text: string,
  rowNumToId: Map<number, string>,
): Array<{ predecessorId: string; type: string; lagDays: number }> {
  const result: Array<{ predecessorId: string; type: string; lagDays: number }> = []
  const parts = text.split(/[,;]\s*/)
  for (const part of parts) {
    const s = part.trim()
    if (!s) continue
    // Pattern: <num>[<type>][<lag>]
    // type can be RU (ОН,НН,ОО,НО) or EN (FS,SS,FF,SF)
    const m = s.match(/^(\d+)(ОН|НН|ОО|НО|FS|SS|FF|SF)?([+-]\d+)?$/i)
    if (!m) continue
    const rowNum = parseInt(m[1])
    const typeStr = (m[2] ?? 'ОН').toUpperCase()
    const type = RU_TO_EN[typeStr] ?? typeStr
    const lagDays = m[3] ? parseInt(m[3]) : 0
    const predecessorId = rowNumToId.get(rowNum)
    if (!predecessorId) continue
    result.push({ predecessorId, type, lagDays })
  }
  return result
}

/** Render deps as text: "2ОН+5, 3НН" */
function depsToText(
  deps: GanttTask['dependencies'],
  idToRowNum: Map<string, number>,
): string {
  return deps.map(d => {
    const rowNum = idToRowNum.get(d.predecessorId)
    if (rowNum === undefined) return null
    const typeRu = EN_TO_RU[d.type] ?? d.type
    const lag = d.lagDays !== 0 ? (d.lagDays > 0 ? `+${d.lagDays}` : `${d.lagDays}`) : ''
    return `${rowNum}${typeRu}${lag}`
  }).filter(Boolean).join(', ')
}

// ── EditableCell ───────────────────────────────────────────────────────────────

function EditableCell({
  value, type, onCommit, width, placeholder, min, max,
}: {
  value: string | number | null
  type: 'text' | 'date' | 'number'
  onCommit: (val: string) => void
  width: number
  placeholder?: string
  min?: number
  max?: number
}) {
  const [localVal, setLocalVal] = useState(String(value ?? ''))
  const [focused, setFocused] = useState(false)
  const originalVal = useRef(String(value ?? ''))

  useEffect(() => {
    if (!focused) {
      const s = String(value ?? '')
      setLocalVal(s)
      originalVal.current = s
    }
  }, [value, focused])

  return (
    <input
      type={type}
      value={localVal}
      onChange={e => setLocalVal(e.target.value)}
      onFocus={() => { setFocused(true); originalVal.current = localVal }}
      onBlur={e => {
        setFocused(false)
        if (e.target.value !== originalVal.current) onCommit(e.target.value)
      }}
      onKeyDown={e => {
        if (e.key === 'Enter') {
          e.stopPropagation()
          ;(e.target as HTMLInputElement).blur()
          const grid = (e.target as HTMLElement).closest('[tabindex="0"]') as HTMLElement | null
          grid?.focus()
        } else if (e.key === 'Escape') {
          e.stopPropagation()
          e.nativeEvent.stopImmediatePropagation()
          ;(e.target as HTMLInputElement).value = originalVal.current
          setLocalVal(originalVal.current)
          ;(e.target as HTMLInputElement).blur()
          const grid = (e.target as HTMLElement).closest('[tabindex="0"]') as HTMLElement | null
          grid?.focus()
        } else if (e.key === 'Insert') {
          // Commit cell edit first, then let Insert bubble to grid for addBelow
          ;(e.target as HTMLInputElement).blur()
          const grid = (e.target as HTMLElement).closest('[tabindex="0"]') as HTMLElement | null
          grid?.focus()
        } else if (e.key === 'Delete') {
          e.stopPropagation()
        }
      }}
      placeholder={placeholder}
      min={min}
      max={max}
      className="w-full h-full px-1 text-xs bg-transparent focus:outline-none focus:bg-blue-50 rounded"
      style={{ width }}
    />
  )
}

// ── PredecessorCell ────────────────────────────────────────────────────────────

function PredecessorCell({
  task, rowNumToId, idToRowNum, onAddDep, onRemoveDep,
}: {
  task: GanttTask
  rowNumToId: Map<number, string>
  idToRowNum: Map<string, number>
  onAddDep: (predecessorId: string, type: string, lagDays: number) => void
  onRemoveDep: (depId: string) => void
}) {
  const [text, setText] = useState(() => depsToText(task.dependencies, idToRowNum))
  const [focused, setFocused] = useState(false)
  const prevDepsRef = useRef(task.dependencies)

  // Refresh display text when deps change from server (only when not editing)
  useEffect(() => {
    if (!focused && task.dependencies !== prevDepsRef.current) {
      setText(depsToText(task.dependencies, idToRowNum))
      prevDepsRef.current = task.dependencies
    }
  }, [task.dependencies, focused, idToRowNum])

  // Also refresh when visible rows change (idToRowNum changes), recalculate display
  useEffect(() => {
    if (!focused) {
      setText(depsToText(task.dependencies, idToRowNum))
    }
  }, [idToRowNum]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleBlur = () => {
    setFocused(false)
    const newParsed = parsePredText(text, rowNumToId)
    const existing = task.dependencies

    // deps to remove: existing deps not present in new parsed list (match by predecessorId+type+lag)
    const toRemove = existing.filter(e =>
      !newParsed.some(n => n.predecessorId === e.predecessorId && n.type === e.type && n.lagDays === e.lagDays)
    )
    // deps to add: parsed deps not already in existing
    const toAdd = newParsed.filter(n =>
      !existing.some(e => e.predecessorId === n.predecessorId && e.type === n.type && e.lagDays === n.lagDays)
    )

    for (const dep of toRemove) onRemoveDep(dep.id)
    for (const dep of toAdd) onAddDep(dep.predecessorId, dep.type, dep.lagDays)

    // Normalize display (clean up typos / sort)
    setText(depsToText(
      [
        ...existing.filter(e => !toRemove.includes(e)),
        ...toAdd.map(n => ({ ...n, id: 'pending' })),
      ],
      idToRowNum,
    ))
  }

  return (
    <input
      type="text"
      value={text}
      onChange={e => setText(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={handleBlur}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === 'Escape') {
          e.stopPropagation()
          e.nativeEvent.stopImmediatePropagation()
          ;(e.target as HTMLInputElement).blur()
          const grid = (e.target as HTMLElement).closest('[tabindex="0"]') as HTMLElement | null
          grid?.focus()
          return
        }
        e.stopPropagation()
      }}
      title="Формат: <Стр><тип>[±лаг]. Тип: ОН НН ОО НО. Пример: 2ОН+3"
      className="w-full h-full px-1 text-xs bg-transparent focus:outline-none focus:bg-blue-50 rounded font-mono"
    />
  )
}

// ── GridRow ────────────────────────────────────────────────────────────────────

function GridRow({
  row, seqNum, wbs, rowNumToId, idToRowNum, columns, colWidths,
  isSelected, focusedCol, onClick, onOpenDrawer, onToggleExpand, onUpdate, fullWidth, lastCol,
  onDragStart, dragIndicator,
  onAddDep, onRemoveDep,
  isPendingEdit, isRecalcChanged, changedCols,
  members = [],
}: {
  row: VisibleRow
  seqNum: number
  wbs: string
  rowNumToId: Map<number, string>
  idToRowNum: Map<string, number>
  columns: ColumnKey[]
  colWidths: Partial<Record<ColumnKey, number>>
  isSelected: boolean
  focusedCol?: ColumnKey | null
  onClick: () => void
  onOpenDrawer: (col: ColumnKey) => void
  onToggleExpand: () => void
  onUpdate: (patch: Partial<GanttTask>) => void
  fullWidth?: boolean
  lastCol?: ColumnKey
  onDragStart?: (e: React.MouseEvent) => void
  dragIndicator?: 'before' | 'into' | 'after' | null
  onAddDep: (predecessorId: string, type: string, lagDays: number) => void
  onRemoveDep: (depId: string) => void
  isPendingEdit?: boolean
  isRecalcChanged?: boolean
  changedCols?: Set<ColumnKey>
  members?: { userId: string; fullName: string }[]
}) {
  const getW = (col: ColumnKey) => colWidths[col] ?? COL_WIDTHS[col]
  const { task, depth, hasChildren, isExpanded } = row
  const [nameEditing, setNameEditing] = useState(false)
  const [localConstraint, setLocalConstraint] = useState(task.constraintType ?? 'asap')
  const [localType, setLocalType] = useState(task.taskType ?? 'task')
  const [localStatus, setLocalStatus] = useState(task.status ?? 'todo')
  const [localAssignee, setLocalAssignee] = useState(task.assigneeId ?? '')
  const constraintOrigRef = useRef(task.constraintType ?? 'asap')
  const typeOrigRef = useRef(task.taskType ?? 'task')
  const statusOrigRef = useRef(task.status ?? 'todo')
  const assigneeOrigRef = useRef(task.assigneeId ?? '')
  const selectHandledRef = useRef(false) // prevents onBlur from double-updating after Enter/Esc

  // sync local select state when server data changes
  useEffect(() => { setLocalConstraint(task.constraintType ?? 'asap') }, [task.constraintType])
  useEffect(() => { setLocalType(task.taskType ?? 'task') }, [task.taskType])
  useEffect(() => { setLocalStatus(task.status ?? 'todo') }, [task.status])
  useEffect(() => { setLocalAssignee(task.assigneeId ?? '') }, [task.assigneeId])

  function focusGrid(target: EventTarget) {
    const grid = (target as HTMLElement).closest('[tabindex="0"]') as HTMLElement | null
    grid?.focus()
  }

  function selectKeyDown(
    e: React.KeyboardEvent<HTMLSelectElement>,
    origRef: React.MutableRefObject<string>,
    revertKey: string,
    setter: (v: string) => void,
    transform?: (v: string) => any
  ) {
    if (e.key === 'Enter') {
      e.stopPropagation(); e.nativeEvent.stopImmediatePropagation()
      const val = (e.target as HTMLSelectElement).value
      const prev = origRef.current
      origRef.current = val
      selectHandledRef.current = true
      if (val !== prev) onUpdate({ [revertKey]: transform ? transform(val) : val } as any)
      ;(e.target as HTMLSelectElement).blur(); focusGrid(e.target)
    } else if (e.key === 'Escape') {
      e.stopPropagation(); e.nativeEvent.stopImmediatePropagation()
      selectHandledRef.current = true
      setter(origRef.current)
      ;(e.target as HTMLSelectElement).blur(); focusGrid(e.target)
    }
  }

  function cellContent(col: ColumnKey) {
    const w = COL_WIDTHS[col]
    switch (col) {
      case 'seq':
        return <span className="text-[10px] text-gray-400 select-none tabular-nums">{seqNum}</span>

      case 'wbs':
        return <span className="text-[10px] text-gray-400 select-none">{wbs}</span>

      case 'name':
        return (
          <div className="flex items-start gap-1 w-full py-1" style={{ paddingLeft: depth * 16 }}>
            {hasChildren ? (
              <button
                onClick={e => { e.stopPropagation(); onToggleExpand() }}
                className="flex-shrink-0 w-4 h-4 mt-0.5 flex items-center justify-center text-gray-400 hover:text-gray-600"
              >
                <svg className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
              </button>
            ) : (
              <span className="flex-shrink-0 w-4" />
            )}
            {nameEditing ? (
              <input
                type="text"
                autoFocus
                defaultValue={task.title}
                key={task.title}
                onBlur={e => {
                  setNameEditing(false)
                  if (e.target.value && e.target.value !== task.title) onUpdate({ title: e.target.value })
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === 'Escape') {
                    e.stopPropagation()
                    e.nativeEvent.stopImmediatePropagation()
                    if (e.key === 'Escape') {
                      ;(e.target as HTMLInputElement).value = task.title
                    }
                    ;(e.target as HTMLInputElement).blur()
                    const grid = (e.target as HTMLElement).closest('[tabindex="0"]') as HTMLElement | null
                    grid?.focus()
                    return
                  }
                  e.stopPropagation()
                }}
                className="flex-1 min-w-0 text-xs bg-blue-50 focus:outline-none rounded px-1"
              />
            ) : (
              <span
                className="flex-1 min-w-0 text-xs px-1 break-words whitespace-normal leading-snug cursor-text"
                onClick={() => setNameEditing(true)}
                title={task.title}
              >
                {task.title}
              </span>
            )}
          </div>
        )

      case 'duration': {
        const displayDur = task.duration ?? dateDiff(task.startDate, task.dueDate)
        const ct = task.constraintType ?? ''
        if (READ_ONLY_SCHED.has(ct)) {
          return <span className="text-xs text-gray-400 select-none">{displayDur ?? '—'}</span>
        }
        return (
          <EditableCell type="number" value={displayDur} min={1} max={9999}
            onCommit={v => {
              const n = parseInt(v)
              if (!(n > 0)) return
              if (FIXED_FINISH.has(ct) && task.dueDate) {
                onUpdate({ duration: n, startDate: addDays(task.dueDate, -(n - 1)) })
              } else if (!FIXED_FINISH.has(ct) && task.startDate) {
                onUpdate({ duration: n, dueDate: addDays(task.startDate, n - 1) })
              } else {
                onUpdate({ duration: n })
              }
            }}
            width={w} placeholder="—"
          />
        )
      }

      case 'start': {
        const ctS = task.constraintType ?? ''
        if (READ_ONLY_SCHED.has(ctS)) {
          return <span className="text-xs text-gray-400 select-none">{task.startDate ?? '—'}</span>
        }
        return (
          <EditableCell type="date" value={task.startDate}
            onCommit={v => {
              if (!v) return
              const patch: Partial<GanttTask> = { startDate: v }
              const d = dateDiff(v, task.dueDate)
              if (d && d > 0) patch.duration = d
              onUpdate(patch)
            }}
            width={w}
          />
        )
      }

      case 'finish': {
        const ctF = task.constraintType ?? ''
        if (READ_ONLY_SCHED.has(ctF)) {
          return <span className="text-xs text-gray-400 select-none">{task.dueDate ?? '—'}</span>
        }
        return (
          <EditableCell type="date" value={task.dueDate}
            onCommit={v => {
              if (!v) return
              const patch: Partial<GanttTask> = { dueDate: v }
              const d = dateDiff(task.startDate, v)
              if (d && d > 0) patch.duration = d
              onUpdate(patch)
            }}
            width={w}
          />
        )
      }

      case 'pct':
        return (
          <EditableCell type="number" value={task.percentComplete} min={0} max={100}
            onCommit={v => onUpdate({ percentComplete: Math.max(0, Math.min(100, parseInt(v) || 0)) })}
            width={w} placeholder="0"
          />
        )

      case 'status':
        return (
          <select
            value={localStatus}
            onChange={e => { e.stopPropagation(); setLocalStatus(e.target.value) }}
            onFocus={() => { statusOrigRef.current = localStatus }}
            onKeyDown={e => selectKeyDown(e, statusOrigRef, 'status', setLocalStatus)}
            onBlur={e => {
              if (selectHandledRef.current) { selectHandledRef.current = false; return }
              const val = e.target.value
              if (val !== task.status) onUpdate({ status: val as any })
            }}
            className="w-full text-xs bg-transparent focus:outline-none cursor-pointer"
          >
            {Object.entries(STATUS_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        )

      case 'assignee':
        return (
          <select
            value={localAssignee}
            onChange={e => { e.stopPropagation(); setLocalAssignee(e.target.value) }}
            onFocus={() => { assigneeOrigRef.current = localAssignee }}
            onKeyDown={e => selectKeyDown(e, assigneeOrigRef, 'assigneeId', setLocalAssignee, v => v || null)}
            onBlur={e => {
              if (selectHandledRef.current) { selectHandledRef.current = false; return }
              const val = e.target.value
              if (val !== (task.assigneeId ?? '')) onUpdate({ assigneeId: val || null })
            }}
            className="w-full text-xs bg-transparent focus:outline-none cursor-pointer"
          >
            <option value="">—</option>
            {members.map(m => (
              <option key={m.userId} value={m.userId}>{m.fullName}</option>
            ))}
          </select>
        )

      case 'type':
        return (
          <select
            value={localType}
            onChange={e => { e.stopPropagation(); setLocalType(e.target.value) }}
            onFocus={() => { typeOrigRef.current = localType }}
            onKeyDown={e => selectKeyDown(e, typeOrigRef, 'taskType', setLocalType)}
            onBlur={e => {
              if (selectHandledRef.current) { selectHandledRef.current = false; return }
              const val = e.target.value
              if (val !== (task.taskType ?? 'task')) onUpdate({ taskType: val })
            }}
            className="w-full text-xs bg-transparent focus:outline-none cursor-pointer"
          >
            {TASK_TYPE_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        )

      case 'constraint':
        return (
          <select
            value={localConstraint}
            onChange={e => { e.stopPropagation(); setLocalConstraint(e.target.value) }}
            onFocus={() => { constraintOrigRef.current = localConstraint }}
            onKeyDown={e => selectKeyDown(e, constraintOrigRef, 'constraintType', setLocalConstraint)}
            onBlur={e => {
              if (selectHandledRef.current) { selectHandledRef.current = false; return }
              const val = e.target.value
              if (val !== (task.constraintType ?? 'asap')) onUpdate({ constraintType: val })
            }}
            className="w-full text-xs bg-transparent focus:outline-none cursor-pointer"
            title={CONSTRAINT_OPTS.find(o => o.value === localConstraint)?.full}
          >
            {CONSTRAINT_OPTS.map(o => (
              <option key={o.value} value={o.value}>{o.label} — {o.full}</option>
            ))}
          </select>
        )

      case 'predecessor':
        return (
          <PredecessorCell
            task={task}
            rowNumToId={rowNumToId}
            idToRowNum={idToRowNum}
            onAddDep={onAddDep}
            onRemoveDep={onRemoveDep}
          />
        )

      default:
        return null
    }
  }

  const statusColor = {
    todo: 'border-l-gray-300',
    in_progress: 'border-l-blue-500',
    review: 'border-l-amber-400',
    done: 'border-l-green-500',
    cancelled: 'border-l-red-400',
  }[task.status] ?? 'border-l-gray-200'

  const dragCls =
    dragIndicator === 'before' ? 'border-t-2 border-t-blue-500' :
    dragIndicator === 'after'  ? 'border-b-2 border-b-blue-500' :
    dragIndicator === 'into'   ? 'ring-1 ring-inset ring-blue-400 bg-blue-50' : ''

  const rowBg = isSelected
    ? 'bg-blue-50'
    : isPendingEdit
      ? 'bg-amber-50 hover:bg-amber-100'
      : isRecalcChanged
        ? 'bg-teal-50 hover:bg-teal-100'
        : 'hover:bg-gray-50'

  return (
    <div
      data-row-id={task.id}
      className={`group relative flex items-start border-b border-gray-100 cursor-pointer border-l-2 ${statusColor} ${rowBg} ${dragCls}`}
      style={{ minHeight: ROW_H }}
      onClick={onClick}
    >
      {/* Drag handle — overlaid on left edge, visible on hover */}
      <div
        className="absolute left-0 top-0 bottom-0 w-4 flex items-center justify-center opacity-0 group-hover:opacity-60 cursor-grab active:cursor-grabbing text-gray-400 z-10 hover:opacity-100"
        onMouseDown={e => { e.stopPropagation(); e.preventDefault(); onDragStart?.(e) }}
        title="Перетащить"
      >
        <svg viewBox="0 0 6 10" width="6" height="10" fill="currentColor">
          <circle cx="1.5" cy="1.5" r="1" /><circle cx="4.5" cy="1.5" r="1" />
          <circle cx="1.5" cy="5"   r="1" /><circle cx="4.5" cy="5"   r="1" />
          <circle cx="1.5" cy="8.5" r="1" /><circle cx="4.5" cy="8.5" r="1" />
        </svg>
      </div>

      {columns.map(col => {
        const isStretch = fullWidth && col === lastCol
        const isName = col === 'name'
        const isFocused = isSelected && focusedCol === col
        return (
          <div
            key={col}
            data-task-id={task.id}
            data-col={col}
            className={`flex overflow-hidden border-r border-gray-100 px-1 ${isStretch ? 'flex-1 min-w-0' : 'flex-shrink-0'} ${isName ? 'items-start' : 'items-center'} ${changedCols?.has(col) ? 'bg-amber-100' : ''} ${isFocused ? 'ring-2 ring-inset ring-blue-400' : ''}`}
            style={{ width: isStretch ? undefined : getW(col), minHeight: ROW_H }}
            onDoubleClick={e => { e.stopPropagation(); onOpenDrawer(col) }}
          >
            {cellContent(col)}
          </div>
        )
      })}
    </div>
  )
}

// Column → TaskDrawer field mapping
const COL_TO_FIELD: Partial<Record<ColumnKey, string>> = {
  name:        'title',
  start:       'startDate',
  finish:      'dueDate',
  duration:    'duration',
  pct:         'percentComplete',
  status:      'status',
  assignee:    'assignee',
  type:        'taskType',
  constraint:  'constraintType',
  predecessor: 'deps',
}

// ── GanttGrid ─────────────────────────────────────────────────────────────────

interface GanttGridProps {
  visibleRows: VisibleRow[]
  allTasks: GanttTask[]
  wbsMap: Map<string, string>
  columns: ColumnKey[]
  selectedId: string | null
  scrollRef: React.RefObject<HTMLDivElement | null>
  onScrollY: (y: number) => void
  onSelectTask: (id: string) => void
  onOpenDrawer: (id: string, field?: string) => void
  onToggleExpand: (id: string) => void
  onTaskUpdate: (taskId: string, patch: Partial<GanttTask>) => void
  onAddBelow: (taskId: string) => void
  onDeleteTask: (taskId: string) => void
  onIndent: (taskId: string) => void
  onOutdent: (taskId: string) => void
  onMoveUp: (taskId: string) => void
  onMoveDown: (taskId: string) => void
  onDeselect?: () => void
  isDrawerOpen?: boolean
  onAddDep: (taskId: string, predecessorId: string, type: string, lagDays: number) => void
  onRemoveDep: (taskId: string, depId: string) => void
  onMoveTask: (dragId: string, targetId: string, pos: 'before' | 'into' | 'after') => void
  onRowHeightsChange?: (heights: number[]) => void
  fullWidth?: boolean
  pendingEditIds?: Set<string>
  recalcRowIds?: Set<string>
  changedColsMap?: Map<string, Set<ColumnKey>>
  members?: { userId: string; fullName: string }[]
}

export function GanttGrid({
  visibleRows, allTasks, wbsMap, columns, selectedId,
  scrollRef, onScrollY, onSelectTask, onOpenDrawer, onToggleExpand, onTaskUpdate,
  onAddBelow, onDeleteTask, onIndent, onOutdent, onMoveUp, onMoveDown,
  onDeselect, isDrawerOpen,
  onAddDep, onRemoveDep, onMoveTask,
  onRowHeightsChange,
  fullWidth = false,
  pendingEditIds, recalcRowIds, changedColsMap,
  members = [],
}: GanttGridProps) {
  // ── Column resize ───────────────────────────────────────────────────────────
  const [colW, setColW] = useState<Partial<Record<ColumnKey, number>>>({})
  const colWRef = useRef(colW)
  useEffect(() => { colWRef.current = colW }, [colW])

  // ── Container width tracking (for auto-stretch of name column) ───────────
  const outerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  useEffect(() => {
    const el = outerRef.current
    if (!el) return
    const obs = new ResizeObserver(entries => {
      setContainerWidth(entries[0]?.contentRect.width ?? 0)
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const getW = (col: ColumnKey) => colW[col] ?? COL_WIDTHS[col]

  // name column stretches to fill available width (unless user manually resized it)
  const stretchCol: ColumnKey = columns.includes('name') ? 'name' : columns[columns.length - 1]
  const otherColsW = columns.filter(c => c !== stretchCol).reduce((s, c) => s + getW(c), 0)
  const autoStretchW = containerWidth > 0
    ? Math.max(COL_MIN_W[stretchCol], containerWidth - otherColsW - 2)
    : getW(stretchCol)
  const effectiveColW: Partial<Record<ColumnKey, number>> = {
    ...colW,
    [stretchCol]: colW[stretchCol] ?? autoStretchW,
  }
  const getWE = (col: ColumnKey) => effectiveColW[col] ?? COL_WIDTHS[col]

  // Keep effective widths accessible in resize callbacks
  const effectiveColWRef = useRef(effectiveColW)
  useEffect(() => { effectiveColWRef.current = effectiveColW })

  const onResizeStart = useCallback((col: ColumnKey, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    const startX = e.clientX
    const startW = effectiveColWRef.current[col] ?? COL_WIDTHS[col]
    const onMove = (ev: MouseEvent) => {
      setColW(prev => ({ ...prev, [col]: Math.max(COL_MIN_W[col], startW + ev.clientX - startX) }))
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [])

  // ── Row number maps (seq ↔ taskId) ──────────────────────────────────────────
  const rowNumToId = useMemo(() => {
    const m = new Map<number, string>()
    visibleRows.forEach((row, idx) => m.set(idx + 1, row.task.id))
    return m
  }, [visibleRows])

  const idToRowNum = useMemo(() => {
    const m = new Map<string, number>()
    visibleRows.forEach((row, idx) => m.set(row.task.id, idx + 1))
    return m
  }, [visibleRows])

  // ── Cell focus (keyboard navigation) ──────────────────────────────────────
  const [focusedCol, setFocusedCol] = useState<ColumnKey | null>(null)

  // ── Drag-and-drop ───────────────────────────────────────────────────────────
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<{ id: string; pos: 'before' | 'into' | 'after' } | null>(null)
  const dragOverRef = useRef(dragOver)
  const dragIdRef = useRef(dragId)
  useEffect(() => { dragOverRef.current = dragOver }, [dragOver])
  useEffect(() => { dragIdRef.current = dragId }, [dragId])

  const handleDragStart = useCallback((e: React.MouseEvent, id: string) => {
    e.preventDefault()
    setDragId(id)

    const onMove = (ev: MouseEvent) => {
      const el = document.elementFromPoint(ev.clientX, ev.clientY)
      const rowEl = el?.closest('[data-row-id]') as HTMLElement | null
      if (!rowEl) { setDragOver(null); return }
      const rowId = rowEl.dataset.rowId!
      const curDragId = dragIdRef.current
      if (!rowId || rowId === curDragId) { setDragOver(null); return }
      if (isDescendantOf(allTasks, rowId, curDragId!)) { setDragOver(null); return }
      const bounds = rowEl.getBoundingClientRect()
      const pct = (ev.clientY - bounds.top) / bounds.height
      const pos: 'before' | 'into' | 'after' = pct < 0.3 ? 'before' : pct > 0.7 ? 'after' : 'into'
      setDragOver(prev => (prev?.id === rowId && prev?.pos === pos ? prev : { id: rowId, pos }))
    }

    const onUp = () => {
      const cur = dragOverRef.current
      const curId = dragIdRef.current
      if (cur && curId) onMoveTask(curId, cur.id, cur.pos)
      setDragId(null)
      setDragOver(null)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    document.body.style.cursor = 'grabbing'
    document.body.style.userSelect = 'none'
  }, [allTasks, onMoveTask])

  // ── Keyboard ────────────────────────────────────────────────────────────────
  const innerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (selectedId) innerRef.current?.focus({ preventScroll: true })
  }, [selectedId])

  // ── Row height measurement (for Gantt sync) ──────────────────────────────
  // Observe a rows-wrapper div (NOT the scroll container — its flex-1 height is fixed
  // so ResizeObserver wouldn't fire when individual rows grow from text wrapping).
  const rowsWrapRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!onRowHeightsChange) return
    const wrapper = rowsWrapRef.current
    if (!wrapper) return
    const measure = () => {
      const rows = wrapper.querySelectorAll<HTMLElement>('[data-row-id]')
      const heights = Array.from(rows).map(el => el.offsetHeight)
      if (heights.length > 0) onRowHeightsChange(heights)
    }
    // Measure immediately after layout paint
    requestAnimationFrame(measure)
    // Re-measure whenever wrapper height changes (rows grow/shrink)
    const obs = new ResizeObserver(measure)
    obs.observe(wrapper)
    return () => obs.disconnect()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onRowHeightsChange, visibleRows])

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    onScrollY((e.target as HTMLDivElement).scrollTop)
  }, [onScrollY])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName
    const isEditing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
    // Esc: if focus was in a cell input/select → just return to grid; otherwise close drawer / deselect
    if (e.key === 'Escape') {
      e.preventDefault()
      if (isEditing) { outerRef.current?.focus(); return }
      if (isDrawerOpen) { onDeselect?.(); return }
      onDeselect?.()
      return
    }
    // Insert works even when triggered from a cell edit (blur committed the value first)
    if (e.key === 'Insert' && selectedId) {
      e.preventDefault(); onAddBelow(selectedId); return
    }

    if (!selectedId || isEditing) return

    const curIdx = visibleRows.findIndex(r => r.task.id === selectedId)

    if (e.key === 'ArrowUp' && e.ctrlKey) {
      e.preventDefault(); onMoveUp(selectedId)
    } else if (e.key === 'ArrowDown' && e.ctrlKey) {
      e.preventDefault(); onMoveDown(selectedId)
    } else if (e.key === 'ArrowRight' && e.ctrlKey) {
      e.preventDefault(); onIndent(selectedId)
    } else if (e.key === 'ArrowLeft' && e.ctrlKey) {
      e.preventDefault(); onOutdent(selectedId)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (!focusedCol) setFocusedCol(columns.includes('name') ? 'name' : columns[0])
      if (curIdx > 0) {
        const newId = visibleRows[curIdx - 1].task.id
        onSelectTask(newId)
        outerRef.current?.querySelector(`[data-row-id="${newId}"]`)?.scrollIntoView({ block: 'nearest' })
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!focusedCol) setFocusedCol(columns.includes('name') ? 'name' : columns[0])
      if (curIdx < visibleRows.length - 1) {
        const newId = visibleRows[curIdx + 1].task.id
        onSelectTask(newId)
        outerRef.current?.querySelector(`[data-row-id="${newId}"]`)?.scrollIntoView({ block: 'nearest' })
      }
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      const startIdx = focusedCol ? columns.indexOf(focusedCol) : columns.length
      // find nearest editable col to the left
      let idx = startIdx - 1
      while (idx >= 0 && !EDITABLE_COLS.has(columns[idx])) idx--
      if (idx >= 0) setFocusedCol(columns[idx])
      else if (startIdx > 0) setFocusedCol(columns[startIdx - 1])
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      const startIdx = focusedCol ? columns.indexOf(focusedCol) : -1
      // find nearest editable col to the right
      let idx = startIdx + 1
      while (idx < columns.length && !EDITABLE_COLS.has(columns[idx])) idx++
      if (idx < columns.length) setFocusedCol(columns[idx])
      else if (startIdx < columns.length - 1) setFocusedCol(columns[startIdx + 1])
    } else if (e.key === 'Enter' && !e.shiftKey && focusedCol) {
      e.preventDefault()
      if (!EDITABLE_COLS.has(focusedCol)) return
      const cellEl = outerRef.current?.querySelector(`[data-task-id="${selectedId}"][data-col="${focusedCol}"]`)
      if (!cellEl) return
      const input = cellEl.querySelector('input, select') as HTMLElement | null
      if (input) { input.focus(); return }
      const span = cellEl.querySelector('.cursor-text') as HTMLElement | null
      if (span) span.click()
    } else if (e.key === 'Delete' && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
      e.preventDefault()
      if (window.confirm('Удалить задачу?')) onDeleteTask(selectedId)
    }
  }, [selectedId, focusedCol, isDrawerOpen, onDeselect, onDeleteTask, onIndent, onOutdent, onMoveUp, onMoveDown, onAddBelow, onSelectTask, visibleRows, columns])

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div
      ref={outerRef}
      className={`flex flex-col h-full border-r border-gray-200 ${fullWidth ? 'flex-1 min-w-0' : ''} w-full`}
    >
      {/* Single scroll container: header + rows share one scrollbar */}
      <div
        ref={(el) => {
          ;(scrollRef as React.MutableRefObject<HTMLDivElement | null>).current = el
          ;(innerRef as React.MutableRefObject<HTMLDivElement | null>).current = el
        }}
        className="overflow-auto flex-1 outline-none"
        onScroll={handleScroll}
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        {/* Header: sticky top-0 inside the scroll container — sticks vertically, scrolls horizontally with content */}
        <div className="sticky top-0 z-20 bg-gray-50 border-b border-gray-200" style={{ height: HEADER_H }}>
          <div className="flex items-end h-full" style={{ height: HEADER_H }}>
            {columns.map(col => {
              const w = getWE(col)
              return (
                <div
                  key={col}
                  className="relative flex items-center px-1 border-r border-gray-200 text-[10px] font-semibold text-gray-500 uppercase tracking-wide select-none flex-shrink-0"
                  style={{ width: w, height: 30 }}
                >
                  {COL_LABELS[col]}
                  <div
                    className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize z-20 hover:bg-blue-400 hover:opacity-70"
                    onMouseDown={e => onResizeStart(col, e)}
                  />
                </div>
              )
            })}
          </div>
        </div>

        {/* Rows wrapper — ResizeObserver tracks this for Gantt sync */}
        <div ref={rowsWrapRef}>
          {visibleRows.map((row, idx) => (
            <GridRow
              key={row.task.id}
              row={row}
              seqNum={idx + 1}
              wbs={wbsMap.get(row.task.id) ?? ''}
              rowNumToId={rowNumToId}
              idToRowNum={idToRowNum}
              columns={columns}
              colWidths={effectiveColW}
              isSelected={selectedId === row.task.id}
              focusedCol={selectedId === row.task.id ? focusedCol : null}
              onClick={e => {
                onSelectTask(row.task.id)
                setFocusedCol(null)
                const tag = (e.target as HTMLElement).tagName
                if (tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'TEXTAREA') {
                  outerRef.current?.focus()
                }
              }}
              onOpenDrawer={col => onOpenDrawer(row.task.id, COL_TO_FIELD[col])}
              onToggleExpand={() => onToggleExpand(row.task.id)}
              onUpdate={patch => onTaskUpdate(row.task.id, patch)}
              fullWidth={fullWidth}
              lastCol={stretchCol}
              onDragStart={e => handleDragStart(e, row.task.id)}
              dragIndicator={dragOver?.id === row.task.id ? dragOver.pos : null}
              isPendingEdit={pendingEditIds?.has(row.task.id)}
              isRecalcChanged={recalcRowIds?.has(row.task.id)}
              changedCols={changedColsMap?.get(row.task.id)}
              onAddDep={(predId, type, lag) => onAddDep(row.task.id, predId, type, lag)}
              onRemoveDep={depId => onRemoveDep(row.task.id, depId)}
              members={members}
            />
          ))}

          {visibleRows.length === 0 && (
            <div className="py-10 text-center text-sm text-gray-400">
              <p>Нет задач.</p>
              <p className="text-xs mt-1">Нажмите + чтобы добавить задачу</p>
            </div>
          )}
        </div>
      </div>

    </div>
  )
}

export { COL_WIDTHS }
