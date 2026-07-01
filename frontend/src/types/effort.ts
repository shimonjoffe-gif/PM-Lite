export type DistributionRule = 'uniform' | 'front_loaded' | 'back_loaded' | 's_curve' | 'manual'

export const DISTRIBUTION_LABELS: Record<DistributionRule, string> = {
  uniform: 'Равномерно',
  front_loaded: 'Убывающее',
  back_loaded: 'Возрастающее',
  s_curve: 'S-кривая',
  manual: 'Вручную',
}

export interface ManualDistEntry {
  weekStart: string
  pct: number
}

export interface TaskEffortPeriod {
  id: string
  weekStart: string
  plannedHours: number
  roleId: string
}

export interface TaskRoleEffort {
  id: string
  taskId: string
  roleId: string
  plannedHours: number
  distribution: DistributionRule
  manualDistJson: ManualDistEntry[] | null
  note: string | null
  role: { id: string; name: string }
  periods: TaskEffortPeriod[]
}

export interface TimeEntry {
  id: string
  taskId: string
  userId: string
  date: string
  hours: number
  note: string | null
  user?: { id: string; fullName: string; orgRoleId: string | null }
  task?: { id: string; title: string; projectId: string }
}

// Resource load view types
export interface WeekPlanActual {
  weekStart: string
  plannedHours: number
  actualHours: number
}

export interface WeekActualCapacity {
  weekStart: string
  actualHours: number
  capacityHours: number
  overloaded: boolean
}

export interface RoleLoadRow {
  roleId: string
  roleName: string
  weeks: WeekPlanActual[]
  totalPlanned: number
  totalActual: number
}

export interface UserLoadRow {
  userId: string
  fullName: string
  roleId: string | null
  roleName: string | null
  dailyCapacityHours: number
  weeks: WeekActualCapacity[]
  totalActual: number
}

export interface ResourceLoadResult {
  weeks: string[]
  byRole: RoleLoadRow[]
  byUser: UserLoadRow[]
}
