import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { tasksApi } from '@/api/tasks'
import { Task, TASK_STATUS_COLORS } from '@/types/task'

interface TaskCalendarProps {
  projectId?: string
  onSelectTask: (task: Task & { projectName?: string | null }) => void
}

function getMonthRange(year: number, month: number) {
  const start = new Date(year, month, 1)
  const end = new Date(year, month + 1, 0)
  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
  }
}

function getWeekRange(date: Date) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  const mon = new Date(d.setDate(diff))
  const sun = new Date(mon)
  sun.setDate(sun.getDate() + 6)
  return {
    from: mon.toISOString().slice(0, 10),
    to: sun.toISOString().slice(0, 10),
  }
}

const WEEK_DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']

export function TaskCalendar({ projectId, onSelectTask }: TaskCalendarProps) {
  const [view, setView] = useState<'month' | 'week'>('month')
  const [current, setCurrent] = useState(() => new Date())

  const range = view === 'month'
    ? getMonthRange(current.getFullYear(), current.getMonth())
    : getWeekRange(current)

  const { data } = useQuery({
    queryKey: ['tasks-calendar', range.from, range.to, projectId],
    queryFn: () => tasksApi.calendar(range.from, range.to, projectId),
  })

  const tasks = data?.items ?? []

  const tasksByDate: Record<string, typeof tasks> = {}
  tasks.forEach(t => {
    const key = t.dueDate ?? t.startDate ?? ''
    if (!key) return
    if (!tasksByDate[key]) tasksByDate[key] = []
    tasksByDate[key].push(t)
  })

  const prev = () => {
    setCurrent(c => {
      const d = new Date(c)
      if (view === 'month') d.setMonth(d.getMonth() - 1)
      else d.setDate(d.getDate() - 7)
      return d
    })
  }

  const next = () => {
    setCurrent(c => {
      const d = new Date(c)
      if (view === 'month') d.setMonth(d.getMonth() + 1)
      else d.setDate(d.getDate() + 7)
      return d
    })
  }

  // Build calendar grid for month view
  const renderMonth = () => {
    const year = current.getFullYear()
    const month = current.getMonth()
    const firstDay = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    // Monday-first: shift
    const startOffset = (firstDay === 0 ? 6 : firstDay - 1)
    const cells: (number | null)[] = Array(startOffset).fill(null)
    for (let d = 1; d <= daysInMonth; d++) cells.push(d)
    while (cells.length % 7 !== 0) cells.push(null)

    const today = new Date().toISOString().slice(0, 10)

    return (
      <div className="grid grid-cols-7 gap-px bg-gray-100 border border-gray-100 rounded-xl overflow-hidden">
        {WEEK_DAYS.map(d => (
          <div key={d} className="bg-gray-50 text-center text-xs font-medium text-gray-500 py-2">{d}</div>
        ))}
        {cells.map((day, idx) => {
          if (!day) return <div key={idx} className="bg-white min-h-24" />
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const dayTasks = tasksByDate[dateStr] ?? []
          const isToday = dateStr === today

          return (
            <div key={idx} className={`bg-white min-h-24 p-1.5 ${isToday ? 'bg-blue-50' : ''}`}>
              <p className={`text-xs font-medium mb-1 ${isToday ? 'text-blue-600' : 'text-gray-500'}`}>{day}</p>
              <div className="space-y-0.5">
                {dayTasks.slice(0, 3).map(t => (
                  <button
                    key={t.id}
                    onClick={() => onSelectTask(t)}
                    className="w-full text-left text-[11px] px-1 py-0.5 rounded truncate text-white"
                    style={{ backgroundColor: TASK_STATUS_COLORS[t.status] }}
                    title={t.title}
                  >
                    {t.title}
                  </button>
                ))}
                {dayTasks.length > 3 && (
                  <p className="text-[11px] text-gray-400">+{dayTasks.length - 3} ещё</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // Week view
  const renderWeek = () => {
    const monday = new Date(range.from)
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday)
      d.setDate(d.getDate() + i)
      return d
    })
    const today = new Date().toISOString().slice(0, 10)

    return (
      <div className="grid grid-cols-7 gap-px bg-gray-100 border border-gray-100 rounded-xl overflow-hidden">
        {days.map(day => {
          const dateStr = day.toISOString().slice(0, 10)
          const dayTasks = tasksByDate[dateStr] ?? []
          const isToday = dateStr === today

          return (
            <div key={dateStr} className={`bg-white p-2 min-h-48 ${isToday ? 'bg-blue-50' : ''}`}>
              <p className={`text-xs font-semibold mb-2 ${isToday ? 'text-blue-600' : 'text-gray-500'}`}>
                {WEEK_DAYS[day.getDay() === 0 ? 6 : day.getDay() - 1]} {day.getDate()}
              </p>
              <div className="space-y-1">
                {dayTasks.map(t => (
                  <button
                    key={t.id}
                    onClick={() => onSelectTask(t)}
                    className="w-full text-left px-1.5 py-1 rounded text-xs text-white"
                    style={{ backgroundColor: TASK_STATUS_COLORS[t.status] }}
                  >
                    <p className="font-medium truncate">{t.title}</p>
                    {(t as any).projectName && (
                      <p className="opacity-80 truncate">{(t as any).projectName}</p>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  const title = view === 'month'
    ? `${MONTHS[current.getMonth()]} ${current.getFullYear()}`
    : `${range.from} — ${range.to}`

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={prev} className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">
          <svg className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="text-sm font-medium text-gray-700 min-w-36 text-center">{title}</span>
        <button onClick={next} className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">
          <svg className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
        <div className="ml-auto flex rounded-lg border border-gray-200 overflow-hidden">
          {(['month', 'week'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 text-xs transition-colors ${view === v ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              {v === 'month' ? 'Месяц' : 'Неделя'}
            </button>
          ))}
        </div>
      </div>

      {view === 'month' ? renderMonth() : renderWeek()}
    </div>
  )
}
