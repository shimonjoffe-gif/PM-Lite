import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { resourcesApi } from '@/api/resources'
import type { NonWorkingDay } from '@/types/resource'

const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']
function getCalendarGrid(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1)
  const last = new Date(year, month + 1, 0)
  const startDow = first.getDay() // 0=Sun
  // Align to Mon=0
  const offset = startDow === 0 ? 6 : startDow - 1
  const grid: (Date | null)[] = Array(offset).fill(null)
  for (let d = 1; d <= last.getDate(); d++) {
    grid.push(new Date(year, month, d))
  }
  while (grid.length % 7 !== 0) grid.push(null)
  return grid
}

interface AddDayModalProps {
  date: string
  existing?: NonWorkingDay
  onSave: (data: { type: 'holiday' | 'extra_workday'; name?: string }) => void
  onDelete?: () => void
  onClose: () => void
}

function AddDayModal({ date, existing, onSave, onDelete, onClose }: AddDayModalProps) {
  const [type, setType] = useState<'holiday' | 'extra_workday'>(existing?.type ?? 'holiday')
  const [name, setName] = useState(existing?.name ?? '')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-80 mx-4 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">
            {new Date(date + 'T00:00:00').toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' })}
          </h3>
          <button onClick={onClose} className="p-1 rounded text-gray-400 hover:text-gray-600">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Тип</label>
          <div className="flex gap-2">
            {[
              { v: 'holiday', label: 'Выходной / праздник' },
              { v: 'extra_workday', label: 'Рабочий день (перенос)' },
            ].map(opt => (
              <button
                key={opt.v}
                onClick={() => setType(opt.v as any)}
                className={`flex-1 py-1.5 text-xs rounded-lg border font-medium transition-colors ${
                  type === opt.v ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Название (необязательно)</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Например: День России"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex gap-2">
          {existing && onDelete && (
            <button
              onClick={onDelete}
              className="px-3 py-2 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
            >
              Удалить
            </button>
          )}
          <button onClick={onClose} className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50">
            Отмена
          </button>
          <button onClick={() => onSave({ type, name: name.trim() || undefined })} className="flex-1 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            Сохранить
          </button>
        </div>
      </div>
    </div>
  )
}

export function ProductionCalendarPage() {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [editingDate, setEditingDate] = useState<string | null>(null)
  const qc = useQueryClient()

  const { data: days = [] } = useQuery({
    queryKey: ['org-calendar', year],
    queryFn: () => resourcesApi.getCalendar(year),
  })

  const dayMap = new Map(days.map(d => [d.date, d]))

  const upsertMutation = useMutation({
    mutationFn: (data: { date: string; type: 'holiday' | 'extra_workday'; name?: string }) =>
      resourcesApi.upsertCalendarDay(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org-calendar', year] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => resourcesApi.deleteCalendarDay(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org-calendar', year] }),
  })

  const importMutation = useMutation({
    mutationFn: ({ country, year }: { country: string; year: number }) =>
      resourcesApi.importCalendarPreset(country, year),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['org-calendar', year] })
      alert(data.message)
    },
  })

  const grid = getCalendarGrid(year, viewMonth)
  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setYear(y => y - 1) }
    else setViewMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setYear(y => y + 1) }
    else setViewMonth(m => m + 1)
  }

  const holidayCount = days.filter(d => d.type === 'holiday').length
  const extraCount = days.filter(d => d.type === 'extra_workday').length

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Производственный календарь</h1>
          <p className="text-sm text-gray-500 mt-1">
            {year}: {holidayCount} праздников, {extraCount} переносов
          </p>
        </div>
        <button
          onClick={() => importMutation.mutate({ country: 'RU', year })}
          disabled={importMutation.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Загрузить РФ {year}
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Month nav */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <button onClick={prevMonth} className="p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-gray-900">{MONTHS[viewMonth]} {year}</span>
            <select
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              className="text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none"
            >
              {[2024, 2025, 2026, 2027].map(y => <option key={y}>{y}</option>)}
            </select>
          </div>
          <button onClick={nextMonth} className="p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-gray-100">
          {['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(d => (
            <div key={d} className={`py-2 text-center text-xs font-medium ${d === 'Сб' || d === 'Вс' ? 'text-red-400' : 'text-gray-500'}`}>
              {d}
            </div>
          ))}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-7">
          {grid.map((date, i) => {
            if (!date) {
              return <div key={i} className="h-10 border-b border-r border-gray-50" />
            }
            const key = date.toISOString().slice(0, 10)
            const nwd = dayMap.get(key)
            const dow = date.getDay() // 0=Sun, 6=Sat
            const isWeekend = dow === 0 || dow === 6
            const isToday = key === new Date().toISOString().slice(0, 10)

            let bg = ''
            if (nwd?.type === 'holiday') bg = 'bg-red-50'
            else if (nwd?.type === 'extra_workday') bg = 'bg-green-50'
            else if (isWeekend) bg = 'bg-gray-50'

            return (
              <button
                key={key}
                onClick={() => setEditingDate(key)}
                title={nwd?.name ?? undefined}
                className={`relative h-10 flex items-center justify-center text-sm border-b border-r border-gray-100 hover:bg-blue-50 transition-colors ${bg}`}
              >
                <span className={`
                  w-7 h-7 flex items-center justify-center rounded-full text-sm
                  ${isToday ? 'bg-blue-600 text-white font-bold' : ''}
                  ${!isToday && isWeekend && !nwd ? 'text-red-400' : ''}
                  ${!isToday && nwd?.type === 'holiday' ? 'text-red-600 font-medium' : ''}
                  ${!isToday && nwd?.type === 'extra_workday' ? 'text-green-700 font-medium' : ''}
                  ${!isToday && !isWeekend && !nwd ? 'text-gray-700' : ''}
                `}>
                  {date.getDate()}
                </span>
                {nwd && (
                  <span className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${nwd.type === 'holiday' ? 'bg-red-400' : 'bg-green-400'}`} />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-5 text-xs text-gray-500">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-red-50 border border-red-200" />
          <span>Нерабочий / праздник</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-green-50 border border-green-200" />
          <span>Рабочий (перенос)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-gray-50 border border-gray-200" />
          <span>Выходной (по расписанию)</span>
        </div>
      </div>

      {/* Day list */}
      {days.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-800">Все отмеченные дни ({year})</p>
          </div>
          <div className="divide-y divide-gray-50 max-h-64 overflow-y-auto">
            {days.map(d => (
              <div key={d.id} className="flex items-center justify-between px-4 py-2.5">
                <div className="flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${d.type === 'holiday' ? 'bg-red-400' : 'bg-green-400'}`} />
                  <div>
                    <p className="text-sm text-gray-800">
                      {new Date(d.date + 'T00:00:00').toLocaleDateString('ru', { day: 'numeric', month: 'long' })}
                    </p>
                    {d.name && <p className="text-xs text-gray-400">{d.name}</p>}
                  </div>
                </div>
                <button
                  onClick={() => deleteMutation.mutate(d.id)}
                  className="p-1 rounded text-gray-300 hover:text-red-500"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {editingDate && (
        <AddDayModal
          date={editingDate}
          existing={dayMap.get(editingDate)}
          onSave={(data) => {
            upsertMutation.mutate({ date: editingDate, ...data })
            setEditingDate(null)
          }}
          onDelete={
            dayMap.get(editingDate)
              ? () => {
                  deleteMutation.mutate(dayMap.get(editingDate)!.id)
                  setEditingDate(null)
                }
              : undefined
          }
          onClose={() => setEditingDate(null)}
        />
      )}
    </div>
  )
}
