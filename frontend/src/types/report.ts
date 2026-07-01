export type ReportType = 'projects_summary' | 'team_load' | 'tasks_completion' | 'billable_stages'

export interface ReportFilters {
  from?: string
  to?: string
  projectId?: string
  userId?: string
  status?: string
  granularity?: 'day' | 'week' | 'month'
}

export interface ProjectSummaryRow {
  projectId: string
  projectName: string
  ownerName: string | null
  statusName: string | null
  statusColor: string | null
  startDate: string | null
  endDate: string | null
  budget: number | null
  totalTasks: number
  doneTasks: number
  overdueTasks: number
  completionPct: number
  effortHours: number
}

export interface TeamLoadRow {
  userId: string
  fullName: string
  capacityHours: number
  assignedHours: number
  loadPct: number
  taskCount: number
  doneTasks: number
}

export interface TaskCompletionPeriod {
  period: string
  created: number
  done: number
  overdue: number
}

export interface BurndownPoint {
  period: string
  remaining: number
}

export interface TaskCompletionData {
  periods: TaskCompletionPeriod[]
  burndown: BurndownPoint[]
  tasks: {
    id: string
    title: string
    status: string
    priority: string
    taskType: string
    projectName: string | null
    assigneeName: string | null
    dueDate: string | null
  }[]
}

export interface BillableStageRow {
  id: string
  title: string
  status: string
  startDate: string | null
  dueDate: string | null
  effortHours: number | null
  amount: number | null
  projectId: string | null
  projectName: string | null
  assigneeId: string | null
  assigneeName: string | null
}

export interface BillableStagesData {
  stages: BillableStageRow[]
  summary: {
    total: number
    done: number
    totalAmount: number
    totalEffortHours: number
  }
}

export interface SavedReport {
  id: string
  name: string
  reportType: ReportType
  filters: ReportFilters
  createdAt: string
  updatedAt: string
}

export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  projects_summary: 'Сводка по проектам',
  team_load: 'Загрузка команды',
  tasks_completion: 'Выполнение задач',
  billable_stages: 'Актируемые этапы',
}

export const GRANULARITY_LABELS: Record<string, string> = {
  day: 'День',
  week: 'Неделя',
  month: 'Месяц',
}
