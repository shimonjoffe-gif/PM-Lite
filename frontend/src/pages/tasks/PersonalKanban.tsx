import { useState, useRef, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { tasksApi } from '@/api/tasks'
import { Task, TaskStatus, TASK_STATUS_LABELS, TASK_STATUS_COLORS, ALL_TASK_STATUSES, TASK_PRIORITY_LABELS } from '@/types/task'

type GroupMode = 'whose_turn' | 'by_deadline' | 'by_status'

interface Column {
  id: string
  label: string
  color: string
  tasks: Task[]
}

function groupByWhoseTurn(tasks: Task[], currentUserId: string): Column[] {
  const mine: Task[] = []
  const waiting: Task[] = []
  const control: Task[] = []

  tasks.forEach(t => {
    if (t.status === 'done' || t.status === 'cancelled') {
      control.push(t)
    } else if (t.status === 'review') {
      waiting.push(t)
    } else if (t.assigneeId === currentUserId) {
      mine.push(t)
    } else {
      waiting.push(t)
    }
  })

  return [
    { id: 'mine', label: 'Жду действий от меня', color: '#3B82F6', tasks: mine },
    { id: 'waiting', label: 'Жду действий от других', color: '#F59E0B', tasks: waiting },
    { id: 'control', label: 'На контроле', color: '#10B981', tasks: control },
  ]
}

function groupByDeadline(tasks: Task[]): Column[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
  const nextWeek = new Date(today); nextWeek.setDate(today.getDate() + 8)

  const overdue: Task[] = []
  const todayTasks: Task[] = []
  const weekTasks: Task[] = []
  const later: Task[] = []

  tasks.forEach(t => {
    if (t.status === 'done' || t.status === 'cancelled') return
    if (!t.dueDate) { later.push(t); return }
    const d = new Date(t.dueDate)
    if (d < today) overdue.push(t)
    else if (d < tomorrow) todayTasks.push(t)
    else if (d < nextWeek) weekTasks.push(t)
    else later.push(t)
  })

  return [
    { id: 'overdue', label: 'Просрочено', color: '#EF4444', tasks: overdue },
    { id: 'today', label: 'Сегодня', color: '#F59E0B', tasks: todayTasks },
    { id: 'week', label: 'На неделе', color: '#3B82F6', tasks: weekTasks },
    { id: 'later', label: 'Позже', color: '#6B7280', tasks: later },
  ]
}

function groupByStatus(tasks: Task[]): Column[] {
  const groups: Record<TaskStatus, Task[]> = {
    todo: [], in_progress: [], review: [], done: [], cancelled: [],
  }
  tasks.forEach(t => groups[t.status].push(t))
  return ALL_TASK_STATUSES.map(s => ({
    id: s,
    label: TASK_STATUS_LABELS[s],
    color: TASK_STATUS_COLORS[s],
    tasks: groups[s],
  }))
}

function StatusDropdown({ task, onClose, onSelect }: {
  task: Task
  onClose: () => void
  onSelect: (status: TaskStatus) => void
}) {
  const ref = useRef<HTMLDivElement>(null)

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
          onClick={() => { onSelect(s); onClose() }}
          className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 flex items-center gap-2 ${s === task.status ? 'font-medium' : ''}`}
        >
          <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: TASK_STATUS_COLORS[s] }} />
          {TASK_STATUS_LABELS[s]}
        </button>
      ))}
    </div>
  )
}

function KanbanCard({ task, onStatusChange, onSelect }: {
  task: Task & { projectName?: string | null }
  onStatusChange: (taskId: string, status: TaskStatus) => void
  onSelect: (task: Task) => void
}) {
  const [showStatus, setShowStatus] = useState(false)
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'done' && task.status !== 'cancelled'

  return (
    <div
      className="bg-white border border-gray-200 rounded-lg p-3 hover:border-blue-300 hover:shadow-sm transition-all"
      onClick={() => onSelect(task)}
    >
      <p className="text-sm text-gray-900 leading-snug mb-2 line-clamp-2">{task.title}</p>

      <div className="flex items-center justify-between gap-2">
        <div className="relative" onClick={e => e.stopPropagation()}>
          <button
            onClick={() => setShowStatus(v => !v)}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium border"
            style={{
              color: TASK_STATUS_COLORS[task.status],
              borderColor: TASK_STATUS_COLORS[task.status] + '40',
              backgroundColor: TASK_STATUS_COLORS[task.status] + '12',
            }}
          >
            <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: TASK_STATUS_COLORS[task.status] }} />
            {TASK_STATUS_LABELS[task.status]}
          </button>
          {showStatus && (
            <StatusDropdown
              task={task}
              onClose={() => setShowStatus(false)}
              onSelect={status => onStatusChange(task.id, status)}
            />
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {task.dueDate && (
            <span className={`text-xs ${isOverdue ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
              {task.dueDate}
            </span>
          )}
          {(task as any).projectName && (
            <span className="text-xs text-gray-400 truncate max-w-20">{(task as any).projectName}</span>
          )}
        </div>
      </div>

      {task.priority && (
        <p className="text-xs text-gray-400 mt-1">{TASK_PRIORITY_LABELS[task.priority]}</p>
      )}
    </div>
  )
}

interface PersonalKanbanProps {
  tasks: Array<Task & { projectName?: string | null }>
  currentUserId: string
  onSelectTask: (task: Task) => void
}

const MODE_LABELS: Record<GroupMode, string> = {
  whose_turn: 'По очерёдности',
  by_deadline: 'По срокам',
  by_status: 'По статусу',
}

export function PersonalKanban({ tasks, currentUserId, onSelectTask }: PersonalKanbanProps) {
  const [mode, setMode] = useState<GroupMode>('whose_turn')
  const qc = useQueryClient()

  const updateStatus = useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: TaskStatus }) =>
      tasksApi.update(taskId, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-tasks'] }),
  })

  const columns: Column[] =
    mode === 'whose_turn' ? groupByWhoseTurn(tasks, currentUserId)
    : mode === 'by_deadline' ? groupByDeadline(tasks)
    : groupByStatus(tasks)

  return (
    <div>
      {/* Mode switcher */}
      <div className="flex items-center gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
        {(Object.keys(MODE_LABELS) as GroupMode[]).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              mode === m ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {MODE_LABELS[m]}
          </button>
        ))}
      </div>

      {/* Columns */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map(col => (
          <div key={col.id} className="w-64 flex-shrink-0">
            <div className="flex items-center gap-2 mb-2 px-1">
              <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: col.color }} />
              <p className="text-xs font-semibold text-gray-600">{col.label}</p>
              <span className="text-xs text-gray-400">{col.tasks.length}</span>
            </div>
            <div className="bg-gray-50 rounded-xl p-2 space-y-2 min-h-20">
              {col.tasks.length === 0 && (
                <p className="text-xs text-gray-300 text-center py-4">Задач нет</p>
              )}
              {col.tasks.map(t => (
                <KanbanCard
                  key={t.id}
                  task={t}
                  onStatusChange={(taskId, status) => updateStatus.mutate({ taskId, status })}
                  onSelect={onSelectTask}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
