import { api } from './client'
import type {
  TimelineResponse, QueueTask, TaskDependency,
  WorkSchedule, WorkSchedulePreset, NonWorkingDay, OrgTaskType, ImportResult,
} from '@/types/resource'

export const resourcesApi = {
  // ── Timeline ────────────────────────────────────────────────────────────────
  getTimeline: (params: {
    from: string
    to: string
    groupBy?: 'user' | 'project'
    projectId?: string
  }) =>
    api.get<TimelineResponse>('/resources/timeline', { params }).then(r => r.data),

  // ── Queue ────────────────────────────────────────────────────────────────────
  getMyQueue: () =>
    api.get<QueueTask[]>('/resources/queue').then(r => r.data),

  getUserQueue: (userId: string) =>
    api.get<QueueTask[]>(`/resources/queue/${userId}`).then(r => r.data),

  reorderMyQueue: (taskIds: string[]) =>
    api.post<{ taskId: string; startDate: string; dueDate: string }[]>(
      '/resources/queue/reorder',
      { taskIds },
    ).then(r => r.data),

  reorderUserQueue: (userId: string, taskIds: string[]) =>
    api.post(`/resources/queue/${userId}/reorder`, { taskIds }).then(r => r.data),

  autoLevel: (params: {
    from: string
    userIds?: string[]
    weights?: { dueDate: number; projectPriority: number; criticalPath: number; freeFloat: number }
  }) =>
    api.post('/resources/auto-level', params).then(r => r.data),

  // ── Dependencies ─────────────────────────────────────────────────────────────
  getDependencies: (taskId: string) =>
    api.get<TaskDependency[]>(`/tasks/${taskId}/dependencies`).then(r => r.data),

  createDependency: (taskId: string, data: {
    predecessorId: string
    type?: string
    lagDays?: number
  }) =>
    api.post(`/tasks/${taskId}/dependencies`, data).then(r => r.data),

  deleteDependency: (depId: string) =>
    api.delete(`/tasks/dependencies/${depId}`).then(r => r.data),

  setConstraint: (taskId: string, data: {
    constraintType: string | null
    constraintDate?: string | null
  }) =>
    api.patch(`/tasks/${taskId}/constraint`, data).then(r => r.data),

  // ── Org Task Types ───────────────────────────────────────────────────────────
  getOrgTaskTypes: () =>
    api.get<OrgTaskType[]>('/org/task-types').then(r => r.data),

  createOrgTaskType: (data: { name: string; color?: string }) =>
    api.post<OrgTaskType>('/org/task-types', data).then(r => r.data),

  updateOrgTaskType: (id: string, data: { name?: string; color?: string }) =>
    api.patch<OrgTaskType>(`/org/task-types/${id}`, data).then(r => r.data),

  deleteOrgTaskType: (id: string) =>
    api.delete(`/org/task-types/${id}`).then(r => r.data),

  // ── Work Schedule ─────────────────────────────────────────────────────────────
  getOrgSchedule: () =>
    api.get<WorkSchedule>('/org/work-schedule').then(r => r.data),

  setOrgSchedule: (data: WorkSchedule) =>
    api.put('/org/work-schedule', data).then(r => r.data),

  getUserSchedule: (userId: string) =>
    api.get<WorkSchedule>(`/users/${userId}/work-schedule`).then(r => r.data),

  setUserSchedule: (userId: string, data: WorkSchedule) =>
    api.put(`/users/${userId}/work-schedule`, data).then(r => r.data),

  resetUserSchedule: (userId: string) =>
    api.delete(`/users/${userId}/work-schedule`).then(r => r.data),

  // ── Work Schedule Presets ─────────────────────────────────────────────────────
  getPresets: () =>
    api.get<WorkSchedulePreset[]>('/org/work-schedule-presets').then(r => r.data),

  createPreset: (data: {
    name: string
    hoursPerDay: number
    hoursPerDayMap?: Record<string, number> | null
    workDays: number[]
    cycleDays?: number | null
    workDaysInCycle?: number | null
  }) =>
    api.post<WorkSchedulePreset>('/org/work-schedule-presets', data).then(r => r.data),

  updatePreset: (id: string, data: {
    name?: string
    hoursPerDay?: number
    hoursPerDayMap?: Record<string, number> | null
    workDays?: number[]
    cycleDays?: number | null
    workDaysInCycle?: number | null
  }) =>
    api.patch<WorkSchedulePreset>(`/org/work-schedule-presets/${id}`, data).then(r => r.data),

  deletePreset: (id: string) =>
    api.delete(`/org/work-schedule-presets/${id}`).then(r => r.data),

  assignUserSchedule: (userId: string, data: {
    presetId?: string | null
    cycleStartDate?: string | null
    name?: string | null
    hoursPerDay?: number
    hoursPerDayMap?: Record<string, number> | null
    workDays?: number[]
  }) =>
    api.put(`/users/${userId}/work-schedule`, data).then(r => r.data),

  // ── Production Calendar ───────────────────────────────────────────────────────
  getCalendar: (year?: number) =>
    api.get<NonWorkingDay[]>('/org/calendar', { params: year ? { year } : {} }).then(r => r.data),

  upsertCalendarDay: (data: { date: string; type: 'holiday' | 'extra_workday'; name?: string }) =>
    api.post<NonWorkingDay>('/org/calendar', data).then(r => r.data),

  deleteCalendarDay: (id: string) =>
    api.delete(`/org/calendar/${id}`).then(r => r.data),

  importCalendarPreset: (country: string, year: number) =>
    api.post<{ imported: number; message: string }>(
      '/org/calendar/import-preset',
      { country, year },
    ).then(r => r.data),

  // ── Import ────────────────────────────────────────────────────────────────────
  importFile: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api.post<ImportResult>('/import', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data)
  },
}
