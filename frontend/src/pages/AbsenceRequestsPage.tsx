import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, parseISO, isBefore, startOfDay } from 'date-fns'
import { ru } from 'date-fns/locale'
import { useSearchParams } from 'react-router-dom'
import { absencesApi, AbsenceRequest } from '@/api/absences'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/Button'

const STATUS_LABELS: Record<string, string> = {
  pending: 'Ожидает',
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

function fmtShort(s: string | null) {
  if (!s) return '?'
  return format(parseISO(s), 'dd.MM', { locale: ru })
}

function DecideModal({ request, pendingStep, onClose }: {
  request: AbsenceRequest & { pendingStepId: string }
  pendingStep: { id: string; role: string; approverId: string | null } | undefined
  onClose: () => void
}) {
  const { user } = useAuthStore()
  const qc = useQueryClient()
  const [comment, setComment] = useState('')

  const { data: conflictsData } = useQuery({
    queryKey: ['conflicts', request.userId, request.startDate, request.endDate, user?.id, pendingStep?.role],
    queryFn: () => absencesApi.checkConflicts(
      request.userId,
      request.startDate.slice(0, 10),
      request.endDate.slice(0, 10),
      user?.id,
      pendingStep?.role,
    ),
    enabled: !!request.userId,
  })
  const conflicts = conflictsData?.tasks ?? []

  const decideMut = useMutation({
    mutationFn: ({ decision }: { decision: 'approved' | 'rejected' }) =>
      absencesApi.decideStep(request.id, request.pendingStepId, decision, comment || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['absence-requests'] })
      onClose()
    },
  })
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl p-5 w-full max-w-lg space-y-4" onClick={e => e.stopPropagation()}>
        <h2 className="font-semibold text-gray-900">Решение по заявке</h2>
        <div className="text-sm space-y-1">
          <p><span className="text-gray-500">Сотрудник:</span> {request.user.fullName}</p>
          <p>
            <span className="text-gray-500">Тип:</span> {request.type.name}
            {(request as any).revision > 1 && (
              <span className="ml-2 text-xs font-medium text-amber-700 bg-amber-100 rounded px-1.5 py-0.5">
                повторная заявка (редакция {(request as any).revision})
              </span>
            )}
          </p>
          <p><span className="text-gray-500">Период:</span> {fmtDate(request.startDate)} — {fmtDate(request.endDate)}</p>
          {request.notes && <p><span className="text-gray-500">Примечание:</span> {request.notes}</p>}
        </div>

        {conflicts.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 space-y-1">
            <p className="text-xs font-medium text-amber-800">⚠ Активные задачи сотрудника в этот период:</p>
            <ul className="space-y-0.5">
              {conflicts.map((t: any) => (
                <li key={t.id} className="text-xs text-amber-700 flex items-baseline gap-1 flex-wrap">
                  <span className="text-amber-400">•</span>
                  <span className="font-medium">{t.project?.name ?? '—'}</span>
                  <span className="text-amber-500">/</span>
                  <span>{t.title}</span>
                  {(t.startDate || t.dueDate) && (
                    <span className="text-amber-500">({fmtShort(t.startDate)} — {fmtShort(t.dueDate)})</span>
                  )}
                  {pendingStep?.role === 'line_manager' && t.project?.owner && (
                    <span className="text-amber-400 italic">РП: {t.project.owner.fullName}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        <textarea
          placeholder="Комментарий (необязательно)"
          value={comment}
          onChange={e => setComment(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onClose}>Отмена</Button>
          <Button
            variant="ghost"
            className="text-red-600 hover:bg-red-50"
            loading={decideMut.isPending}
            onClick={() => decideMut.mutate({ decision: 'rejected' })}
          >Отклонить</Button>
          <Button
            loading={decideMut.isPending}
            onClick={() => decideMut.mutate({ decision: 'approved' })}
          >Одобрить</Button>
        </div>
      </div>
    </div>
  )
}

export function AbsenceRequestsPage() {
  const [tab, setTab] = useState<'incoming' | 'all'>('incoming')
  const [deciding, setDeciding] = useState<{ request: AbsenceRequest & { pendingStepId: string }; step: any } | null>(null)
  const [showCancelled, setShowCancelled] = useState(false)
  const [showPast, setShowPast] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const highlightId = searchParams.get('requestId')
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const { data: incoming = [], isLoading: loadingIn } = useQuery({
    queryKey: ['absence-requests', 'incoming'],
    queryFn: () => absencesApi.getRequests({ asApprover: true }),
  })
  const { data: all = [], isLoading: loadingAll } = useQuery({
    queryKey: ['absence-requests', 'all'],
    queryFn: () => absencesApi.getRequests(),
    enabled: tab === 'all',
  })

  const rawItems = tab === 'incoming' ? incoming : all
  const loading = tab === 'incoming' ? loadingIn : loadingAll

  const today = startOfDay(new Date())
  const items = (rawItems as AbsenceRequest[]).filter(r => {
    if (!showCancelled && r.status === 'cancelled') return false
    if (!showPast && isBefore(parseISO(r.endDate), today)) return false
    return true
  })

  useEffect(() => {
    if (!highlightId) return
    const el = itemRefs.current[highlightId]
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      const timer = setTimeout(() => setSearchParams({}, { replace: true }), 3000)
      return () => clearTimeout(timer)
    }
  }, [highlightId, rawItems])

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      <h1 className="text-xl font-semibold text-gray-900">Заявки на отсутствие</h1>

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

      <div className="flex border-b border-gray-200">
        {(['incoming', 'all'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            {t === 'incoming'
              ? `Ожидают моего решения ${incoming.length > 0 ? `(${incoming.length})` : ''}`
              : 'Все заявки'}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Загрузка...</p>
      ) : (items as AbsenceRequest[]).length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p>{tab === 'incoming' ? 'Нет заявок, ожидающих вашего решения' : 'Заявок пока нет'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {(items as (AbsenceRequest & { pendingStepId?: string })[]).map(r => (
            <div
              key={r.id}
              ref={el => { itemRefs.current[r.id] = el }}
              className={`rounded-xl border p-4 transition-colors duration-700 ${highlightId === r.id ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-white'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0 mt-1" style={{ backgroundColor: r.type.color }} />
                  <div>
                    <p className="font-medium text-sm text-gray-900">{r.user.fullName}</p>
                    <p className="text-xs text-gray-500">{r.type.name} · {fmtDate(r.startDate)} — {fmtDate(r.endDate)}</p>
                    {r.notes && <p className="text-xs text-gray-400 italic mt-0.5">{r.notes}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[r.status]}`}>
                    {STATUS_LABELS[r.status]}
                  </span>
                  {r.pendingStepId && (
                    <Button size="sm" onClick={() => {
                      const step = r.steps?.find((s: any) => s.id === r.pendingStepId)
                      setDeciding({ request: r as any, step })
                    }}>Решить</Button>
                  )}
                </div>
              </div>

              {r.steps && r.steps.length > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-100 flex flex-wrap gap-3">
                  {r.steps.map(s => {
                    const roleLabel: Record<string, string> = { pm: 'РП', line_manager: 'Руководитель', admin: 'Администратор' }
                    const color = s.status === 'approved' || s.status === 'notified' ? 'text-green-600' : s.status === 'rejected' ? 'text-red-600' : 'text-gray-400'
                    const icon = s.status === 'approved' || s.status === 'notified' ? '✓' : s.status === 'rejected' ? '✕' : '○'
                    return (
                      <span key={s.id} className={`text-xs ${color}`}>
                        {icon} {roleLabel[s.role] ?? s.role}
                        {s.action === 'notify' ? ' (уведомление)' : ''}
                        {s.approver ? ` — ${s.approver.fullName}` : ''}
                        {s.comment ? `: «${s.comment}»` : ''}
                      </span>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {deciding && <DecideModal request={deciding.request} pendingStep={deciding.step} onClose={() => setDeciding(null)} />}
    </div>
  )
}
