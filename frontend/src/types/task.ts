export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done' | 'cancelled'
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical'
export type EffortUnit = 'hours' | 'days' | 'weeks'

export interface Task {
  id: string
  projectId: string
  parentId: string | null
  parentTitle: string | null
  boardColumnId: string | null
  assigneeId: string | null
  assigneeName: string | null
  createdBy: string | null
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  effortHours: number | null
  duration: number | null
  percentComplete: number
  taskType: string
  constraintType: string | null
  startDate: string | null
  dueDate: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
  childCount: number
}

export interface TaskNode extends Task {
  children: TaskNode[]
}

export interface TaskWithProject extends Task {
  projectName: string | null
}

export interface TaskListResponse {
  items: Task[]
  total: number
  page: number
  pages: number
}

export interface TaskTreeResponse {
  tree: boolean
  items: TaskNode[] | Task[]
}

export interface BoardColumn {
  id: string
  projectId: string
  name: string
  color: string | null
  sortOrder: number
  statusMapping: TaskStatus | null
}

export interface Comment {
  id: string
  taskId: string
  userId: string
  userName: string
  text: string
  createdAt: string
  updatedAt: string | null
  deletedAt: string | null
}

export interface StatusTransition {
  id: string
  fromStatus: TaskStatus
  toStatus: TaskStatus
  allowedOrgRoleIds: string[]
}

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'К выполнению',
  in_progress: 'В работе',
  review: 'На проверке',
  done: 'Выполнено',
  cancelled: 'Отменено',
}

export const TASK_STATUS_COLORS: Record<TaskStatus, string> = {
  todo: '#6B7280',
  in_progress: '#3B82F6',
  review: '#F59E0B',
  done: '#10B981',
  cancelled: '#EF4444',
}

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Низкий',
  medium: 'Средний',
  high: 'Высокий',
  critical: 'Критический',
}

export const TASK_PRIORITY_COLORS: Record<TaskPriority, string> = {
  low: '#6B7280',
  medium: '#3B82F6',
  high: '#F59E0B',
  critical: '#EF4444',
}

export const ALL_TASK_STATUSES: TaskStatus[] = ['todo', 'in_progress', 'review', 'done', 'cancelled']
