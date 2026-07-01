import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { resourcesApi } from '@/api/resources'
import type { WorkSchedulePreset } from '@/types/resource'
import { Button } from '@/components/ui/Button'
import { DAY_LABELS } from '@/types/resource'

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONTH_NAMES = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек']

// ── Preset Form ───────────────────────────────────────────────────────────────

interface PresetFormData {
  name: string
  hoursPerDay: number
  hoursPerDayMap: Record<string, number> | null // null = uniform; {1:8.5,5:6} = per-day
  usePerDay: boolean // UI toggle
  workDays: number[]
  isShift: boolean
  cycleDays: number
  workDaysInCycle: number
}

const EMPTY_FORM: PresetFormData = {
  name: '',
  hoursPerDay: 8,
  hoursPerDayMap: null,
  usePerDay: false,
  workDays: [1, 2, 3, 4, 5],
  isShift: false,
  cycleDays: 4,
  workDaysInCycle: 2,
}

function buildMapFromForm(form: PresetFormData): Record<string, number> | null {
  if (!form.usePerDay || form.isShift) return null
  const map: Record<string, number> = {}
  for (const d of form.workDays) {
    map[String(d)] = form.hoursPerDayMap?.[String(d)] ?? form.hoursPerDay
  }
  return map
}

function avgHours(map: Record<string, number> | null, fallback: number): number {
  if (!map) return fallback
  const vals = Object.values(map)
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : fallback
}

function PresetForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial?: PresetFormData
  onSave: (d: PresetFormData) => void
  onCancel: () => void
  saving: boolean
}) {
  const [form, setForm] = useState<PresetFormData>(initial ?? EMPTY_FORM)

  const toggleDay = (day: number) =>
    setForm(f => ({
      ...f,
      workDays: f.workDays.includes(day) ? f.workDays.filter(d => d !== day) : [...f.workDays, day].sort(),
    }))

  const setDayHours = (day: number, val: number) =>
    setForm(f => ({
      ...f,
      hoursPerDayMap: { ...(f.hoursPerDayMap ?? {}), [String(day)]: val },
    }))

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">Название</label>
          <input
            type="text"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Например: Посменный сотрудник"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Тип графика</label>
          <select
            value={form.isShift ? 'shift' : 'weekly'}
            onChange={e => setForm(f => ({ ...f, isShift: e.target.value === 'shift', usePerDay: false }))}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="weekly">Недельный (фиксированные дни)</option>
            <option value="shift">Сменный (ротация)</option>
          </select>
        </div>

        {form.isShift ? (
          <>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Часов в смену</label>
              <input
                type="number" min={0.5} max={24} step={0.5}
                value={form.hoursPerDay}
                onChange={e => setForm(f => ({ ...f, hoursPerDay: parseFloat(e.target.value) || 8 }))}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Длина цикла (дней)</label>
              <input
                type="number" min={2} max={28}
                value={form.cycleDays}
                onChange={e => setForm(f => ({ ...f, cycleDays: parseInt(e.target.value) || 4 }))}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Рабочих дней в цикле</label>
              <input
                type="number" min={1} max={form.cycleDays - 1}
                value={form.workDaysInCycle}
                onChange={e => setForm(f => ({ ...f, workDaysInCycle: parseInt(e.target.value) || 2 }))}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </>
        ) : (
          <>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-2">Рабочие дни</label>
              <div className="flex gap-2 flex-wrap">
                {[1, 2, 3, 4, 5, 6, 7].map(d => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDay(d)}
                    className={`w-10 h-10 rounded-md text-sm font-medium transition-colors ${
                      form.workDays.includes(d)
                        ? 'bg-blue-600 text-white'
                        : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {DAY_LABELS[d]}
                  </button>
                ))}
              </div>
            </div>

            {/* Hours mode toggle */}
            <div className="col-span-2">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.usePerDay}
                  onChange={e => setForm(f => ({ ...f, usePerDay: e.target.checked }))}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-xs text-gray-600">Разные часы по дням</span>
              </label>
            </div>

            {form.usePerDay ? (
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-2">Часов по дням</label>
                <div className="flex flex-wrap gap-3">
                  {form.workDays.map(d => (
                    <div key={d} className="flex flex-col items-center gap-1">
                      <span className="text-xs text-gray-500">{DAY_LABELS[d]}</span>
                      <input
                        type="number" min={0.5} max={24} step={0.5}
                        value={form.hoursPerDayMap?.[String(d)] ?? form.hoursPerDay}
                        onChange={e => setDayHours(d, parseFloat(e.target.value) || form.hoursPerDay)}
                        className="w-14 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Часов в день</label>
                <input
                  type="number" min={0.5} max={24} step={0.5}
                  value={form.hoursPerDay}
                  onChange={e => setForm(f => ({ ...f, hoursPerDay: parseFloat(e.target.value) || 8 }))}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}
          </>
        )}
      </div>

      <div className="flex gap-2">
        <Button size="sm" loading={saving} onClick={() => onSave(form)}>Сохранить</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Отмена</Button>
      </div>
    </div>
  )
}

// ── Presets Section ───────────────────────────────────────────────────────────

function PresetsSection() {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)

  const { data: presets = [], isLoading } = useQuery({
    queryKey: ['work-schedule-presets'],
    queryFn: () => resourcesApi.getPresets(),
  })

  const createMut = useMutation({
    mutationFn: (d: PresetFormData) => {
      const map = buildMapFromForm(d)
      return resourcesApi.createPreset({
        name: d.name,
        hoursPerDay: map ? avgHours(map, d.hoursPerDay) : d.hoursPerDay,
        hoursPerDayMap: map,
        workDays: d.isShift ? [] : d.workDays,
        cycleDays: d.isShift ? d.cycleDays : null,
        workDaysInCycle: d.isShift ? d.workDaysInCycle : null,
      })
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['work-schedule-presets'] }); setShowCreate(false) },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, d }: { id: string; d: PresetFormData }) => {
      const map = buildMapFromForm(d)
      return resourcesApi.updatePreset(id, {
        name: d.name,
        hoursPerDay: map ? avgHours(map, d.hoursPerDay) : d.hoursPerDay,
        hoursPerDayMap: map,
        workDays: d.isShift ? [] : d.workDays,
        cycleDays: d.isShift ? d.cycleDays : null,
        workDaysInCycle: d.isShift ? d.workDaysInCycle : null,
      })
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['work-schedule-presets'] }); setEditId(null) },
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => resourcesApi.deletePreset(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['work-schedule-presets'] }),
  })

  const systemPresets = presets.filter(p => p.isSystem)
  const orgPresets = presets.filter(p => !p.isSystem)

  const describePreset = (p: WorkSchedulePreset) => {
    if (p.cycleDays && p.workDaysInCycle) {
      return `${p.workDaysInCycle}/${p.cycleDays - p.workDaysInCycle} ротация · ${p.hoursPerDay} ч/смену`
    }
    const days = (p.workDays ?? []).map((d: number) => DAY_LABELS[d]).join(', ')
    if (p.hoursPerDayMap) {
      const parts = (p.workDays ?? []).map((d: number) => `${DAY_LABELS[d]} ${p.hoursPerDayMap![String(d)] ?? p.hoursPerDay}ч`)
      return `${parts.join(', ')}`
    }
    return `${days} · ${p.hoursPerDay} ч/день`
  }

  if (isLoading) return <p className="text-sm text-gray-400">Загрузка...</p>

  return (
    <div className="space-y-4">
      {/* System presets */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Системные пресеты</p>
        <div className="space-y-1">
          {systemPresets.map(p => (
            <div key={p.id} className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5">
              <div>
                <span className="text-sm font-medium text-gray-800">{p.name}</span>
                <span className="ml-3 text-xs text-gray-500">{describePreset(p)}</span>
              </div>
              <span className="text-xs text-gray-400 bg-gray-200 px-2 py-0.5 rounded-full">Системный</span>
            </div>
          ))}
        </div>
      </div>

      {/* Org custom presets */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Кастомные пресеты организации</p>
          {!showCreate && (
            <Button size="sm" variant="secondary" onClick={() => setShowCreate(true)}>+ Добавить</Button>
          )}
        </div>

        {showCreate && (
          <div className="mb-3">
            <PresetForm
              onSave={d => createMut.mutate(d)}
              onCancel={() => setShowCreate(false)}
              saving={createMut.isPending}
            />
          </div>
        )}

        <div className="space-y-2">
          {orgPresets.length === 0 && !showCreate && (
            <p className="text-sm text-gray-400">Кастомных пресетов нет</p>
          )}
          {orgPresets.map(p => (
            <div key={p.id}>
              {editId === p.id ? (
                <PresetForm
                  initial={{
                    name: p.name,
                    hoursPerDay: p.hoursPerDay,
                    hoursPerDayMap: p.hoursPerDayMap,
                    usePerDay: !!p.hoursPerDayMap,
                    workDays: p.workDays ?? [],
                    isShift: !!p.cycleDays,
                    cycleDays: p.cycleDays ?? 4,
                    workDaysInCycle: p.workDaysInCycle ?? 2,
                  }}
                  onSave={d => updateMut.mutate({ id: p.id, d })}
                  onCancel={() => setEditId(null)}
                  saving={updateMut.isPending}
                />
              ) : (
                <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-2.5">
                  <div>
                    <span className="text-sm font-medium text-gray-800">{p.name}</span>
                    <span className="ml-3 text-xs text-gray-500">{describePreset(p)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setEditId(p.id)}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Изменить
                    </button>
                    <button
                      onClick={() => {
                        if (confirm('Удалить пресет?')) deleteMut.mutate(p.id)
                      }}
                      className="text-xs text-red-500 hover:underline"
                    >
                      Удалить
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Calendar Section ──────────────────────────────────────────────────────────

function CalendarSection() {
  const qc = useQueryClient()
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)
  const [syncMsg, setSyncMsg] = useState('')
  const [syncing, setSyncing] = useState(false)

  const { data: days = [], isLoading } = useQuery({
    queryKey: ['org-calendar', year],
    queryFn: () => resourcesApi.getCalendar(year),
  })

  const holidaySet = new Set(days.filter(d => d.type === 'holiday').map(d => d.date))

  const addDayMut = useMutation({
    mutationFn: (date: string) => resourcesApi.upsertCalendarDay({ date, type: 'holiday', name: 'Нерабочий день' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org-calendar', year] }),
  })

  const removeDayMut = useMutation({
    mutationFn: (id: string) => resourcesApi.deleteCalendarDay(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org-calendar', year] }),
  })

  const handleSync = async () => {
    setSyncing(true)
    setSyncMsg('')
    try {
      const result = await resourcesApi.importCalendarPreset('RU', year)
      setSyncMsg(result.message)
      qc.invalidateQueries({ queryKey: ['org-calendar', year] })
    } catch {
      setSyncMsg('Ошибка при загрузке данных')
    } finally {
      setSyncing(false)
    }
  }

  const toggleDay = (dateStr: string) => {
    const existing = days.find(d => d.date === dateStr)
    if (existing) {
      removeDayMut.mutate(existing.id)
    } else {
      addDayMut.mutate(dateStr)
    }
  }

  // Build full-year calendar
  const months: { name: string; days: { date: string; dayOfWeek: number; holiday: boolean }[] }[] = []
  for (let m = 0; m < 12; m++) {
    const monthDays: { date: string; dayOfWeek: number; holiday: boolean }[] = []
    const d = new Date(year, m, 1)
    while (d.getMonth() === m) {
      const iso = d.toISOString().slice(0, 10)
      const dow = d.getDay() // 0=Sun
      monthDays.push({ date: iso, dayOfWeek: dow, holiday: holidaySet.has(iso) })
      d.setDate(d.getDate() + 1)
    }
    months.push({ name: MONTH_NAMES[m], days: monthDays })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setYear(y => y - 1)}
            className="p-1 rounded hover:bg-gray-100 text-gray-500"
          >
            ‹
          </button>
          <span className="text-lg font-semibold text-gray-800">{year}</span>
          <button
            onClick={() => setYear(y => y + 1)}
            className="p-1 rounded hover:bg-gray-100 text-gray-500"
          >
            ›
          </button>
        </div>

        <Button
          size="sm"
          variant="secondary"
          loading={syncing}
          onClick={handleSync}
        >
          Синхронизировать из isdayoff.ru
        </Button>

        {syncMsg && (
          <span className="text-xs text-green-700 bg-green-50 border border-green-200 rounded px-2 py-1">
            {syncMsg}
          </span>
        )}
      </div>

      <p className="text-xs text-gray-400">
        Клик по дню — переключить статус (нерабочий / рабочий). Красный фон = нерабочий день.
      </p>

      {isLoading ? (
        <p className="text-sm text-gray-400">Загрузка...</p>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {months.map(({ name, days: mDays }) => {
            const firstDow = mDays[0].dayOfWeek // 0=Sun
            // Convert to Mon-first (0=Mon … 6=Sun)
            const offset = firstDow === 0 ? 6 : firstDow - 1
            return (
              <div key={name} className="rounded-lg border border-gray-200 p-3">
                <p className="text-xs font-semibold text-gray-600 mb-2 text-center">{name}</p>
                {/* Weekday headers */}
                <div className="grid grid-cols-7 gap-0.5 mb-1">
                  {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(h => (
                    <div key={h} className="text-center text-[9px] text-gray-400">{h}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-0.5">
                  {/* Empty cells for offset */}
                  {Array.from({ length: offset }).map((_, i) => (
                    <div key={`e${i}`} />
                  ))}
                  {mDays.map(({ date, dayOfWeek, holiday }) => {
                    const isSat = dayOfWeek === 6
                    const isSun = dayOfWeek === 0
                    return (
                      <button
                        key={date}
                        onClick={() => toggleDay(date)}
                        title={`${date} — клик для переключения`}
                        className={`h-6 w-full rounded text-[10px] font-medium transition-colors ${
                          holiday
                            ? 'bg-red-200 text-red-700 hover:bg-red-300'
                            : isSat || isSun
                              ? 'bg-gray-100 text-gray-400 hover:bg-red-100'
                              : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-100'
                        }`}
                      >
                        {date.split('-')[2]}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="flex items-center gap-4 text-xs text-gray-500 pt-2">
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 rounded bg-red-200 border border-red-300" />
          <span>Нерабочий день</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 rounded bg-gray-100 border border-gray-200" />
          <span>Выходной (Сб/Вс)</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 rounded bg-white border border-gray-200" />
          <span>Рабочий день</span>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function WorkCalendarPage() {
  const [tab, setTab] = useState<'presets' | 'calendar'>('presets')

  return (
    <div className="max-w-5xl mx-auto py-6 px-4 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Рабочий календарь</h1>
        <p className="mt-1 text-sm text-gray-500">
          Управление графиками работы и производственным календарём организации
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          {([
            ['presets', 'Графики работы'],
            ['calendar', 'Производственный календарь'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                tab === key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      {tab === 'presets' && <PresetsSection />}
      {tab === 'calendar' && <CalendarSection />}
    </div>
  )
}
