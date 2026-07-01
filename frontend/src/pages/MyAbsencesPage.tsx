import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, parseISO, isBefore, startOfDay } from 'date-fns'
import { ru } from 'date-fns/locale'
import { DateRange } from 'react-day-picker'
import { useSearchParams } from 'react-router-dom'
import { absencesApi, AbsenceRequest, AbsenceType } from '@/api/absences'
import { useAuthStore } from '@/store/authStore'
import { DateRangePicker } from '@/components/DateRangePicker'
import { Button } from '@/components/ui/Button'

const STATUS_LABELS: Record<string, string> = {
  pending: 'На согласовании',
  approved: 'Одобрено',
  rejected: 'Отклонено',
  cancelled: 'Отменено',
}
const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-600',
}

function fmtDate(s: string) {
  return format(parseISO(s), 'd MMM yyyy', { locale: ru })
}

function StepBadge({ step }: { step: { role: string; action: string; status: string; approver?: { fullName: string } | null } }) {
  const roleLabel: Record<string, string> = { pm: 'РП', line_manager: 'Руководитель', admin: 'Администратор' }
  const color = step.status === 'approved' || step.status === 'notified' ? 'text-green-600' : step.status === 'rejected' ? 'text-red-600' : 'text-gray-400'
  const icon = step.status === 'approved' || step.status === 'notified' ? '✓' : step.status === 'rejected' ? '✕' : '○'
  return (
    <span className={`text-xs ${color}`}>
      {icon} {roleLabel[step.role] ?? step.role}
      {step.action === 'notify' ? ' (уведомление)' : ''}
      {step.approver ? ` — ${step.approver.fullName}` : ''}
    </span>
  )
}

function fmtDateShort(s: string | null) {
  if (!s) return '?'
  return format(parseISO(s), 'dd.MM', { locale: ru })
}

function ConflictWarning({ tasks }: { tasks: { id: string; title: string; startDate: string | null; dueDate: string | null; project: { name: string } | null }[] }) {
  if (!tasks.length) return null
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 space-y-1">
      <p className="text-xs font-medium text-amber-800">⚠ Активные задачи в этот период:</p>
      <ul className="space-y-0.5">
        {tasks.map(t => (
          <li key={t.id} className="text-xs text-amber-700 flex items-baseline gap-1">
            <span className="text-amber-400">•</span>
            <span className="font-medium">{t.project?.name ?? '—'}</span>
            <span className="text-amber-500">/</span>
            <span>{t.title}</span>
            {(t.startDate || t.dueDate) && (
              <span className="text-amber-500 shrink-0">
                ({fmtDateShort(t.startDate)} — {fmtDateShort(t.dueDate)})
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function AbsenceForm({
  userId,
  types,
  initial,
  onSuccess,
  onCancel,
}: {
  userId: string
  types: AbsenceType[]
  initial?: AbsenceRequest
  onSuccess: () => void
  onCancel: () => void
}) {
  const qc = useQueryClient()
  const isEdit = !!initial
  const [typeId, setTypeId] = useState(initial?.typeId ?? '')
  const [dateRange, setDateRange] = useState<DateRange | undefined>(
    initial
      ? { from: parseISO(initial.startDate), to: parseISO(initial.endDate) }
      : undefined
  )
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [formError, setFormError] = useState('')
  const [conflicts, setConflicts] = useState<{ id: string; title: string; startDate: string | null; dueDate: string | null; project: { name: string } | null }[]>([])

  // Fetch conflicts when period is fully selected
  useEffect(() => {
    if (!dateRange?.from || !dateRange?.to) { setConflicts([]); return }
    const start = format(dateRange.from, 'yyyy-MM-dd')
    const end = format(dateRange.to, 'yyyy-MM-dd')
    absencesApi.checkConflicts(userId, start, end).then(r => setConflicts(r.tasks))
  }, [dateRange?.from?.toISOString(), dateRange?.to?.toISOString(), userId])

  const createMut = useMutation({
    mutationFn: absencesApi.createRequest,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['absence-requests'] })
      onSuccess()
    },
    onError: (e: any) => setFormError(e.response?.data?.message ?? 'Ошибка'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => absencesApi.updateRequest(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['absence-requests'] })
      onSuccess()
    },
    onError: (e: any) => setFormError(e.response?.data?.message ?? 'Ошибка'),
  })

  function submit() {
    setFormError('')
    if (!typeId) return setFormError('Выберите тип отсутствия')
    if (!dateRange?.from || !dateRange?.to) return setFormError('Выберите период')
    const startDate = format(dateRange.from, 'yyyy-MM-dd')
    const endDate = format(dateRange.to, 'yyyy-MM-dd')
    if (isEdit) {
      updateMut.mutate({ id: initial!.id, data: { typeId, startDate, endDate, notes: notes || null } })
    } else {
      createMut.mutate({ userId, typeId, startDate, endDate, notes: notes || undefined })
    }
  }

  const isPending = createMut.isPending || updateMut.isPending
  const selectedType = types.find(t => t.id === typeId)
  const hasApproval = (selectedType?.approvalSteps ?? []).some(s => s.action === 'approve')

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-3">
      <h2 className="font-medium text-gray-800">
        {isEdit ? `Редактирование заявки${(initial as any)?.revision > 1 ? ` (редакция ${(initial as any).revision})` : ''}` : 'Новая заявка'}
      </h2>
      {formError && <p className="text-sm text-red-600">{formError}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-600 mb-1">Тип отсутствия</label>
          <select
            value={typeId}
            onChange={e => setTypeId(e.target.value)}
            className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">— выберите —</option>
            {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">Период</label>
          <DateRangePicker value={dateRange} onChange={setDateRange} />
        </div>
      </div>

      <ConflictWarning tasks={conflicts} />

      {selectedType && (
        <p className="text-xs text-gray-500">
          {hasApproval
            ? `Требует согласования: ${selectedType.approvalSteps.map(s => ({ pm: 'РП', line_manager: 'Руководитель', admin: 'Администратор' }[s.role])).join(' → ')}`
            : 'Согласование не требуется — отсутствие будет зафиксировано сразу'}
        </p>
      )}

      {isEdit && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
          После сохранения согласование начнётся заново (редакция {((initial as any)?.revision ?? 1) + 1})
        </p>
      )}

      <textarea
        placeholder="Примечание (необязательно)"
        value={notes}
        onChange={e => setNotes(e.target.value)}
        rows={2}
        className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      <div className="flex gap-2">
        <Button loading={isPending} onClick={submit}>{isEdit ? 'Сохранить' : 'Отправить заявку'}</Button>
        <Button variant="ghost" onClick={onCancel}>Отмена</Button>
      </div>
    </div>
  )
}

export function MyAbsencesPage() {
  const { user } = useAuthStore()
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editingRequest, setEditingRequest] = useState<AbsenceRequest | null>(null)
  const [showCancelled, setShowCancelled] = useState(false)
  const [showPast, setShowPast] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const highlightId = searchParams.get('requestId')
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const cancelMut = useMutation({
    mutationFn: absencesApi.cancelRequest,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['absence-requests'] }),
  })

  const { data: types = [] } = useQuery({ queryKey: ['absence-types'], queryFn: absencesApi.getTypes })
  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['absence-requests', 'mine'],
    queryFn: () => absencesApi.getRequests({ userId: user?.id }),
    enabled: !!user?.id,
  })

  useEffect(() => {
    if (!highlightId) return
    const el = itemRefs.current[highlightId]
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      const timer = setTimeout(() => setSearchParams({}, { replace: true }), 3000)
      return () => clearTimeout(timer)
    }
  }, [highlightId, requests])

  const today = startOfDay(new Date())
  const visibleRequests = (requests as (AbsenceRequest & { revision?: number; conflictingTasks?: string[] })[]).filter(r => {
    if (!showCancelled && r.status === 'cancelled') return false
    if (!showPast && isBefore(parseISO(r.endDate), today)) return false
    return true
  })

  function handleSuccess() {
    setShowForm(false)
    setEditingRequest(null)
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Мои отсутствия</h1>
        {!showForm && !editingRequest && (
          <Button onClick={() => setShowForm(true)}>+ Создать заявку</Button>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setShowPast(v => !v)}
          className={`px-3 py-1 rounded-full text-xs border transition-colors ${showPast ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-500 border-gray-300 hover:border-gray-400'}`}
        >
          {showPast ? '✓ ' : ''}Прошедшие
        </button>
        <button
          onClick={() => setShowCancelled(v => !v)}
          className={`px-3 py-1 rounded-full text-xs border transition-colors ${showCancelled ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-500 border-gray-300 hover:border-gray-400'}`}
        >
          {showCancelled ? '✓ ' : ''}Отменённые
        </button>
      </div>

      {showForm && (
        <AbsenceForm
          userId={user!.id}
          types={types}
          onSuccess={handleSuccess}
          onCancel={() => setShowForm(false)}
        />
      )}

      {editingRequest && (
        <AbsenceForm
          userId={user!.id}
          types={types}
          initial={editingRequest}
          onSuccess={handleSuccess}
          onCancel={() => setEditingRequest(null)}
        />
      )}

      {isLoading ? (
        <p className="text-sm text-gray-500">Загрузка...</p>
      ) : visibleRequests.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p>Заявок пока нет</p>
          <p className="text-xs mt-1">Создайте первую заявку на отсутствие</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleRequests.map(r => (
            <div
              key={r.id}
              ref={el => { itemRefs.current[r.id] = el }}
              className={`rounded-xl border p-4 space-y-2 transition-colors duration-700 ${highlightId === r.id ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-white'}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0 mt-0.5" style={{ backgroundColor: r.type.color }} />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="font-medium text-sm text-gray-900">{r.type.name}</p>
                      {r.revision && r.revision > 1 && (
                        <span className="text-xs text-gray-400 bg-gray-100 rounded px-1.5 py-0.5">ред. {r.revision}</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500">{fmtDate(r.startDate)} — {fmtDate(r.endDate)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[r.status]}`}>
                    {STATUS_LABELS[r.status]}
                  </span>
                  {r.status !== 'cancelled' && !editingRequest && !showForm && (
                    <button onClick={() => setEditingRequest(r)} className="text-xs text-blue-600 hover:underline">
                      Изменить
                    </button>
                  )}
                  {r.status !== 'cancelled' && (
                    <button onClick={() => cancelMut.mutate(r.id)} className="text-xs text-red-500 hover:text-red-700">
                      Отменить
                    </button>
                  )}
                </div>
              </div>

              {r.notes && <p className="text-xs text-gray-500 italic">{r.notes}</p>}

              {r.conflictingTasks && r.conflictingTasks.length > 0 && (
                <p className="text-xs text-amber-700">⚠ Задачи в период: {r.conflictingTasks.join(', ')}</p>
              )}

              {r.steps.length > 0 && (
                <div className="flex flex-wrap gap-3 pt-1 border-t border-gray-100">
                  {r.steps.map(s => <StepBadge key={s.id} step={s} />)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
