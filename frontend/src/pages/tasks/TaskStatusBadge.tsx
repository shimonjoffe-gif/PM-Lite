import { TaskStatus, TaskPriority, TASK_STATUS_LABELS, TASK_STATUS_COLORS, TASK_PRIORITY_LABELS, TASK_PRIORITY_COLORS } from '@/types/task'

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-white whitespace-nowrap"
      style={{ backgroundColor: TASK_STATUS_COLORS[status] }}
    >
      {TASK_STATUS_LABELS[status]}
    </span>
  )
}

export function TaskPriorityBadge({ priority }: { priority: TaskPriority }) {
  const icons: Record<TaskPriority, string> = {
    low: '↓',
    medium: '→',
    high: '↑',
    critical: '⚡',
  }
  return (
    <span
      className="inline-flex items-center gap-0.5 text-xs font-medium"
      style={{ color: TASK_PRIORITY_COLORS[priority] }}
      title={TASK_PRIORITY_LABELS[priority]}
    >
      {icons[priority]}
    </span>
  )
}
