import { useState, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { resourcesApi } from '@/api/resources'
import type { UserTimelineRow, DayLoad, TaskSlot } from '@/types/resource'
import { ImportModal } from './ImportModal'

// ── Date helpers ──────────────────────────────────────────────────────────────
function getMonthRange(offset = 0): { from: string; to: string; label: string } {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() + offset)
  const from = d.toISOString().slice(0, 10)
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  const to = last.toISOString().slice(0, 10)
  const label = d.toLocaleDateString('ru', { month: 'long', year: 'numeric' })
  return { from, to, label }
}

function getWeekDates(from: string, to: string): string[] {
  const dates: string[] = []
  const d = new Date(from)
  const end = new Date(to)
  while (d <= end) {
    dates.push(d.toISOString().slice(0, 10))
    d.setDate(d.getDate() + 1)
  }
  return dates
}

function loadColor(pct: number): string {
  if (pct === 0) return 'bg-gray-50'
  if (pct <= 50) return 'bg-green-100'
  if (pct <= 80) return 'bg-blue-100'
  if (pct <= 100) return 'bg-yellow-100'
  return 'bg-red-200'
}

function loadTextColor(pct: number): string {
  if (pct === 0) return 'text-gray-300'
  if (pct <= 80) return 'text-gray-600'
  if (pct <= 100) return 'text-yellow-700'
  return 'text-red-700 font-semibold'
}

// ── Day cell ──────────────────────────────────────────────────────────────────
function DayCell({ day, onClick }: { day: DayLoad; onClick?: () => void }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      className={`relative w-8 h-8 flex items-center justify-center rounded text-xs cursor-default select-none border border-transparent
        ${loadColor(day.loadPct)} ${loadTextColor(day.loadPct)}
        ${day.isOverloaded ? 'ring-1 ring-red-400' : ''}
        ${onClick ? 'cursor-pointer hover:ring-1 hover:ring-blue-300' : ''}
      `}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
    >
      {day.capacityHours > 0 ? `${day.loadPct}%` : <span className="text-gray-200">—</span>}

      {/* Tooltip */}
      {hovered && day.capacityHours > 0 && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 z-50 bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap pointer-events-none">
          {day.date}<br />
          {day.assignedHours}ч / {day.capacityHours}ч ({day.loadPct}%)<br />
          {day.taskCount} задач
          {day.isOverloaded && <><br /><span className="text-red-300">Перегрузка!</span></>}
          {day.isParallelOverloaded && !day.isOverloaded && <><br /><span className="text-yellow-300">Параллельные задачи</span></>}
        </div>
      )}
    </div>
  )
}

// ── User row ──────────────────────────────────────────────────────────────────
function UserRow({ row, dates }: { row: UserTimelineRow; dates: string[] }) {
  const [expanded, setExpanded] = useState(false)

  const dayMap = new Map(row.days.map(d => [d.date, d]))

  return (
    <>
      <tr className="hover:bg-gray-50 border-b border-gray-100">
        {/* Name */}
        <td className="w-48 px-3 py-2 sticky left-0 bg-white z-10 border-r border-gray-100">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setExpanded(v => !v)}
              className="w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-gray-600 flex-shrink-0"
            >
              <svg className={`h-3 w-3 transition-transform ${expanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold flex items-center justify-center flex-shrink-0">
              {row.fullName.charAt(0).toUpperCase()}
            </div>
            <span className="text-sm text-gray-800 truncate">{row.fullName}</span>
          </div>
        </td>
        {/* Capacity */}
        <td className="w-16 px-2 py-2 text-center text-xs text-gray-500 border-r border-gray-100">
          {row.capacity}ч/д
        </td>
        {/* Days */}
        {dates.map(date => {
          const day = dayMap.get(date) ?? {
            date,
            capacityHours: 0,
            assignedHours: 0,
            taskCount: 0,
            loadPct: 0,
            isOverloaded: false,
            isParallelOverloaded: false,
          }
          return (
            <td key={date} className="px-0.5 py-1">
              <DayCell day={day} />
            </td>
          )
        })}
      </tr>

      {/* Expanded tasks */}
      {expanded && row.tasks && row.tasks.length > 0 && (
        <tr className="bg-blue-50/30">
          <td colSpan={2 + dates.length} className="px-6 py-2">
            <div className="space-y-1">
              {row.tasks.map(t => <TaskSlotRow key={t.taskId} task={t} dates={dates} />)}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ── Task slot row (expanded) ──────────────────────────────────────────────────
function TaskSlotRow({ task, dates }: { task: TaskSlot; dates: string[] }) {
  const start = task.startDate
  const end = task.dueDate

  return (
    <div className="flex items-center gap-2 text-xs text-gray-600 h-6">
      {/* Gantt bar */}
      <div className="relative flex-1 h-4 flex items-center">
        {/* Date cells row */}
        <div className="flex gap-0.5 items-center" style={{ paddingLeft: 192 }}>
          {dates.map(date => {
            const inRange = start && end ? date >= start && date <= end : false
            return (
              <div
                key={date}
                className={`w-8 h-3 rounded-sm ${inRange ? 'bg-blue-400' : ''}`}
              />
            )
          })}
        </div>
      </div>
      {/* Label */}
      <span className="text-gray-500 truncate max-w-48">
        {task.projectName} / {task.taskTitle}
      </span>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function ResourcesPage() {
  const [monthOffset, setMonthOffset] = useState(0)
  const [groupBy, setGroupBy] = useState<'user' | 'project'>('user')
  const [showImport, setShowImport] = useState(false)
  const { from, to, label } = getMonthRange(monthOffset)
  const dates = getWeekDates(from, to)

  const { data, isLoading } = useQuery({
    queryKey: ['timeline', from, to, groupBy],
    queryFn: () => resourcesApi.getTimeline({ from, to, groupBy }),
    staleTime: 60_000,
  })

  const rows = (data?.rows ?? []) as UserTimelineRow[]

  // Scroll header dates
  const scrollRef = useRef<HTMLDivElement>(null)

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMonthOffset(v => v - 1)}
            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-sm font-semibold text-gray-800 capitalize min-w-36 text-center">{label}</span>
          <button
            onClick={() => setMonthOffset(v => v + 1)}
            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <button
            onClick={() => setMonthOffset(0)}
            className="text-xs text-blue-600 hover:underline"
          >
            Сегодня
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* Group by */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            {(['user', 'project'] as const).map(g => (
              <button
                key={g}
                onClick={() => setGroupBy(g)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  groupBy === g ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {g === 'user' ? 'По людям' : 'По проектам'}
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
            </svg>
            Импорт
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-6 py-2 border-b border-gray-100 bg-gray-50 flex-shrink-0 text-xs text-gray-500">
        {[
          { color: 'bg-green-100', label: '1–50%' },
          { color: 'bg-blue-100', label: '51–80%' },
          { color: 'bg-yellow-100', label: '81–100%' },
          { color: 'bg-red-200', label: '>100% перегрузка' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1">
            <div className={`w-3 h-3 rounded ${color}`} />
            <span>{label}</span>
          </div>
        ))}
        <span className="ml-4 text-gray-400">Красная рамка = перегрузка по часам</span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto" ref={scrollRef}>
        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-sm text-gray-400">Загрузка...</div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-sm text-gray-400 gap-2">
            <svg className="h-8 w-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span>Нет данных о загрузке за выбранный период</span>
          </div>
        ) : (
          <table className="w-full border-collapse text-sm" style={{ minWidth: 700 }}>
            <thead className="sticky top-0 z-20 bg-white border-b border-gray-200">
              <tr>
                <th className="sticky left-0 bg-white z-20 w-48 text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider border-r border-gray-100">
                  Сотрудник
                </th>
                <th className="w-16 text-center px-2 py-2 text-xs font-semibold text-gray-500 border-r border-gray-100">
                  Норма
                </th>
                {dates.map(date => {
                  const d = new Date(date)
                  const dow = d.getDay()
                  const isWeekend = dow === 0 || dow === 6
                  const isToday = date === new Date().toISOString().slice(0, 10)
                  return (
                    <th
                      key={date}
                      className={`w-8 px-0.5 py-1 text-center text-[10px] font-medium ${
                        isToday ? 'text-blue-600 font-bold' : isWeekend ? 'text-gray-300' : 'text-gray-500'
                      }`}
                    >
                      <div>{d.getDate()}</div>
                      <div className="text-[9px]">
                        {['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'][dow]}
                      </div>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <UserRow key={row.userId} row={row} dates={dates} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showImport && <ImportModal onClose={() => setShowImport(false)} />}
    </div>
  )
}
