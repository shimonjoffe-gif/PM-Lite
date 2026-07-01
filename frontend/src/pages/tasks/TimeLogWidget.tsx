import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { effortApi } from '@/api/effort'
import type { TimeEntry } from '@/types/effort'

function getMonday(d: Date): Date {
  const date = new Date(d)
  date.setHours(0, 0, 0, 0)
  const dow = date.getDay()
  const diff = dow === 0 ? -6 : 1 - dow
  date.setDate(date.getDate() + diff)
  return date
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function fmt(d: Date): string {
  return d.toISOString().split('T')[0]
}

function fmtShort(d: Date): string {
  return d.toLocaleDateString('ru', { day: 'numeric', month: 'short' })
}

function dayName(d: Date): string {
  return d.toLocaleDateString('ru', { weekday: 'short' })
}

// ── Week navigation + per-day hours grid ────────────────────────────────────

export function TimeLogWidget({ taskId, userId }: { taskId: string; userId: string }) {
  const qc = useQueryClient()
  const [weekOffset, setWeekOffset] = useState(0)

  const today = new Date()
  const monday = getMonday(addDays(today, weekOffset * 7))
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i))
  const from = fmt(monday)
  const to = fmt(days[6])

  const { data: entries = [] } = useQuery<TimeEntry[]>({
    queryKey: ['time-entries', taskId, userId, from, to],
    queryFn: () => effortApi.getTimeEntries({ taskId, userId, from, to }),
  })

  const entryMap = new Map(entries.map(e => [e.date.slice(0, 10), e]))

  const saveMut = useMutation({
    mutationFn: ({ date, hours }: { date: string; hours: number }) =>
      effortApi.upsertTimeEntry({ taskId, date, hours }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['time-entries', taskId] }),
  })

  const weekTotal = entries.reduce((s, e) => s + Number(e.hours), 0)

  return (
    <div className="space-y-3">
      {/* Week selector */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setWeekOffset(o => o - 1)}
          className="p-1 text-gray-400 hover:text-gray-600"
        >
          ‹
        </button>
        <span className="text-sm font-medium text-gray-700">
          {fmtShort(monday)} — {fmtShort(days[6])}
        </span>
        <button
          onClick={() => setWeekOffset(o => o + 1)}
          className="p-1 text-gray-400 hover:text-gray-600"
        >
          ›
        </button>
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-1">
        {days.map(day => {
          const dateStr = fmt(day)
          const isWeekend = day.getDay() === 0 || day.getDay() === 6
          const isFuture = day > today
          const existing = entryMap.get(dateStr)
          const storedHours = existing ? Number(existing.hours) : 0

          return (
            <div key={dateStr} className="flex flex-col items-center gap-1">
              <div className={`text-[9px] font-medium ${isWeekend ? 'text-gray-400' : 'text-gray-500'}`}>
                {dayName(day)}
              </div>
              <div className={`text-[9px] ${isWeekend ? 'text-gray-300' : 'text-gray-400'}`}>
                {fmtShort(day)}
              </div>
              <input
                type="number"
                min={0}
                max={24}
                step={0.5}
                disabled={isFuture}
                defaultValue={storedHours > 0 ? storedHours : ''}
                key={dateStr + storedHours}
                className={`
                  w-full text-center text-sm border rounded py-1
                  ${isWeekend ? 'bg-gray-50 text-gray-400' : 'bg-white'}
                  ${isFuture ? 'opacity-40 cursor-not-allowed' : 'focus:outline-none focus:ring-1 focus:ring-indigo-400'}
                  ${storedHours > 0 ? 'border-indigo-300 bg-indigo-50 font-medium text-indigo-700' : 'border-gray-200 text-gray-700'}
                `}
                onBlur={e => {
                  const newVal = parseFloat(e.target.value) || 0
                  if (newVal !== storedHours) {
                    saveMut.mutate({ date: dateStr, hours: newVal })
                  }
                }}
              />
            </div>
          )
        })}
      </div>

      {/* Week total */}
      <div className="text-right">
        <span className="text-xs text-gray-400">Итого за неделю: </span>
        <span className="text-sm font-bold text-indigo-700">{weekTotal} ч</span>
      </div>

      {saveMut.isPending && (
        <p className="text-xs text-gray-400 text-center">Сохранение...</p>
      )}
    </div>
  )
}
