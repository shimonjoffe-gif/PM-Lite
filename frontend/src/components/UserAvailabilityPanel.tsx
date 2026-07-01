import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { DateRange } from 'react-day-picker'
import { format } from 'date-fns'
import { usersApi, Absence, AffectedTask, OrgUser } from '@/api/users'
import { resourcesApi } from '@/api/resources'
import { Button } from '@/components/ui/Button'
import { DAY_LABELS } from '@/types/resource'
import { DateRangePicker } from '@/components/DateRangePicker'

const ABSENCE_LABELS: Record<string, string> = {
  vacation: 'Отпуск',
  sick: 'Больничный',
  other: 'Другое',
}

const ABSENCE_COLORS: Record<string, string> = {
  vacation: 'bg-blue-100 text-blue-700',
  sick: 'bg-red-100 text-red-700',
  other: 'bg-gray-100 text-gray-600',
}

function formatDate(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

interface AbsenceFormState {
  type: 'vacation' | 'sick' | 'other'
  startDate: string
  endDate: string
  notes: string
}

// ── Schedule Picker ────────────────────────────────────────────────────────────

function SchedulePicker({ userId }: { userId: string }) {
  const qc = useQueryClient()
  const [mode, setMode] = useState<'preset' | 'custom' | null>(null)
  const [selectedPresetId, setSelectedPresetId] = useState<string>('')
  const [cycleStartDate, setCycleStartDate] = useState('')
  const [customDays, setCustomDays] = useState([1, 2, 3, 4, 5])
  const [customHours, setCustomHours] = useState(8)
  const [customName, setCustomName] = useState('')
  const [usePerDay, setUsePerDay] = useState(false)
  const [hoursPerDayMap, setHoursPerDayMap] = useState<Record<string, number>>({})
  const [saved, setSaved] = useState(false)

  const { data: presets = [] } = useQuery({
    queryKey: ['work-schedule-presets'],
    queryFn: () => resourcesApi.getPresets(),
  })

  const { data: currentSchedule } = useQuery({
    queryKey: ['user-work-schedule', userId],
    queryFn: () => resourcesApi.getUserSchedule(userId),
  })

  const assignMut = useMutation({
    mutationFn: (data: Parameters<typeof resourcesApi.assignUserSchedule>[1]) =>
      resourcesApi.assignUserSchedule(userId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      qc.invalidateQueries({ queryKey: ['user-work-schedule', userId] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      setMode(null)
    },
  })

  const selectedPreset = presets.find(p => p.id === selectedPresetId)
  const isShift = selectedPreset?.cycleDays != null

  const describeSchedule = (s: typeof currentSchedule) => {
    if (!s) return 'Не задан (по умолчанию орг.)'
    const name = (s as any).name as string | null
    if ((s as any).scheduleType === 'two_two') return name ? `${name} · 2/2 (сменный)` : '2/2 (сменный)'
    const map = (s as any).hoursPerDayMap as Record<string, number> | null
    if (map) {
      const detail = (s.workDays ?? []).map((d: number) => `${DAY_LABELS[d]} ${map[String(d)] ?? s.hoursPerDay}ч`).join(', ')
      return name ? `${name} · ${detail}` : detail
    }
    const daysStr = (s.workDays ?? []).map((d: number) => DAY_LABELS[d]).join(', ')
    const detail = `${daysStr} · ${s.hoursPerDay} ч/день`
    return name ? `${name} · ${detail}` : detail
  }

  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
        График работы
      </p>

      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm text-gray-700">{describeSchedule(currentSchedule)}</span>
        {saved && <span className="text-xs text-green-600">Сохранено</span>}
        {mode === null && (
          <Button size="sm" variant="ghost" onClick={() => setMode('preset')}>Изменить</Button>
        )}
      </div>

      {mode !== null && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-3">
          <div className="flex gap-2">
            <button
              onClick={() => setMode('preset')}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                mode === 'preset'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white border border-gray-300 text-gray-700'
              }`}
            >
              Выбрать пресет
            </button>
            <button
              onClick={() => setMode('custom')}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                mode === 'custom'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white border border-gray-300 text-gray-700'
              }`}
            >
              Кастомный
            </button>
          </div>

          {mode === 'preset' && (
            <div className="space-y-2">
              <select
                value={selectedPresetId}
                onChange={e => setSelectedPresetId(e.target.value)}
                className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">— выберите пресет —</option>
                {presets.filter(p => p.isSystem).length > 0 && (
                  <optgroup label="Системные">
                    {presets.filter(p => p.isSystem).map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </optgroup>
                )}
                {presets.filter(p => !p.isSystem).length > 0 && (
                  <optgroup label="Кастомные">
                    {presets.filter(p => !p.isSystem).map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </optgroup>
                )}
              </select>

              {isShift && (
                <div>
                  <label className="block text-xs text-gray-600 mb-1">
                    Дата начала цикла (когда начинается первая смена)
                  </label>
                  <input
                    type="date"
                    value={cycleStartDate}
                    onChange={e => setCycleStartDate(e.target.value)}
                    className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  size="sm"
                  loading={assignMut.isPending}
                  disabled={!selectedPresetId || (isShift && !cycleStartDate)}
                  onClick={() => assignMut.mutate({
                    presetId: selectedPresetId,
                    cycleStartDate: isShift ? cycleStartDate : null,
                  })}
                >
                  Применить
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setMode(null)}>Отмена</Button>
              </div>
            </div>
          )}

          {mode === 'custom' && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Название графика</label>
                <input
                  type="text"
                  placeholder="Например: Сокращённая пятница"
                  value={customName}
                  onChange={e => setCustomName(e.target.value)}
                  className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-2">Рабочие дни</label>
                <div className="flex gap-1.5 flex-wrap">
                  {[1, 2, 3, 4, 5, 6, 7].map(d => (
                    <button
                      key={d}
                      type="button"
                      onClick={() =>
                        setCustomDays(days =>
                          days.includes(d) ? days.filter(x => x !== d) : [...days, d].sort()
                        )
                      }
                      className={`w-9 h-9 rounded text-xs font-medium transition-colors ${
                        customDays.includes(d)
                          ? 'bg-blue-600 text-white'
                          : 'bg-white border border-gray-300 text-gray-700'
                      }`}
                    >
                      {DAY_LABELS[d]}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={usePerDay}
                  onChange={e => setUsePerDay(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600"
                />
                <span className="text-xs text-gray-600">Разные часы по дням</span>
              </label>

              {usePerDay ? (
                <div className="flex flex-wrap gap-2">
                  {customDays.map(d => (
                    <div key={d} className="flex flex-col items-center gap-1">
                      <span className="text-xs text-gray-500">{DAY_LABELS[d]}</span>
                      <input
                        type="number" min={0.5} max={24} step={0.5}
                        value={hoursPerDayMap[String(d)] ?? customHours}
                        onChange={e => setHoursPerDayMap(m => ({ ...m, [String(d)]: parseFloat(e.target.value) || customHours }))}
                        className="w-14 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-600">Часов в день:</label>
                  <input
                    type="number" min={0.5} max={24} step={0.5}
                    value={customHours}
                    onChange={e => setCustomHours(parseFloat(e.target.value) || 8)}
                    className="w-20 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  size="sm"
                  loading={assignMut.isPending}
                  disabled={customDays.length === 0}
                  onClick={() => {
                    const map = usePerDay
                      ? Object.fromEntries(customDays.map(d => [String(d), hoursPerDayMap[String(d)] ?? customHours]))
                      : null
                    const avgH = map
                      ? Object.values(map).reduce((a, b) => a + b, 0) / Object.values(map).length
                      : customHours
                    assignMut.mutate({
                      presetId: null,
                      name: customName || null,
                      hoursPerDay: avgH,
                      hoursPerDayMap: map,
                      workDays: customDays,
                    })
                  }}
                >
                  Применить
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setMode(null)}>Отмена</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main Panel ────────────────────────────────────────────────────────────────

export function UserAvailabilityPanel({ user }: { user: OrgUser }) {
  const qc = useQueryClient()
  const [showAbsenceForm, setShowAbsenceForm] = useState(false)
  const [absenceDateRange, setAbsenceDateRange] = useState<DateRange | undefined>(undefined)
  const [absenceForm, setAbsenceForm] = useState<AbsenceFormState>({
    type: 'vacation',
    startDate: '',
    endDate: '',
    notes: '',
  })
  const [affectedTasks, setAffectedTasks] = useState<AffectedTask[] | null>(null)
  const [formError, setFormError] = useState('')

  const { data: absences = [], isLoading } = useQuery({
    queryKey: ['absences', user.id],
    queryFn: () => usersApi.getAbsences(user.id),
  })

  const addAbsenceMutation = useMutation({
    mutationFn: (data: AbsenceFormState) =>
      usersApi.addAbsence(user.id, {
        type: data.type,
        startDate: data.startDate,
        endDate: data.endDate,
        notes: data.notes || undefined,
      }),
    onSuccess: result => {
      qc.invalidateQueries({ queryKey: ['absences', user.id] })
      setShowAbsenceForm(false)
      setAbsenceForm({ type: 'vacation', startDate: '', endDate: '', notes: '' })
      setAbsenceDateRange(undefined)
      setFormError('')
      if (result.affectedTasks.length > 0) {
        setAffectedTasks(result.affectedTasks)
      }
    },
    onError: (e: any) => {
      setFormError(e.response?.data?.error ?? 'Ошибка')
    },
  })

  const deleteAbsenceMutation = useMutation({
    mutationFn: (absenceId: string) => usersApi.deleteAbsence(user.id, absenceId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['absences', user.id] })
      setAffectedTasks(null)
    },
  })

  const handleAddAbsence = () => {
    setFormError('')
    if (!absenceDateRange?.from || !absenceDateRange?.to) {
      setFormError('Укажите период')
      return
    }
    addAbsenceMutation.mutate({
      ...absenceForm,
      startDate: format(absenceDateRange.from, 'yyyy-MM-dd'),
      endDate: format(absenceDateRange.to, 'yyyy-MM-dd'),
    })
  }

  return (
    <div className="mt-2 ml-12 mr-4 rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-4">
      {/* График работы */}
      <SchedulePicker userId={user.id} />

      {/* Периоды отсутствия */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Отсутствия
          </p>
          {!showAbsenceForm && (
            <Button size="sm" variant="ghost" onClick={() => setShowAbsenceForm(true)}>
              + Добавить
            </Button>
          )}
        </div>

        {isLoading && <p className="text-sm text-gray-400">Загрузка...</p>}

        {!isLoading && absences.length === 0 && !showAbsenceForm && (
          <p className="text-sm text-gray-400">Отсутствий нет</p>
        )}

        <div className="space-y-1.5">
          {absences.map((a: Absence) => (
            <div
              key={a.id}
              className="flex items-center justify-between rounded-md bg-white border border-gray-200 px-3 py-1.5"
            >
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${ABSENCE_COLORS[a.type]}`}
                >
                  {ABSENCE_LABELS[a.type]}
                </span>
                <span className="text-sm text-gray-700">
                  {formatDate(a.startDate)} — {formatDate(a.endDate)}
                </span>
                {a.notes && (
                  <span className="text-xs text-gray-400 truncate max-w-32">{a.notes}</span>
                )}
              </div>
              <button
                onClick={() => deleteAbsenceMutation.mutate(a.id)}
                className="ml-2 text-gray-400 hover:text-red-500 transition-colors text-lg leading-none"
                title="Удалить"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        {/* Форма добавления отсутствия */}
        {showAbsenceForm && (
          <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-3">
            {formError && <p className="text-xs text-red-600">{formError}</p>}
            <div className="flex flex-wrap gap-2 items-center">
              <select
                value={absenceForm.type}
                onChange={e =>
                  setAbsenceForm(f => ({ ...f, type: e.target.value as AbsenceFormState['type'] }))
                }
                className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="vacation">Отпуск</option>
                <option value="sick">Больничный</option>
                <option value="other">Другое</option>
              </select>
              <div className="flex-1 min-w-[240px]">
                <DateRangePicker
                  value={absenceDateRange}
                  onChange={setAbsenceDateRange}
                  placeholder="Выберите период"
                />
              </div>
            </div>
            <input
              type="text"
              placeholder="Примечание (необязательно)"
              value={absenceForm.notes}
              onChange={e => setAbsenceForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex gap-2">
              <Button size="sm" loading={addAbsenceMutation.isPending} onClick={handleAddAbsence}>
                Добавить
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { setShowAbsenceForm(false); setFormError(''); setAbsenceDateRange(undefined) }}
              >
                Отмена
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Предупреждение о затронутых задачах */}
      {affectedTasks && affectedTasks.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <div className="flex items-start justify-between">
            <p className="text-sm font-medium text-amber-800 mb-1">
              ⚠ {affectedTasks.length} задач{affectedTasks.length === 1 ? 'а' : 'и'} сотрудника попадают в период отсутствия
            </p>
            <button
              onClick={() => setAffectedTasks(null)}
              className="text-amber-500 hover:text-amber-700 text-lg leading-none ml-2"
            >
              ×
            </button>
          </div>
          <ul className="space-y-0.5">
            {affectedTasks.map(t => (
              <li key={t.id} className="text-xs text-amber-700">
                • {t.title} — <span className="text-amber-500">{t.projectName}</span>{' '}
                <span className="text-amber-400">(дедлайн {formatDate(t.dueDate)})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
