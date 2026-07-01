import { useMemo } from 'react'
import { Task, TASK_STATUS_COLORS } from '@/types/task'

interface GanttChartProps {
  tasks: Task[]
  onSelectTask: (task: Task) => void
}

function getDaysBetween(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

const COL_WIDTH = 24 // px per day
const ROW_HEIGHT = 36

export function GanttChart({ tasks, onSelectTask }: GanttChartProps) {
  const { minDate, days, tasksWithDates } = useMemo(() => {
    const withDates = tasks.filter(t => t.startDate || t.dueDate)
    if (!withDates.length) return { minDate: new Date(), maxDate: new Date(), days: [], tasksWithDates: [] }

    const starts = withDates.map(t => new Date(t.startDate ?? t.dueDate!))
    const ends = withDates.map(t => new Date(t.dueDate ?? t.startDate!))

    const minDate = new Date(Math.min(...starts.map(d => d.getTime())))
    const maxDate = new Date(Math.max(...ends.map(d => d.getTime())))
    minDate.setDate(minDate.getDate() - 1)
    maxDate.setDate(maxDate.getDate() + 2)

    const totalDays = getDaysBetween(minDate, maxDate)
    const days: Date[] = []
    for (let i = 0; i <= totalDays; i++) {
      const d = new Date(minDate)
      d.setDate(d.getDate() + i)
      days.push(d)
    }

    return { minDate, days, tasksWithDates: withDates }
  }, [tasks])

  if (!tasksWithDates.length) {
    return (
      <div className="py-12 text-center text-sm text-gray-400">
        Укажите даты начала и окончания задач для отображения на диаграмме Ганта
      </div>
    )
  }

  const today = new Date()
  const todayOffset = getDaysBetween(minDate, today)

  // Group days by month for header
  const monthGroups: { label: string; span: number }[] = []
  let curMonth = ''
  days.forEach(d => {
    const label = `${d.toLocaleString('ru', { month: 'short' })} ${d.getFullYear()}`
    if (label !== curMonth) {
      monthGroups.push({ label, span: 1 })
      curMonth = label
    } else {
      monthGroups[monthGroups.length - 1].span++
    }
  })

  return (
    <div className="overflow-auto rounded-xl border border-gray-200 bg-white">
      <div className="flex">
        {/* Task name column */}
        <div className="flex-shrink-0 w-48 border-r border-gray-100">
          {/* Header spacer */}
          <div className="h-10 border-b border-gray-100 bg-gray-50" />
          <div className="h-8 border-b border-gray-100 bg-gray-50" />
          {tasksWithDates.map(t => (
            <div
              key={t.id}
              className="h-9 flex items-center px-3 border-b border-gray-50 cursor-pointer hover:bg-gray-50"
              style={{ height: ROW_HEIGHT }}
              onClick={() => onSelectTask(t)}
            >
              <span className="text-xs text-gray-700 truncate">{t.title}</span>
            </div>
          ))}
        </div>

        {/* Timeline */}
        <div className="overflow-x-auto flex-1">
          <div style={{ width: days.length * COL_WIDTH }}>
            {/* Month header */}
            <div className="flex h-10 border-b border-gray-100 bg-gray-50">
              {monthGroups.map((g, i) => (
                <div
                  key={i}
                  className="flex-shrink-0 border-r border-gray-100 flex items-center justify-center text-xs font-medium text-gray-500"
                  style={{ width: g.span * COL_WIDTH }}
                >
                  {g.label}
                </div>
              ))}
            </div>

            {/* Day header */}
            <div className="flex h-8 border-b border-gray-100 bg-gray-50">
              {days.map((d, i) => {
                const isWkend = d.getDay() === 0 || d.getDay() === 6
                return (
                  <div
                    key={i}
                    className={`flex-shrink-0 flex items-center justify-center text-[10px] ${isWkend ? 'text-gray-300 bg-gray-50' : 'text-gray-400'}`}
                    style={{ width: COL_WIDTH }}
                  >
                    {d.getDate()}
                  </div>
                )
              })}
            </div>

            {/* Rows */}
            {tasksWithDates.map(t => {
              const start = t.startDate ? new Date(t.startDate) : new Date(t.dueDate!)
              const end = t.dueDate ? new Date(t.dueDate) : new Date(t.startDate!)
              const left = getDaysBetween(minDate, start)
              const width = Math.max(1, getDaysBetween(start, end) + 1)

              return (
                <div
                  key={t.id}
                  className="relative border-b border-gray-50"
                  style={{ height: ROW_HEIGHT }}
                >
                  {/* Weekend shading */}
                  {days.map((d, i) => {
                    const isWkend = d.getDay() === 0 || d.getDay() === 6
                    return isWkend ? (
                      <div
                        key={i}
                        className="absolute top-0 bottom-0 bg-gray-50"
                        style={{ left: i * COL_WIDTH, width: COL_WIDTH }}
                      />
                    ) : null
                  })}

                  {/* Today line */}
                  {todayOffset >= 0 && todayOffset < days.length && (
                    <div
                      className="absolute top-0 bottom-0 w-px bg-blue-400 z-10"
                      style={{ left: todayOffset * COL_WIDTH }}
                    />
                  )}

                  {/* Bar */}
                  <div
                    className="absolute top-2 h-5 rounded cursor-pointer hover:opacity-80 transition-opacity flex items-center px-2"
                    style={{
                      left: left * COL_WIDTH + 1,
                      width: width * COL_WIDTH - 2,
                      backgroundColor: TASK_STATUS_COLORS[t.status],
                    }}
                    onClick={() => onSelectTask(t)}
                    title={t.title}
                  >
                    <span className="text-white text-[10px] truncate">{t.title}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
