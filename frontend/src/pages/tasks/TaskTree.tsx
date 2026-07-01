import { useState } from 'react'
import { TaskNode, Task, TASK_STATUS_COLORS } from '@/types/task'
import { TaskPriorityBadge } from './TaskStatusBadge'

interface TaskTreeProps {
  items: TaskNode[]
  onSelect: (task: Task) => void
  onAddChild?: (parentId: string) => void
  selectedId?: string | null
  depth?: number
}

function TaskRow({
  task,
  depth,
  onSelect,
  onAddChild,
  selectedId,
  onToggle,
  expanded,
}: {
  task: TaskNode
  depth: number
  onSelect: (t: Task) => void
  onAddChild?: (parentId: string) => void
  selectedId?: string | null
  onToggle: () => void
  expanded: boolean
}) {
  const hasChildren = task.children.length > 0 || task.childCount > 0
  const isSelected = task.id === selectedId
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'done' && task.status !== 'cancelled'

  return (
    <div
      className={`group flex items-center gap-1 px-3 py-1.5 text-sm cursor-pointer border-b border-gray-50 hover:bg-gray-50 transition-colors ${isSelected ? 'bg-blue-50 hover:bg-blue-50' : ''}`}
      style={{ paddingLeft: `${12 + depth * 20}px` }}
      onClick={() => onSelect(task)}
    >
      {/* Expand/collapse toggle */}
      <button
        onClick={e => { e.stopPropagation(); onToggle() }}
        className={`flex-shrink-0 w-4 h-4 flex items-center justify-center rounded text-gray-400 hover:text-gray-600 ${!hasChildren ? 'invisible' : ''}`}
      >
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d={expanded ? 'M19 9l-7 7-7-7' : 'M9 5l7 7-7 7'} />
        </svg>
      </button>

      {/* Status dot */}
      <span
        className="flex-shrink-0 h-2 w-2 rounded-full"
        style={{ backgroundColor: TASK_STATUS_COLORS[task.status] }}
        title={task.status}
      />

      {/* Priority */}
      <TaskPriorityBadge priority={task.priority} />

      {/* Title */}
      <span className={`flex-1 truncate ${task.status === 'done' ? 'line-through text-gray-400' : 'text-gray-900'}`}>
        {task.title}
      </span>

      {/* Assignee */}
      {task.assigneeName && (
        <span className="flex-shrink-0 text-xs text-gray-400 hidden sm:block truncate max-w-24">{task.assigneeName}</span>
      )}

      {/* Due date */}
      {task.dueDate && (
        <span className={`flex-shrink-0 text-xs ${isOverdue ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
          {task.dueDate}
        </span>
      )}

      {/* Add child button */}
      {onAddChild && (
        <button
          onClick={e => { e.stopPropagation(); onAddChild(task.id) }}
          className="flex-shrink-0 opacity-0 group-hover:opacity-100 p-0.5 rounded text-gray-400 hover:text-blue-600"
          title="Добавить подзадачу"
        >
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      )}
    </div>
  )
}

function TaskTreeInner({
  items,
  depth,
  onSelect,
  onAddChild,
  selectedId,
  expanded,
  onToggle,
}: {
  items: TaskNode[]
  depth: number
  onSelect: (t: Task) => void
  onAddChild?: (parentId: string) => void
  selectedId?: string | null
  expanded: Record<string, boolean>
  onToggle: (id: string) => void
}) {
  return (
    <>
      {items.map(task => (
        <div key={task.id}>
          <TaskRow
            task={task}
            depth={depth}
            onSelect={onSelect}
            onAddChild={onAddChild}
            selectedId={selectedId}
            expanded={!!expanded[task.id]}
            onToggle={() => onToggle(task.id)}
          />
          {task.children.length > 0 && expanded[task.id] && (
            <TaskTreeInner
              items={task.children}
              depth={depth + 1}
              onSelect={onSelect}
              onAddChild={onAddChild}
              selectedId={selectedId}
              expanded={expanded}
              onToggle={onToggle}
            />
          )}
        </div>
      ))}
    </>
  )
}

export function TaskTree({ items, onSelect, onAddChild, selectedId }: TaskTreeProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    // Expand all by default
    const map: Record<string, boolean> = {}
    const expandAll = (nodes: TaskNode[]) => {
      nodes.forEach(n => { map[n.id] = true; expandAll(n.children) })
    }
    expandAll(items)
    return map
  })

  const toggle = (id: string) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }))

  if (!items.length) {
    return (
      <div className="py-12 text-center text-sm text-gray-400">
        Задач нет. Нажмите «+ Задача» чтобы создать первую.
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      {/* Header */}
      <div className="grid text-xs font-medium text-gray-400 uppercase tracking-wide border-b border-gray-100 px-3 py-2 bg-gray-50"
        style={{ paddingLeft: '52px', display: 'flex', gap: '4px' }}>
        <span className="flex-1">Название</span>
        <span className="flex-shrink-0 w-24 hidden sm:block">Исполнитель</span>
        <span className="flex-shrink-0 w-20">Срок</span>
        <span className="flex-shrink-0 w-6" />
      </div>
      <TaskTreeInner
        items={items}
        depth={0}
        onSelect={onSelect}
        onAddChild={onAddChild}
        selectedId={selectedId}
        expanded={expanded}
        onToggle={toggle}
      />
    </div>
  )
}
