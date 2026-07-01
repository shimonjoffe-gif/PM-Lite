import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { tasksApi, ListTasksParams } from '@/api/tasks'
import { TaskStatus, TaskPriority, TASK_STATUS_LABELS, TASK_PRIORITY_LABELS, TASK_STATUS_COLORS, ALL_TASK_STATUSES } from '@/types/task'
import { TaskStatusBadge, TaskPriorityBadge } from './TaskStatusBadge'
import { TaskDrawer } from './TaskDrawer'
import { PersonalKanban } from './PersonalKanban'
import { ProjectsView } from './ProjectsView'
import { Input } from '@/components/ui/Input'

type ViewTab = 'list' | 'kanban' | 'projects'

type QuickDeadline = 'overdue' | 'today' | 'week' | 'month' | null

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}
function offsetDate(days: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function quickToParams(q: QuickDeadline): Pick<ListTasksParams, 'overdue' | 'dueDateFrom' | 'dueDateTo'> {
  if (q === 'overdue') return { overdue: true }
  if (q === 'today') return { dueDateFrom: todayStr(), dueDateTo: todayStr() }
  if (q === 'week') return { dueDateFrom: todayStr(), dueDateTo: offsetDate(7) }
  if (q === 'month') return { dueDateFrom: todayStr(), dueDateTo: offsetDate(30) }
  return {}
}

// ── Inline status dropdown in list ────────────────────────────────────────────

function InlineStatusDropdown({ taskId, currentStatus, onClose }: {
  taskId: string
  currentStatus: TaskStatus
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const qc = useQueryClient()

  const update = useMutation({
    mutationFn: (status: TaskStatus) => tasksApi.update(taskId, { status }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['my-tasks'] }); onClose() },
  })

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div ref={ref} className="absolute z-50 top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-36">
      {ALL_TASK_STATUSES.map(s => (
        <button
          key={s}
          onClick={() => update.mutate(s)}
          className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 flex items-center gap-2 ${s === currentStatus ? 'font-medium' : ''}`}
        >
          <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: TASK_STATUS_COLORS[s] }} />
          {TASK_STATUS_LABELS[s]}
        </button>
      ))}
    </div>
  )
}

// ── List view ─────────────────────────────────────────────────────────────────

function ListView() {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const [filters, setFilters] = useState<ListTasksParams>({})
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [quickDeadline, setQuickDeadline] = useState<QuickDeadline>(null)
  const [dueDateFrom, setDueDateFrom] = useState('')
  const [dueDateTo, setDueDateTo] = useState('')
  const [showDateRange, setShowDateRange] = useState(false)
  const [inlineStatusTask, setInlineStatusTask] = useState<string | null>(null)

  const deadlineParams = quickDeadline ? quickToParams(quickDeadline) : {
    dueDateFrom: dueDateFrom || undefined,
    dueDateTo: dueDateTo || undefined,
  }

  const activeFilters: ListTasksParams = {
    ...filters,
    ...deadlineParams,
    search: search || undefined,
    page,
    my: true,
  }

  const { data, isLoading } = useQuery({
    queryKey: ['my-tasks', activeFilters],
    queryFn: () => tasksApi.myTasks(activeFilters),
  })

  const tasks = data?.items ?? []

  const QUICK_BTNS: { key: QuickDeadline; label: string }[] = [
    { key: 'overdue', label: 'Просрочено' },
    { key: 'today', label: 'Сегодня' },
    { key: 'week', label: 'Неделя' },
    { key: 'month', label: 'Месяц' },
  ]

  return (
    <div>
      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 mb-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            placeholder="Поиск..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            className="h-8 text-sm w-44"
          />

          <select
            value={filters.status ?? ''}
            onChange={e => { setFilters(f => ({ ...f, status: (e.target.value as TaskStatus) || undefined })); setPage(1) }}
            className="border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none"
          >
            <option value="">Все статусы</option>
            {ALL_TASK_STATUSES.map(s => <option key={s} value={s}>{TASK_STATUS_LABELS[s]}</option>)}
          </select>

          <select
            value={filters.priority ?? ''}
            onChange={e => { setFilters(f => ({ ...f, priority: (e.target.value as TaskPriority) || undefined })); setPage(1) }}
            className="border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none"
          >
            <option value="">Все приоритеты</option>
            {(['low', 'medium', 'high', 'critical'] as TaskPriority[]).map(p => (
              <option key={p} value={p}>{TASK_PRIORITY_LABELS[p]}</option>
            ))}
          </select>

          <select
            value={filters.sortBy ?? ''}
            onChange={e => { setFilters(f => ({ ...f, sortBy: (e.target.value as any) || undefined })); setPage(1) }}
            className="border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none"
          >
            <option value="">Сортировка: по дедлайну ↑</option>
            <option value="deadline_desc">Сортировка: по дедлайну ↓</option>
            <option value="priority_desc">Сортировка: по приоритету</option>
          </select>
        </div>

        {/* Deadline quick buttons + date range */}
        <div className="flex flex-wrap items-center gap-2">
          {QUICK_BTNS.map(b => (
            <button
              key={b.key}
              onClick={() => {
                setQuickDeadline(q => q === b.key ? null : b.key)
                setDueDateFrom(''); setDueDateTo(''); setShowDateRange(false)
                setPage(1)
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                quickDeadline === b.key
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600'
              }`}
            >
              {b.label}
            </button>
          ))}

          <button
            onClick={() => { setShowDateRange(v => !v); setQuickDeadline(null); setPage(1) }}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
              showDateRange
                ? 'bg-blue-50 text-blue-700 border-blue-300'
                : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
            }`}
          >
            Диапазон дат
          </button>

          {showDateRange && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dueDateFrom}
                onChange={e => { setDueDateFrom(e.target.value); setPage(1) }}
                className="border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none"
              />
              <span className="text-xs text-gray-400">—</span>
              <input
                type="date"
                value={dueDateTo}
                onChange={e => { setDueDateTo(e.target.value); setPage(1) }}
                className="border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none"
              />
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="py-16 flex justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
        </div>
      ) : tasks.length === 0 ? (
        <div className="py-16 text-center text-sm text-gray-400">Задач нет</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Задача</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-500">Проект</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-500">Статус</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-500">Приоритет</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-500">Срок</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {tasks.map(t => {
                const isOverdue = t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'done' && t.status !== 'cancelled'
                return (
                  <tr
                    key={t.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => { setSelectedTaskId(t.id); setSelectedProjectId(t.projectId) }}
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <TaskPriorityBadge priority={t.priority} />
                        <span className={`${t.status === 'done' ? 'line-through text-gray-400' : 'text-gray-900'} truncate max-w-64`}>
                          {t.title}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      {t.projectId && (
                        <Link
                          to={`/projects/${t.projectId}`}
                          onClick={e => e.stopPropagation()}
                          className="text-blue-600 hover:underline text-xs"
                        >
                          {t.projectName ?? '—'}
                        </Link>
                      )}
                    </td>
                    <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                      <div className="relative inline-block">
                        <button
                          onClick={() => setInlineStatusTask(prev => prev === t.id ? null : t.id)}
                        >
                          <TaskStatusBadge status={t.status} />
                        </button>
                        {inlineStatusTask === t.id && (
                          <InlineStatusDropdown
                            taskId={t.id}
                            currentStatus={t.status}
                            onClose={() => setInlineStatusTask(null)}
                          />
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="text-xs text-gray-600">{TASK_PRIORITY_LABELS[t.priority]}</span>
                    </td>
                    <td className={`px-3 py-2.5 text-xs ${isOverdue ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                      {t.dueDate ?? '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {data && data.pages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-5">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40">←</button>
          <span className="text-sm text-gray-500">{page} / {data.pages}</span>
          <button onClick={() => setPage(p => Math.min(data.pages, p + 1))} disabled={page >= data.pages}
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40">→</button>
        </div>
      )}

      <TaskDrawer
        taskId={selectedTaskId}
        projectId={selectedProjectId}
        onClose={() => setSelectedTaskId(null)}
        onNavigateToTask={id => setSelectedTaskId(id)}
      />
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function MyTasksPage() {
  const [tab, setTab] = useState<ViewTab>('list')

  const currentUserId = (() => {
    try {
      const token = localStorage.getItem('token') ?? ''
      return JSON.parse(atob(token.split('.')[1])).sub as string
    } catch { return '' }
  })()

  const { data: allTasksData } = useQuery({
    queryKey: ['my-tasks', { my: true, pageSize: 200 }],
    queryFn: () => tasksApi.myTasks({ my: true, pageSize: 200 }),
    enabled: tab === 'kanban' || tab === 'projects',
  })
  const allTasks = allTasksData?.items ?? []

  const [kanbanSelectedId, setKanbanSelectedId] = useState<string | null>(null)
  const [kanbanProjectId, setKanbanProjectId] = useState<string>('')

  const TABS: { key: ViewTab; label: string }[] = [
    { key: 'list', label: 'Список' },
    { key: 'kanban', label: 'Канбан' },
    { key: 'projects', label: 'По проектам' },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-gray-900">Мои задачи</h1>

        {/* Tab switcher */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'list' && <ListView />}

      {tab === 'kanban' && (
        <>
          <PersonalKanban
            tasks={allTasks}
            currentUserId={currentUserId}
            onSelectTask={task => { setKanbanSelectedId(task.id); setKanbanProjectId(task.projectId) }}
          />
          <TaskDrawer
            taskId={kanbanSelectedId}
            projectId={kanbanProjectId}
            onClose={() => setKanbanSelectedId(null)}
            onNavigateToTask={id => setKanbanSelectedId(id)}
          />
        </>
      )}

      {tab === 'projects' && (
        <ProjectsView tasks={allTasks} />
      )}
    </div>
  )
}
