export interface ProjectKpi {
  totalTasks: number
  doneTasks: number
  overdueTasks: number
  completionPct: number
  totalEffortHours: number
  membersCount: number
}

export interface Project {
  id: string
  name: string
  description: string | null
  startDate: string | null
  endDate: string | null
  isArchived: boolean
  createdAt: string
  updatedAt: string
  clientId: string | null
  clientName: string | null
  statusId: string | null
  statusName: string | null
  statusColor: string | null
  ownerId: string | null
  ownerName: string | null
  kpi: ProjectKpi
}

export interface ProjectListResponse {
  items: Project[]
  total: number
  page: number
  pages: number
}

export interface AggregateGroup {
  id: string | null
  name: string | null
  color?: string | null
  projectCount: number
  totalTasks: number
  doneTasks: number
  overdueTasks: number
  totalEffortHours: number
}

export interface ProjectAggregates {
  totals: {
    projectCount: number
    totalTasks: number
    doneTasks: number
    overdueTasks: number
    completionPct: number
    totalEffortHours: number
  }
  byOwner: AggregateGroup[]
  byStatus: AggregateGroup[]
  byClient: AggregateGroup[]
}

export interface ProjectMember {
  userId: string
  fullName: string
  email: string
  role: 'owner' | 'admin' | 'member'
  createdAt: string
}

export const PROJECT_COLUMN_LABELS: Record<string, string> = {
  name: 'Название',
  status: 'Статус',
  client: 'Клиент',
  owner: 'Ответственный',
  startDate: 'Начало',
  endDate: 'Дедлайн',
  totalTasks: 'Задач всего',
  doneTasks: 'Выполнено',
  overdueTasks: 'Просрочено',
  completionPct: '% выполнения',
  totalEffortHours: 'Трудоёмкость',
  membersCount: 'Участников',
}

export const ALL_PROJECT_COLUMNS = Object.keys(PROJECT_COLUMN_LABELS)
