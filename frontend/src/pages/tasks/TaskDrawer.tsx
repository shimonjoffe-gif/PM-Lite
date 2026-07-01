import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { tasksApi } from '@/api/tasks'
import { api } from '@/api/client'
import { TaskStatus, TaskPriority, TASK_STATUS_LABELS, TASK_PRIORITY_LABELS, ALL_TASK_STATUSES } from '@/types/task'
import { TaskStatusBadge } from './TaskStatusBadge'
import { Button } from '@/components/ui/Button'
import { useAiPanel } from '@/store/aiPanel'
import { EffortPlanTab } from './EffortPlanTab'
import { TimeLogWidget } from './TimeLogWidget'

// ── Date helpers ──────────────────────────────────────────────────────────────

function addDays(date: string, days: number): string {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

function diffDays(start: string, end: string): number {
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1
}

const FIXED_FINISH = new Set(['alap', 'fnet', 'fnlt', 'mfo'])
const READ_ONLY_SCHED = new Set(['hammock'])

// ─────────────────────────────────────────────────────────────────────────────

type DrawerTab = 'details' | 'deps' | 'effort' | 'timelog'

interface TaskDrawerProps {
  taskId: string | null
  projectId: string
  onClose: () => void
  onAddChild?: (parentId: string) => void
  onNavigateToTask?: (taskId: string) => void
  focusField?: string
  pendingFromPlan?: Record<string, any>
  onClearPlanPending?: (taskId: string) => void
}

function CommentItem({
  comment,
  currentUserId,
  onEdit,
  onDelete,
}: {
  comment: any
  currentUserId: string
  onEdit: (id: string, text: string) => void
  onDelete: (id: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(comment.text)
  const isOwn = comment.userId === currentUserId
  const isDeleted = !!comment.deletedAt

  if (isDeleted) {
    return (
      <div className="flex gap-2 py-2">
        <div className="h-7 w-7 rounded-full bg-gray-200 flex-shrink-0" />
        <p className="text-xs text-gray-400 italic pt-1">[Удалено]</p>
      </div>
    )
  }

  return (
    <div className="flex gap-2 py-2 group">
      <div className="h-7 w-7 rounded-full bg-blue-600 flex-shrink-0 flex items-center justify-center text-white text-xs font-semibold">
        {comment.userName.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs font-medium text-gray-700">{comment.userName}</span>
          <span className="text-xs text-gray-400">{new Date(comment.createdAt).toLocaleString('ru')}</span>
          {comment.updatedAt && <span className="text-xs text-gray-400">(ред.)</span>}
        </div>
        {editing ? (
          <div className="space-y-2">
            <textarea
              className="w-full text-sm border border-gray-300 rounded-lg px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
              rows={3}
              value={editText}
              onChange={e => setEditText(e.target.value)}
              autoFocus
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => { onEdit(comment.id, editText); setEditing(false) }}>Сохранить</Button>
              <Button size="sm" variant="secondary" onClick={() => setEditing(false)}>Отмена</Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-800 whitespace-pre-wrap break-words">{comment.text}</p>
        )}
      </div>
      {isOwn && !editing && (
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 flex-shrink-0">
          <button onClick={() => { setEditing(true); setEditText(comment.text) }}
            className="p-1 rounded text-gray-400 hover:text-gray-600">
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button onClick={() => onDelete(comment.id)}
            className="p-1 rounded text-gray-400 hover:text-red-500">
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}

export function TaskDrawer({
  taskId,
  projectId,
  onClose,
  onAddChild,
  onNavigateToTask,
  focusField,
  pendingFromPlan,
  onClearPlanPending,
}: TaskDrawerProps) {
  const qc = useQueryClient()
  const commentRef = useRef<HTMLTextAreaElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [commentText, setCommentText] = useState('')
  const [activeTab, setActiveTab] = useState<DrawerTab>('details')
  const [localChanges, setLocalChanges] = useState<Record<string, any>>({})
  const [showDirtyWarning, setShowDirtyWarning] = useState(false)
  const openAiPanel = useAiPanel(s => s.open)

  const isDirty = Object.keys(localChanges).length > 0

  const currentUserId = (() => {
    try {
      const token = localStorage.getItem('token') ?? ''
      return JSON.parse(atob(token.split('.')[1])).sub as string
    } catch { return '' }
  })()

  // Reset local changes when task changes
  useEffect(() => {
    setLocalChanges(pendingFromPlan ? { ...pendingFromPlan } : {})
    setShowDirtyWarning(false)
  }, [taskId]) // eslint-disable-line react-hooks/exhaustive-deps

  const { data: task, isLoading } = useQuery({
    queryKey: ['task', taskId],
    queryFn: () => tasksApi.get(taskId!),
    enabled: !!taskId,
  })

  const { data: commentsData } = useQuery({
    queryKey: ['task-comments', taskId],
    queryFn: () => tasksApi.getComments(taskId!),
    enabled: !!taskId,
  })

  const { data: usersRaw } = useQuery({
    queryKey: ['org-users'],
    queryFn: async () => { const r = await api.get('/users'); return r.data },
  })
  const usersData: Array<{ id: string; fullName: string }> = Array.isArray(usersRaw)
    ? usersRaw
    : (usersRaw as any)?.users ?? []

  const updateTask = useMutation({
    mutationFn: (data: any) => tasksApi.update(taskId!, data),
    onSuccess: (updated) => {
      qc.setQueryData(['task', taskId], updated)
      qc.invalidateQueries({ queryKey: ['tasks', projectId] })
      qc.invalidateQueries({ queryKey: ['gantt', projectId] })
    },
    onError: () => {
      alert('Не удалось сохранить изменение. Проверьте соединение.')
    },
  })

  const addComment = useMutation({
    mutationFn: (text: string) => tasksApi.addComment(taskId!, text),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task-comments', taskId] })
      setCommentText('')
    },
  })

  const editComment = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) =>
      tasksApi.updateComment(taskId!, id, text),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['task-comments', taskId] }),
  })

  const deleteComment = useMutation({
    mutationFn: (id: string) => tasksApi.deleteComment(taskId!, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['task-comments', taskId] }),
  })

  const deleteTask = useMutation({
    mutationFn: () => tasksApi.delete(taskId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks', projectId] })
      onClose()
    },
  })

  // Local field helpers
  const getV = <T,>(field: string, fallback: T): T =>
    field in localChanges ? (localChanges[field] as T) : fallback
  const setV = (field: string, value: any) =>
    setLocalChanges(prev => ({ ...prev, [field]: value }))

  // Save all local changes and close
  const handleSave = useCallback(() => {
    if (!taskId) return
    if (Object.keys(localChanges).length === 0) {
      onClose()
      return
    }
    updateTask.mutate(localChanges, {
      onSuccess: () => {
        onClearPlanPending?.(taskId)
        setLocalChanges({})
        onClose()
      },
    })
  }, [taskId, localChanges, updateTask, onClose, onClearPlanPending])

  // Handle close button — warn if dirty
  const handleClose = useCallback(() => {
    if (isDirty) {
      setShowDirtyWarning(true)
    } else {
      onClose()
    }
  }, [isDirty, onClose])

  // Ctrl+Enter → save & close (skip when comment textarea focused)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!taskId || !e.ctrlKey || e.key !== 'Enter') return
      if (document.activeElement === commentRef.current) return
      e.preventDefault()
      handleSave()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [taskId, handleSave])

  // Focus the corresponding field when drawer opens via double-click
  useEffect(() => {
    if (!focusField || !taskId) return
    if (focusField === 'deps') {
      setActiveTab('deps')
      return
    }
    setActiveTab('details')
    const timer = setTimeout(() => {
      const el = contentRef.current?.querySelector<HTMLElement>(`[data-field="${focusField}"]`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el.focus()
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) el.select()
      }
    }, 80)
    return () => clearTimeout(timer)
  }, [taskId, focusField])

  const isOpen = !!taskId
  if (!isOpen) return null

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 z-40 bg-black/10" onClick={handleClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 z-50 h-full w-full max-w-lg bg-white shadow-2xl flex flex-col relative">

        {/* Dirty warning overlay */}
        {showDirtyWarning && (
          <div className="absolute inset-0 z-10 bg-black/20 flex items-center justify-center">
            <div className="bg-white rounded-xl shadow-xl p-6 w-80 mx-4">
              <p className="text-sm font-semibold text-gray-900 mb-1">Несохранённые изменения</p>
              <p className="text-sm text-gray-500 mb-4">Закрыть карточку без применения изменений?</p>
              <div className="flex flex-col gap-2">
                <Button size="sm" onClick={handleSave} loading={updateTask.isPending}>
                  Сохранить и закрыть
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => { setLocalChanges({}); setShowDirtyWarning(false); onClose() }}
                >
                  Закрыть без сохранения
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowDirtyWarning(false)}>
                  Отмена
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            {task && <TaskStatusBadge status={task.status} />}
            {isDirty && (
              <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                Изменено
              </span>
            )}
            <button
              onClick={handleClose}
              className="ml-2 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          {task && (
            <div className="flex items-center gap-2">
              {onAddChild && (
                <Button size="sm" variant="secondary" onClick={() => onAddChild(task.id)}>
                  + Подзадача
                </Button>
              )}
              <button
                onClick={() => openAiPanel({ type: 'task_summary', taskId: task.id, taskTitle: task.title })}
                className="p-1.5 rounded-lg text-violet-600 hover:text-violet-700 hover:bg-violet-50"
                title="AI сводка по задаче"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </button>
              <button
                onClick={() => { if (confirm('Удалить задачу?')) deleteTask.mutate() }}
                className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50"
                title="Удалить задачу"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 px-5 flex-shrink-0">
          {([
            { key: 'details', label: 'Детали' },
            { key: 'deps', label: 'Зависимости' },
            { key: 'effort', label: 'Трудозатраты' },
            { key: 'timelog', label: 'Табель' },
          ] as { key: DrawerTab; label: string }[]).map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === t.key
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {isLoading || !task ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          </div>
        ) : (
          <div ref={contentRef} className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* ── Dependencies tab ── */}
            {activeTab === 'deps' && task && (
              <DepsTab taskId={task.id} projectId={projectId} />
            )}

            {/* ── Effort plan tab ── */}
            {activeTab === 'effort' && (
              <EffortPlanTab
                taskId={task.id}
                taskStartDate={task.startDate ?? null}
                taskDueDate={task.dueDate ?? null}
              />
            )}

            {/* ── Time log tab ── */}
            {activeTab === 'timelog' && (
              <TimeLogWidget taskId={task.id} userId={currentUserId} />
            )}

            {/* ── Details tab ── */}
            {activeTab === 'details' && <>

            {/* Title */}
            <input
              data-field="title"
              className="w-full text-lg font-semibold text-gray-900 border-0 border-b border-transparent hover:border-gray-200 focus:border-blue-400 focus:outline-none py-1 transition-colors"
              value={getV('title', task.title)}
              onChange={e => setV('title', e.target.value)}
            />

            {/* Attributes grid */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              {/* Status */}
              <div>
                <p className="text-xs text-gray-400 mb-1">Статус</p>
                <select
                  data-field="status"
                  value={getV('status', task.status)}
                  onChange={e => setV('status', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {ALL_TASK_STATUSES.map(s => (
                    <option key={s} value={s}>{TASK_STATUS_LABELS[s]}</option>
                  ))}
                </select>
              </div>

              {/* Priority */}
              <div>
                <p className="text-xs text-gray-400 mb-1">Приоритет</p>
                <select
                  value={getV('priority', task.priority)}
                  onChange={e => setV('priority', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {(['low', 'medium', 'high', 'critical'] as TaskPriority[]).map(p => (
                    <option key={p} value={p}>{TASK_PRIORITY_LABELS[p]}</option>
                  ))}
                </select>
              </div>

              {/* Assignee */}
              <div>
                <p className="text-xs text-gray-400 mb-1">Исполнитель</p>
                <select
                  data-field="assignee"
                  value={getV('assigneeId', task.assigneeId ?? '')}
                  onChange={e => setV('assigneeId', e.target.value || null)}
                  className="w-full border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">— Не назначен —</option>
                  {usersData?.map(u => <option key={u.id} value={u.id}>{u.fullName}</option>)}
                </select>
              </div>

              {/* Effort */}
              <div>
                <p className="text-xs text-gray-400 mb-1">Трудоёмкость (ч)</p>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={getV('effortHours', task.effortHours) ?? ''}
                  onChange={e => setV('effortHours', e.target.value === '' ? null : parseFloat(e.target.value))}
                  className="w-full border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Duration */}
              <div>
                <p className="text-xs text-gray-400 mb-1">
                  Длительность (дн.)
                </p>
                <input
                  data-field="duration"
                  type="number"
                  min={1}
                  step={1}
                  value={getV('duration', task.duration) ?? ''}
                  placeholder="—"
                  disabled={READ_ONLY_SCHED.has(getV('constraintType', task.constraintType ?? '') as string)}
                  onChange={e => {
                    const dur = e.target.value === '' ? null : parseInt(e.target.value)
                    setLocalChanges(prev => {
                      const next: Record<string, any> = { ...prev, duration: dur }
                      if (dur && dur > 0) {
                        const constraint = (prev.constraintType ?? task.constraintType ?? 'asap') as string
                        if (READ_ONLY_SCHED.has(constraint)) {
                          // no date recalculation
                        } else if (FIXED_FINISH.has(constraint)) {
                          const due = (prev.dueDate ?? task.dueDate) as string | null
                          if (due) next.startDate = addDays(due, -(dur - 1))
                        } else {
                          const start = (prev.startDate ?? task.startDate) as string | null
                          if (start) next.dueDate = addDays(start, dur - 1)
                        }
                      }
                      return next
                    })
                  }}
                  className="w-full border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
                />
              </div>

              {/* Start date */}
              <div>
                <p className="text-xs text-gray-400 mb-1">Дата начала</p>
                <input
                  data-field="startDate"
                  type="date"
                  value={getV('startDate', task.startDate) ?? ''}
                  disabled={READ_ONLY_SCHED.has(getV('constraintType', task.constraintType ?? '') as string)}
                  onChange={e => {
                    const val = e.target.value || null
                    setLocalChanges(prev => {
                      const next: Record<string, any> = { ...prev, startDate: val }
                      if (val) {
                        const due = (prev.dueDate ?? task.dueDate) as string | null
                        if (due) {
                          const d = diffDays(val, due)
                          if (d > 0) next.duration = d
                        }
                      }
                      return next
                    })
                  }}
                  className="w-full border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
                />
              </div>

              {/* Due date */}
              <div>
                <p className="text-xs text-gray-400 mb-1">Срок</p>
                <input
                  data-field="dueDate"
                  type="date"
                  value={getV('dueDate', task.dueDate) ?? ''}
                  disabled={READ_ONLY_SCHED.has(getV('constraintType', task.constraintType ?? '') as string)}
                  onChange={e => {
                    const val = e.target.value || null
                    setLocalChanges(prev => {
                      const next: Record<string, any> = { ...prev, dueDate: val }
                      if (val) {
                        const start = (prev.startDate ?? task.startDate) as string | null
                        if (start) {
                          const d = diffDays(start, val)
                          if (d > 0) next.duration = d
                        }
                      }
                      return next
                    })
                  }}
                  className="w-full border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
                />
              </div>

              {/* % complete */}
              <div>
                <p className="text-xs text-gray-400 mb-1">% выполнения</p>
                <input
                  data-field="percentComplete"
                  type="number"
                  min={0}
                  max={100}
                  step={5}
                  value={getV('percentComplete', task.percentComplete ?? 0)}
                  onChange={e => setV('percentComplete', Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))}
                  className="w-full border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Task type */}
              <div>
                <p className="text-xs text-gray-400 mb-1">Тип задачи</p>
                <select
                  data-field="taskType"
                  value={getV('taskType', task.taskType ?? 'task')}
                  onChange={e => setV('taskType', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="task">Задача</option>
                  <option value="milestone">Веха</option>
                  <option value="billable_stage">Этап</option>
                  <option value="management">Управление</option>
                </select>
              </div>

              {/* Constraint */}
              <div className="col-span-2">
                <p className="text-xs text-gray-400 mb-1">Ограничение</p>
                <select
                  data-field="constraintType"
                  value={getV('constraintType', task.constraintType ?? 'asap')}
                  onChange={e => setV('constraintType', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="asap">КМР — как можно раньше</option>
                  <option value="alap">КМП — как можно позже</option>
                  <option value="snet">ННР — начало не ранее</option>
                  <option value="snlt">ННП — начало не позднее</option>
                  <option value="fnet">ОНР — окончание не ранее</option>
                  <option value="fnlt">ОНП — окончание не позднее</option>
                  <option value="mso">МНД — начало должно быть (Must Start On)</option>
                  <option value="mfo">МОД — окончание должно быть (Must Finish On)</option>
                  <option value="hammock">Гамак</option>
                </select>
              </div>

              {/* Parent task */}
              {task.parentId && (
                <div className="col-span-2">
                  <p className="text-xs text-gray-400 mb-1">Родительская задача</p>
                  {onNavigateToTask ? (
                    <button
                      onClick={() => onNavigateToTask(task.parentId!)}
                      className="text-sm text-blue-600 hover:underline text-left truncate max-w-full"
                    >
                      {task.parentTitle ?? task.parentId}
                    </button>
                  ) : (
                    <p className="text-sm text-gray-700 truncate">{task.parentTitle ?? task.parentId}</p>
                  )}
                </div>
              )}
            </div>

            {/* Description */}
            <div>
              <p className="text-xs text-gray-400 mb-1">Описание</p>
              <textarea
                data-field="description"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
                rows={4}
                value={getV('description', task.description ?? '')}
                placeholder="Добавьте описание..."
                onChange={e => setV('description', e.target.value || null)}
              />
            </div>

            {/* Comments */}
            <div>
              <p className="text-sm font-medium text-gray-700 mb-3">
                Комментарии {commentsData?.items.length ? `(${commentsData.items.length})` : ''}
              </p>
              <div className="divide-y divide-gray-50">
                {commentsData?.items.map(c => (
                  <CommentItem
                    key={c.id}
                    comment={c}
                    currentUserId={currentUserId}
                    onEdit={(id, text) => editComment.mutate({ id, text })}
                    onDelete={id => deleteComment.mutate(id)}
                  />
                ))}
              </div>

              {/* Add comment */}
              <div className="mt-3">
                <textarea
                  ref={commentRef}
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  placeholder="Напишите комментарий... (@имя для упоминания)"
                  rows={3}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
                  onKeyDown={e => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && commentText.trim()) {
                      e.preventDefault()
                      e.stopPropagation()
                      addComment.mutate(commentText.trim())
                    }
                  }}
                />
                <div className="flex items-center justify-between mt-1.5">
                  <p className="text-xs text-gray-400">Ctrl+Enter для отправки</p>
                  <Button
                    size="sm"
                    disabled={!commentText.trim()}
                    loading={addComment.isPending}
                    onClick={() => commentText.trim() && addComment.mutate(commentText.trim())}
                  >
                    Отправить
                  </Button>
                </div>
              </div>
            </div>

            {/* end details tab */}
            </>}
          </div>
        )}

        {/* Save footer — visible when there are unsaved changes */}
        {isDirty && !isLoading && task && (
          <div className="flex-shrink-0 border-t border-amber-200 bg-amber-50 px-5 py-3 flex items-center justify-between gap-3">
            <span className="text-xs text-amber-700">Есть несохранённые изменения</span>
            <Button size="sm" onClick={handleSave} loading={updateTask.isPending}>
              Применить <kbd className="ml-1 text-[10px] bg-white/60 border border-amber-300 rounded px-1">Ctrl+↵</kbd>
            </Button>
          </div>
        )}
      </div>
    </>
  )
}

// ── DepsTab ───────────────────────────────────────────────────────────────────

interface Dep {
  id: string
  predecessorId: string
  predecessorTitle: string
  predecessorStart: string | null
  predecessorEnd: string | null
  type: string
  lagDays: number
}

interface DepsTabProps {
  taskId: string
  projectId: string
}

const DEP_TYPE_LABELS: Record<string, string> = {
  FS: 'FS — Конец→Начало',
  SS: 'SS — Начало→Начало',
  FF: 'FF — Конец→Конец',
  SF: 'SF — Начало→Конец',
}

function DepsTab({ taskId, projectId }: DepsTabProps) {
  const qc = useQueryClient()
  const [predecessorId, setPredecessorId] = useState('')
  const [depType, setDepType] = useState('FS')
  const [lagDays, setLagDays] = useState(0)
  const [adding, setAdding] = useState(false)

  const { data: allTasks = [] } = useQuery<{ id: string; title: string }[]>({
    queryKey: ['gantt', projectId],
    queryFn: async () => {
      const r = await api.get(`/projects/${projectId}/gantt`)
      return r.data
    },
    select: (d: any[]) => d.map(t => ({ id: t.id, title: t.title })),
  })

  const { data: deps = [], isLoading } = useQuery<Dep[]>({
    queryKey: ['task-deps', taskId],
    queryFn: async () => {
      const r = await api.get(`/tasks/${taskId}/dependencies`)
      return Array.isArray(r.data) ? r.data : (r.data.items ?? [])
    },
    enabled: !!taskId,
  })

  const addMut = useMutation({
    mutationFn: () =>
      api.post(`/tasks/${taskId}/dependencies`, { predecessorId, type: depType, lagDays }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task-deps', taskId] })
      qc.invalidateQueries({ queryKey: ['gantt', projectId] })
      setAdding(false)
      setPredecessorId('')
      setLagDays(0)
    },
  })

  const removeMut = useMutation({
    mutationFn: (depId: string) =>
      api.delete(`/tasks/dependencies/${depId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task-deps', taskId] })
      qc.invalidateQueries({ queryKey: ['gantt', projectId] })
    },
  })

  const availablePredecessors = allTasks.filter(t => t.id !== taskId && !deps.some(d => d.predecessorId === t.id))

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-700">Предшественники</h4>
        <button
          onClick={() => setAdding(v => !v)}
          className="text-xs text-blue-600 hover:text-blue-800 font-medium"
        >
          {adding ? 'Отмена' : '+ Добавить'}
        </button>
      </div>

      {adding && (
        <div className="space-y-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
          <select
            value={predecessorId}
            onChange={e => setPredecessorId(e.target.value)}
            className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">Выберите задачу...</option>
            {availablePredecessors.map(t => (
              <option key={t.id} value={t.id}>{t.title}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <select
              value={depType}
              onChange={e => setDepType(e.target.value)}
              className="flex-1 border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {Object.entries(DEP_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-500 whitespace-nowrap">Запаздывание:</span>
              <input
                type="number"
                value={lagDays}
                min={-999}
                max={999}
                onChange={e => setLagDays(parseInt(e.target.value) || 0)}
                className="w-16 border border-gray-200 rounded px-2 py-1.5 text-xs text-center focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <span className="text-xs text-gray-500">дн.</span>
            </div>
          </div>
          <button
            disabled={!predecessorId || addMut.isPending}
            onClick={() => addMut.mutate()}
            className="w-full py-1.5 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {addMut.isPending ? 'Добавление...' : 'Добавить зависимость'}
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="text-xs text-gray-400 py-2 text-center">Загрузка...</div>
      ) : deps.length === 0 ? (
        <div className="text-xs text-gray-400 py-4 text-center">Нет зависимостей</div>
      ) : (
        <ul className="space-y-1.5">
          {deps.map(dep => (
            <li key={dep.id} className="flex items-center gap-2 p-2 rounded-md bg-gray-50 border border-gray-100 group">
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono font-semibold bg-blue-100 text-blue-700">
                {dep.type}
              </span>
              <span className="flex-1 text-xs text-gray-800 truncate">{dep.predecessorTitle}</span>
              {dep.lagDays !== 0 && (
                <span className="text-xs text-gray-500 whitespace-nowrap">
                  {dep.lagDays > 0 ? `+${dep.lagDays}` : dep.lagDays} дн.
                </span>
              )}
              <button
                onClick={() => removeMut.mutate(dep.id)}
                disabled={removeMut.isPending}
                className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-opacity"
                title="Удалить зависимость"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
