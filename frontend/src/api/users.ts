import { api } from './client'

export interface OrgUser {
  id: string
  email: string
  fullName: string
  isAdmin: boolean
  orgRoleId: string | null
  orgRoleName: string | null
  isActive: boolean
  dailyCapacityHours: number
  emailVerifiedAt: string | null
  createdAt: string
  departmentId: string | null
}

export interface UsersResponse {
  users: OrgUser[]
  org: { id: string; name: string; slug: string; planType: string }
}

export interface Absence {
  id: string
  type: 'vacation' | 'sick' | 'other'
  startDate: string
  endDate: string
  notes: string | null
}

export interface AffectedTask {
  id: string
  title: string
  dueDate: string
  projectName: string
}

export const usersApi = {
  list: () => api.get<UsersResponse>('/users').then(r => r.data),
  activate: (id: string) =>
    api.patch<{ message: string }>(`/users/${id}/activate`).then(r => r.data),
  deactivate: (id: string) =>
    api.delete<{ message: string }>(`/users/${id}`).then(r => r.data),
  changeRole: (id: string, orgRoleId: string | null) =>
    api.patch<{ message: string }>(`/users/${id}/role`, { orgRoleId }).then(r => r.data),
  updateCapacity: (id: string, dailyCapacityHours: number) =>
    api.patch<{ message: string }>(`/users/${id}/capacity`, { dailyCapacityHours }).then(r => r.data),
  getAbsences: (id: string) =>
    api.get<Absence[]>(`/users/${id}/absences`).then(r => r.data),
  addAbsence: (
    id: string,
    data: { type: string; startDate: string; endDate: string; notes?: string },
  ) =>
    api
      .post<{ absence: Absence; affectedTasks: AffectedTask[] }>(`/users/${id}/absences`, data)
      .then(r => r.data),
  deleteAbsence: (userId: string, absenceId: string) =>
    api.delete<{ message: string }>(`/users/${userId}/absences/${absenceId}`).then(r => r.data),
}
