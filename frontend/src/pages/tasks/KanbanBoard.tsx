import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { tasksApi } from '@/api/tasks'
import { Task, BoardColumn, TASK_STATUS_COLORS, TASK_STATUS_LABELS, TaskStatus } from '@/types/task'
import { TaskPriorityBadge } from './TaskStatusBadge'
import { Button } from '@/components/ui/Button'

interface KanbanBoardProps {
  projectId: string
  tasks?: Task[]
  onSelectTask: (task: Task) => void
}

function KanbanCard({ task, onSelect, onDragStart }: {
  task: Task
  onSelect: (t: Task) => void
  onDragStart: (e: React.DragEvent, task: Task) => void
}) {
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'done' && task.status !== 'cancelled'

  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, task)}
      onClick={() => onSelect(task)}
      className="bg-white border border-gray-200 rounded-lg p-3 cursor-pointer hover:border-blue-300 hover:shadow-sm transition-all select-none"
    >
      <div className="flex items-start gap-1.5 mb-2">
        <TaskPriorityBadge priority={task.priority} />
        <p className="text-sm text-gray-900 leading-snug flex-1">{task.title}</p>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {task.assigneeName && (
            <div className="h-5 w-5 rounded-full bg-blue-600 flex items-center justify-center text-white text-[10px] font-semibold flex-shrink-0"
              title={task.assigneeName}>
              {task.assigneeName.charAt(0).toUpperCase()}
            </div>
          )}
          {task.childCount > 0 && (
            <span className="text-xs text-gray-400">{task.childCount} подзадач</span>
          )}
        </div>
        {task.dueDate && (
          <span className={`text-xs ${isOverdue ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
            {task.dueDate}
          </span>
        )}
      </div>
    </div>
  )
}

interface AddColumnFormProps {
  projectId: string
  onDone: () => void
}

function AddColumnForm({ projectId, onDone }: AddColumnFormProps) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [statusMapping, setStatusMapping] = useState<TaskStatus | ''>('')

  const create = useMutation({
    mutationFn: () => tasksApi.createBoardColumn(projectId, {
      name,
      statusMapping: statusMapping || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['board-columns', projectId] })
      onDone()
    },
  })

  return (
    <div className="w-64 flex-shrink-0 bg-gray-50 rounded-xl p-3 space-y-2">
      <input
        autoFocus
        className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        placeholder="Название колонки"
        value={name}
        onChange={e => setName(e.target.value)}
      />
      <select
        className="w-full border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        value={statusMapping}
        onChange={e => setStatusMapping(e.target.value as TaskStatus | '')}
      >
        <option value="">— Без привязки к статусу —</option>
        {(['todo', 'in_progress', 'review', 'done', 'cancelled'] as TaskStatus[]).map(s => (
          <option key={s} value={s}>{TASK_STATUS_LABELS[s]}</option>
        ))}
      </select>
      <div className="flex gap-2">
        <Button size="sm" disabled={!name.trim()} loading={create.isPending} onClick={() => name.trim() && create.mutate()}>
          Добавить
        </Button>
        <Button size="sm" variant="secondary" onClick={onDone}>Отмена</Button>
      </div>
    </div>
  )
}

export function KanbanBoard({ projectId, tasks: tasksProp, onSelectTask }: KanbanBoardProps) {
  const qc = useQueryClient()
  const [dragTask, setDragTask] = useState<Task | null>(null)
  const [dragOverCol, setDragOverCol] = useState<string | null>(null)
  const [addingColumn, setAddingColumn] = useState(false)

  const { data: internalTasksData } = useQuery({
    queryKey: ['tasks', projectId],
    queryFn: () => tasksApi.list(projectId),
    enabled: tasksProp === undefined,
  })
  const tasks: Task[] = tasksProp ?? (() => {
    if (!internalTasksData) return []
    const flat: Task[] = []
    const walk = (nodes: any[]) => nodes.forEach((n: any) => { flat.push(n); walk(n.children ?? []) })
    walk(internalTasksData.items as any[])
    return flat
  })()

  const { data: columnsData } = useQuery({
    queryKey: ['board-columns', projectId],
    queryFn: () => tasksApi.getBoardColumns(projectId),
  })
  const columns = columnsData?.items ?? []

  const { data: transitionsData } = useQuery({
    queryKey: ['task-transitions'],
    queryFn: () => tasksApi.getTransitions(),
  })
  const transitions = transitionsData?.items ?? []

  const updateTask = useMutation({
    mutationFn: ({ taskId, data }: { taskId: string; data: any }) => tasksApi.update(taskId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks', projectId] }),
  })

  const deleteColumn = useMutation({
    mutationFn: (colId: string) => tasksApi.deleteBoardColumn(projectId, colId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['board-columns', projectId] }),
  })

  // Group tasks by boardColumnId
  const tasksByColumn: Record<string, Task[]> = {}
  columns.forEach(c => { tasksByColumn[c.id] = [] })
  const unassigned: Task[] = []
  tasks.forEach(t => {
    if (t.boardColumnId && tasksByColumn[t.boardColumnId]) {
      tasksByColumn[t.boardColumnId].push(t)
    } else {
      unassigned.push(t)
    }
  })

  const canDropToColumn = (col: BoardColumn): boolean => {
    if (!dragTask || !col.statusMapping) return true
    if (dragTask.status === col.statusMapping) return true
    // Check transition rules
    const rulesExist = transitions.length > 0
    if (!rulesExist) return true
    return transitions.some(r =>
      r.fromStatus === dragTask.status && r.toStatus === col.statusMapping
    )
  }

  const handleDrop = (e: React.DragEvent, col: BoardColumn) => {
    e.preventDefault()
    if (!dragTask) return
    if (!canDropToColumn(col)) return

    const updateData: any = { boardColumnId: col.id }
    if (col.statusMapping && col.statusMapping !== dragTask.status) {
      updateData.status = col.statusMapping
    }
    updateTask.mutate({ taskId: dragTask.id, data: updateData })
    setDragTask(null)
    setDragOverCol(null)
  }

  if (!columns.length && !addingColumn) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <p className="text-gray-400 text-sm">Колонки не настроены</p>
        <Button onClick={() => setAddingColumn(true)}>Создать первую колонку</Button>
      </div>
    )
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 min-h-96">
      {/* Unassigned column */}
      {unassigned.length > 0 && (
        <div className="w-64 flex-shrink-0">
          <div className="flex items-center justify-between mb-2 px-1">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Без колонки</p>
            <span className="text-xs text-gray-400">{unassigned.length}</span>
          </div>
          <div className="space-y-2 min-h-20">
            {unassigned.map(t => (
              <KanbanCard key={t.id} task={t} onSelect={onSelectTask}
                onDragStart={(e, task) => { setDragTask(task); e.dataTransfer.effectAllowed = 'move' }} />
            ))}
          </div>
        </div>
      )}

      {columns.map(col => {
        const colTasks = tasksByColumn[col.id] ?? []
        const canDrop = canDropToColumn(col)
        const isDragOver = dragOverCol === col.id

        return (
          <div
            key={col.id}
            className="w-64 flex-shrink-0"
            onDragOver={e => { e.preventDefault(); setDragOverCol(col.id) }}
            onDragLeave={() => setDragOverCol(null)}
            onDrop={e => handleDrop(e, col)}
          >
            <div className={`rounded-xl p-3 flex flex-col gap-2 min-h-32 transition-colors ${isDragOver && canDrop ? 'bg-blue-50 border-2 border-blue-300' : isDragOver && !canDrop ? 'bg-red-50 border-2 border-red-200' : 'bg-gray-50'}`}>
              {/* Column header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {col.statusMapping && (
                    <span
                      className="h-2 w-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: TASK_STATUS_COLORS[col.statusMapping] }}
                    />
                  )}
                  <p className="text-xs font-semibold text-gray-700">{col.name}</p>
                  <span className="text-xs text-gray-400">{colTasks.length}</span>
                </div>
                <button
                  onClick={() => { if (confirm(`Удалить колонку «${col.name}»?`)) deleteColumn.mutate(col.id) }}
                  className="p-0.5 rounded text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100"
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Drag-blocked message */}
              {isDragOver && !canDrop && (
                <p className="text-xs text-red-400 text-center py-1">Переход запрещён</p>
              )}

              {/* Cards */}
              <div className="space-y-2">
                {colTasks.map(t => (
                  <KanbanCard
                    key={t.id}
                    task={t}
                    onSelect={onSelectTask}
                    onDragStart={(e, task) => { setDragTask(task); e.dataTransfer.effectAllowed = 'move' }}
                  />
                ))}
              </div>
            </div>
          </div>
        )
      })}

      {/* Add column */}
      {addingColumn ? (
        <AddColumnForm projectId={projectId} onDone={() => setAddingColumn(false)} />
      ) : (
        <div className="flex-shrink-0">
          <button
            onClick={() => setAddingColumn(true)}
            className="w-48 h-10 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-blue-300 hover:text-blue-500 transition-colors"
          >
            + Добавить колонку
          </button>
        </div>
      )}
    </div>
  )
}
