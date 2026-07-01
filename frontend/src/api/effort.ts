import { api } from './client'
import type { TaskRoleEffort, TimeEntry, ResourceLoadResult, DistributionRule, ManualDistEntry } from '@/types/effort'

export const effortApi = {
  // Role effort plan
  getTaskEffort: async (taskId: string): Promise<TaskRoleEffort[]> => {
    const r = await api.get(`/effort/task/${taskId}`)
    return r.data
  },
  upsertRoleEffort: async (
    taskId: string,
    data: {
      roleId: string
      plannedHours: number
      distribution: DistributionRule
      manualDistJson?: ManualDistEntry[]
      note?: string
    },
  ): Promise<TaskRoleEffort> => {
    const r = await api.put(`/effort/task/${taskId}/role`, data)
    return r.data
  },
  deleteRoleEffort: async (roleEffortId: string): Promise<void> => {
    await api.delete(`/effort/role/${roleEffortId}`)
  },

  // Time entries
  getTimeEntries: async (params: {
    taskId?: string
    userId?: string
    from?: string
    to?: string
  }): Promise<TimeEntry[]> => {
    const r = await api.get('/effort/time-entries', { params })
    return r.data
  },
  upsertTimeEntry: async (data: {
    taskId: string
    date: string
    hours: number
    note?: string
  }): Promise<TimeEntry | null> => {
    const r = await api.put('/effort/time-entries', data)
    return r.data
  },
  deleteTimeEntry: async (id: string): Promise<void> => {
    await api.delete(`/effort/time-entries/${id}`)
  },

  // Resource load
  getResourceLoad: async (params: {
    projectId?: string
    from: string
    to: string
  }): Promise<ResourceLoadResult> => {
    const r = await api.get('/effort/resource-load', { params })
    return r.data
  },
}
