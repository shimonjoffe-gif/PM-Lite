import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { tasksApi } from '@/api/tasks'
import { Task, TaskStatus, TASK_STATUS_LABELS, TASK_STATUS_COLORS, ALL_TASK_STATUSES, TASK_PRIORITY_LABELS } from '@/types/task'
import { Button } from '@/components/ui/Button'
import { useAiPanel } from '@/store/aiPanel'

interface TaskWithProject extends Task {
  projectName: string | null
}

// ── Right panel ───────────────────────────────────────────────────────────────

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

  if (comment.deletedAt) {
    return (
      <div className="flex gap-2 py-2">
        <div className="h-6 w-6 rounded-full bg-gray-200 flex-shrink-0" />
        <p className="text-xs text-gray-400 italic pt-1">[Удалено]</p>
      </div>
    )
  }

  return (
    <div className="flex gap-2 py-2 group">
      <div className="h-6 w-6 rounded-full bg-blue-600 flex-shrink-0 flex items-center justify-center text-white text-[10px] font-semibold">
        {comment.userName.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs font-medium text-gray-700">{comment.userName}</span>
          <span className="text-xs text-gray-400">{new Date(comment.createdAt).toLocaleString('ru')}</span>
          {comment.updatedAt && <span className="text-xs text-gray-400">(ред.)</span>}
        </div>
        {editing ? (
          <div className="space-y-1.5">
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

function TaskDetailPanel({ task }: { task: TaskWithProject }) {
  const qc = useQueryClient()
  const commentRef = useRef<HTMLTextAreaElement>(null)
  const [commentText, setCommentText] = useState('')
  const openAiPanel = useAiPanel(s => s.open)

  const currentUserId = (() => {
    try {
      const token = localStorage.getItem('token') ?? ''
      return JSON.parse(atob(token.split('.')[1])).sub as string
    } catch { return '' }
  })()

  const { data: commentsData } = useQuery({
    queryKey: ['task-comments', task.id],
    queryFn: () => tasksApi.getComments(task.id),
  })

  const updateTask = useMutation({
    mutationFn: (data: any) => tasksApi.update(task.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-tasks'] })
    },
  })

  const addComment = useMutation({
    mutationFn: (text: string) => tasksApi.addComment(task.id, text),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task-comments', task.id] })
      setCommentText('')
    },
  })

  const editComment = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) =>
      tasksApi.updateComment(task.id, id, text),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['task-comments', task.id] }),
  })

  const deleteComment = useMutation({
    mutationFn: (id: string) => tasksApi.deleteComment(task.id, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['task-comments', task.id] }),
  })

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-start justify-between gap-3 mb-3">
          <h2 className="text-base font-semibold text-gray-900 leading-snug">{task.title}</h2>
          <button
            onClick={() => openAiPanel({ type: 'task_summary', taskId: task.id, taskTitle: task.title })}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 flex-shrink-0"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            AI
          </button>
        </div>

        {task.projectName && (
          <p className="text-xs text-gray-400 mb-3">{task.projectName}</p>
        )}

        {/* Status dropdown */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">Статус:</span>
          <select
            value={task.status}
            onChange={e => updateTask.mutate({ status: e.target.value as TaskStatus })}
            className="border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {ALL_TASK_STATUSES.map(s => (
              <option key={s} value={s}>{TASK_STATUS_LABELS[s]}</option>
            ))}
          </select>
          <span
            className="h-2 w-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: TASK_STATUS_COLORS[task.status] }}
          />
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* Meta */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          {task.dueDate && (
            <>
              <span className="text-xs text-gray-400">Срок</span>
              <span className="text-xs text-gray-700">{task.dueDate}</span>
            </>
          )}
          {task.effortHours != null && (
            <>
              <span className="text-xs text-gray-400">Трудоёмкость</span>
              <span className="text-xs text-gray-700">{task.effortHours} ч</span>
            </>
          )}
          {task.assigneeName && (
            <>
              <span className="text-xs text-gray-400">Исполнитель</span>
              <span className="text-xs text-gray-700">{task.assigneeName}</span>
            </>
          )}
          <span className="text-xs text-gray-400">Приоритет</span>
          <span className="text-xs text-gray-700">{TASK_PRIORITY_LABELS[task.priority]}</span>
        </div>

        {/* Description */}
        {task.description && (
          <div>
            <p className="text-xs text-gray-400 mb-1">Описание</p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{task.description}</p>
          </div>
        )}

        {/* Comments */}
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">
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

          <div className="mt-3">
            <textarea
              ref={commentRef}
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              placeholder="Напишите комментарий..."
              rows={3}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && commentText.trim()) {
                  e.preventDefault()
                  addComment.mutate(commentText.trim())
                }
              }}
            />
            <div className="flex items-center justify-between mt-1.5">
              <p className="text-xs text-gray-400">Ctrl+Enter</p>
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
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

const PRIORITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }

interface ProjectsViewProps {
  tasks: TaskWithProject[]
}

export function ProjectsView({ tasks }: ProjectsViewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const sorted = [...tasks].sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority] ?? 99
    const pb = PRIORITY_ORDER[b.priority] ?? 99
    if (pa !== pb) return pa - pb
    if (!a.dueDate && !b.dueDate) return 0
    if (!a.dueDate) return 1
    if (!b.dueDate) return -1
    return a.dueDate.localeCompare(b.dueDate)
  })

  const selectedTask = sorted.find(t => t.id === selectedId) ?? sorted[0] ?? null
  const effectiveSelected = selectedTask?.id ?? null

  return (
    <div className="flex gap-0 h-[calc(100vh-160px)] border border-gray-200 rounded-xl overflow-hidden bg-white">
      {/* Left: task list */}
      <div className="w-80 flex-shrink-0 border-r border-gray-100 overflow-y-auto">
        {sorted.length === 0 && (
          <div className="py-16 text-center text-sm text-gray-400">Задач нет</div>
        )}
        {sorted.map(t => {
          const isOverdue = t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'done' && t.status !== 'cancelled'
          const isSelected = t.id === effectiveSelected

          return (
            <button
              key={t.id}
              onClick={() => setSelectedId(t.id)}
              className={`w-full text-left px-4 py-3 border-b border-gray-50 transition-colors ${
                isSelected ? 'bg-blue-50 border-l-2 border-l-blue-500' : 'hover:bg-gray-50'
              }`}
            >
              <div className="flex items-start gap-2">
                <span
                  className="mt-1.5 h-2 w-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: TASK_STATUS_COLORS[t.status] }}
                />
                <div className="min-w-0 flex-1">
                  <p className={`text-sm leading-snug truncate ${t.status === 'done' ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                    {t.title}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {t.projectName && (
                      <span className="text-xs text-gray-400 truncate">{t.projectName}</span>
                    )}
                    {t.dueDate && (
                      <span className={`text-xs flex-shrink-0 ${isOverdue ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                        {t.dueDate}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Right: detail panel */}
      <div className="flex-1 overflow-hidden">
        {selectedTask ? (
          <TaskDetailPanel key={selectedTask.id} task={selectedTask} />
        ) : (
          <div className="flex items-center justify-center h-full text-sm text-gray-400">
            Выберите задачу
          </div>
        )}
      </div>
    </div>
  )
}
