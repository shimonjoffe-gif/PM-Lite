export interface DayLoad {
  date: string
  capacityHours: number
  assignedHours: number
  taskCount: number
  loadPct: number
  isOverloaded: boolean
  isParallelOverloaded: boolean
}

export interface TaskSlot {
  taskId: string
  taskTitle: string
  projectId: string
  projectName: string
  startDate: string | null
  dueDate: string | null
  effortHours: number | null
  status: string
}

export interface UserTimelineRow {
  userId: string
  fullName: string
  capacity: number
  days: DayLoad[]
  tasks?: TaskSlot[]
}

export interface ProjectTimelineRow {
  projectId: string
  projectName: string
  days: DayLoad[]
  members?: UserTimelineRow[]
}

export interface TimelineResponse {
  groupBy: 'user' | 'project'
  rows: UserTimelineRow[] | ProjectTimelineRow[]
}

export interface QueueTask {
  id: string
  title: string
  projectId: string
  projectName: string | null
  projectPriority: number
  status: string
  priority: string
  taskType: string
  effortHours: number | null
  startDate: string | null
  dueDate: string | null
  queueOrder: number | null
  constraintType: string | null
  constraintDate: string | null
}

export interface TaskDependency {
  id: string
  predecessorId: string
  predecessorTitle: string
  type: 'FS' | 'SS' | 'FF' | 'SF'
  lagDays: number
}

export interface WorkSchedule {
  scheduleType: 'five_two' | 'two_two' | 'six_one' | 'custom'
  hoursPerDay: number
  workDays: number[]
  shiftStart: string
  shiftEnd: string
}

export interface WorkSchedulePreset {
  id: string
  name: string
  scheduleType: 'five_two' | 'two_two' | 'six_one' | 'custom'
  hoursPerDay: number
  hoursPerDayMap: Record<string, number> | null
  workDays: number[]
  cycleDays: number | null
  workDaysInCycle: number | null
  isSystem: boolean
  organizationId: string | null
}

export interface NonWorkingDay {
  id: string
  date: string
  type: 'holiday' | 'extra_workday'
  name: string | null
}

export interface OrgTaskType {
  id: string
  organizationId: string
  name: string
  color: string
  isSystem: boolean
  createdAt: string
}

export interface ImportResult {
  projectsCreated: number
  tasksCreated: number
  dependenciesCreated: number
  warnings: string[]
}

export const WORK_SCHEDULE_LABELS: Record<string, string> = {
  five_two: '5/2 (Пн–Пт)',
  two_two: '2/2',
  six_one: '6/1',
  custom: 'Произвольный',
}

export const DAY_LABELS = ['', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

export const DEPENDENCY_TYPE_LABELS: Record<string, string> = {
  FS: 'FS (Финиш–Старт)',
  SS: 'SS (Старт–Старт)',
  FF: 'FF (Финиш–Финиш)',
  SF: 'SF (Старт–Финиш)',
}
