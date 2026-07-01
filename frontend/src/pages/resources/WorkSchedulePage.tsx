import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { resourcesApi } from '@/api/resources'
import type { WorkSchedule } from '@/types/resource'
import { WORK_SCHEDULE_LABELS, DAY_LABELS } from '@/types/resource'

const PRESET_SCHEDULES: Record<string, Partial<WorkSchedule>> = {
  five_two: { scheduleType: 'five_two', hoursPerDay: 8, workDays: [1, 2, 3, 4, 5], shiftStart: '09:00', shiftEnd: '18:00' },
  two_two: { scheduleType: 'two_two', hoursPerDay: 12, workDays: [1, 2], shiftStart: '07:00', shiftEnd: '19:00' },
  six_one: { scheduleType: 'six_one', hoursPerDay: 7, workDays: [1, 2, 3, 4, 5, 6], shiftStart: '09:00', shiftEnd: '17:00' },
}

const DEFAULT_SCHEDULE: WorkSchedule = {
  scheduleType: 'five_two',
  hoursPerDay: 8,
  workDays: [1, 2, 3, 4, 5],
  shiftStart: '09:00',
  shiftEnd: '18:00',
}

function ScheduleForm({
  initial,
  onSave,
  onReset,
  saving,
  title,
}: {
  initial: WorkSchedule
  onSave: (s: WorkSchedule) => void
  onReset?: () => void
  saving: boolean
  title: string
}) {
  const [form, setForm] = useState<WorkSchedule>(initial)

  useEffect(() => setForm(initial), [initial])

  const toggleDay = (day: number) => {
    const next = form.workDays.includes(day)
      ? form.workDays.filter(d => d !== day)
      : [...form.workDays, day].sort()
    setForm(f => ({ ...f, workDays: next }))
  }

  const applyPreset = (key: string) => {
    const p = PRESET_SCHEDULES[key]
    if (p) setForm(f => ({ ...f, ...p }))
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>

      {/* Presets */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-2">Пресет графика</label>
        <div className="flex flex-wrap gap-2">
          {Object.entries(WORK_SCHEDULE_LABELS).map(([key, label]) => (
            <button
              key={key}
              onClick={() => applyPreset(key)}
              className={`px-3 py-1.5 text-xs rounded-lg border font-medium transition-colors ${
                form.scheduleType === key
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Work days */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-2">Рабочие дни</label>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5, 6, 7].map(d => (
            <button
              key={d}
              onClick={() => toggleDay(d)}
              className={`w-10 h-10 rounded-lg text-xs font-medium border transition-colors ${
                form.workDays.includes(d)
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'border-gray-200 text-gray-500 hover:bg-gray-50'
              }`}
            >
              {DAY_LABELS[d]}
            </button>
          ))}
        </div>
      </div>

      {/* Hours + shift */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Часов в день</label>
          <input
            type="number"
            min={0.5}
            max={24}
            step={0.5}
            value={form.hoursPerDay}
            onChange={e => setForm(f => ({ ...f, hoursPerDay: Number(e.target.value) }))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Начало смены</label>
          <input
            type="time"
            value={form.shiftStart}
            onChange={e => setForm(f => ({ ...f, shiftStart: e.target.value }))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Конец смены</label>
          <input
            type="time"
            value={form.shiftEnd}
            onChange={e => setForm(f => ({ ...f, shiftEnd: e.target.value }))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={() => onSave(form)}
          disabled={saving}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Сохранение...' : 'Сохранить'}
        </button>
        {onReset && (
          <button
            onClick={onReset}
            className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50"
          >
            Сбросить к орг. расписанию
          </button>
        )}
      </div>
    </div>
  )
}

export function WorkSchedulePage() {
  const qc = useQueryClient()

  const { data: orgSchedule, isLoading } = useQuery({
    queryKey: ['org-schedule'],
    queryFn: () => resourcesApi.getOrgSchedule(),
  })

  const saveMutation = useMutation({
    mutationFn: (s: WorkSchedule) => resourcesApi.setOrgSchedule(s),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org-schedule'] }),
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-gray-400">Загрузка...</div>
    )
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-lg font-bold text-gray-900">Рабочий график</h1>
        <p className="text-sm text-gray-500 mt-1">
          Базовый график организации используется для расчёта загрузки и планирования задач.
          Каждый сотрудник может задать свой личный график в профиле.
        </p>
      </div>

      <ScheduleForm
        title="График организации"
        initial={orgSchedule ?? DEFAULT_SCHEDULE}
        onSave={(s) => saveMutation.mutate(s)}
        saving={saveMutation.isPending}
      />

      {/* Info box */}
      <div className="flex gap-3 p-4 bg-blue-50 rounded-xl border border-blue-100 text-sm text-blue-800">
        <svg className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div>
          <p className="font-medium">Как работает расчёт загрузки</p>
          <p className="mt-1 text-blue-700">
            Система распределяет трудоёмкость задачи равномерно по рабочим дням диапазона [начало, срок].
            При расчёте учитываются праздники из производственного календаря и персональный график сотрудника.
            Сотрудники с графиком 2/2 имеют другой ритм рабочих дней — их загрузка считается по их личному расписанию.
          </p>
        </div>
      </div>
    </div>
  )
}
