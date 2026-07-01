import { api } from './client'
import type {
  ProjectSummaryRow, TeamLoadRow, TaskCompletionData,
  BillableStagesData, SavedReport, ReportType, ReportFilters,
} from '@/types/report'

function qs(filters: ReportFilters): Record<string, string> {
  const p: Record<string, string> = {}
  if (filters.from) p.from = filters.from
  if (filters.to) p.to = filters.to
  if (filters.projectId) p.projectId = filters.projectId
  if (filters.userId) p.userId = filters.userId
  if (filters.status) p.status = filters.status
  if (filters.granularity) p.granularity = filters.granularity
  return p
}

export const reportsApi = {
  getProjectsSummary: (filters: ReportFilters = {}) =>
    api.get<ProjectSummaryRow[]>('/reports/projects-summary', { params: qs(filters) }).then(r => r.data),

  getTeamLoad: (filters: ReportFilters = {}) =>
    api.get<TeamLoadRow[]>('/reports/team-load', { params: qs(filters) }).then(r => r.data),

  getTasksCompletion: (filters: ReportFilters = {}) =>
    api.get<TaskCompletionData>('/reports/tasks-completion', { params: qs(filters) }).then(r => r.data),

  getProjectTasksCompletion: (projectId: string, filters: ReportFilters = {}) =>
    api.get<TaskCompletionData>(`/projects/${projectId}/reports/tasks-completion`, { params: qs(filters) }).then(r => r.data),

  getBillableStages: (filters: ReportFilters = {}) =>
    api.get<BillableStagesData>('/reports/billable-stages', { params: qs(filters) }).then(r => r.data),

  getProjectBillableStages: (projectId: string, filters: ReportFilters = {}) =>
    api.get<BillableStagesData>(`/projects/${projectId}/reports/billable-stages`, { params: qs(filters) }).then(r => r.data),

  exportReport: (reportType: ReportType, format: 'xlsx' | 'pdf', filters: ReportFilters = {}) => {
    const url = `/api/reports/export?format=${format}&reportType=${reportType}${
      Object.entries(qs(filters)).map(([k, v]) => `&${k}=${v}`).join('')
    }`
    window.open(url, '_blank')
  },

  getSavedReports: () =>
    api.get<SavedReport[]>('/reports/saved').then(r => r.data),

  saveReport: (name: string, reportType: ReportType, filters: ReportFilters) =>
    api.post<SavedReport>('/reports/saved', { name, reportType, filters }).then(r => r.data),

  deleteSavedReport: (id: string) =>
    api.delete(`/reports/saved/${id}`).then(r => r.data),
}
