import { api } from './client'

export interface AbsenceType {
  id: string
  organizationId: string | null
  code: string | null
  name: string
  color: string
  isSystem: boolean
  approvalSteps: ApprovalStep[]
}

export interface ApprovalStep {
  order: number
  role: 'pm' | 'line_manager' | 'admin'
  action: 'approve' | 'notify'
}

export interface Department {
  id: string
  organizationId: string
  name: string
  parentId: string | null
  headUserId: string | null
  headUser: { id: string; fullName: string } | null
  _count: { members: number }
}

export interface AbsenceRequest {
  id: string
  userId: string
  typeId: string
  startDate: string
  endDate: string
  notes: string | null
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  currentStep: number
  createdAt: string
  user: { id: string; fullName: string }
  type: AbsenceType
  steps: AbsenceRequestStep[]
  absence: { id: string } | null
  pendingStepId?: string
}

export interface AbsenceRequestStep {
  id: string
  requestId: string
  stepOrder: number
  approverId: string | null
  role: string
  action: string
  status: string
  comment: string | null
  decidedAt: string | null
  approver: { id: string; fullName: string } | null
}

export const absencesApi = {
  // Absence Types
  getTypes: () => api.get<AbsenceType[]>('/org/absence-types').then(r => r.data),
  createType: (data: { name: string; color?: string; approvalSteps?: ApprovalStep[] }) =>
    api.post<AbsenceType>('/org/absence-types', data).then(r => r.data),
  updateType: (id: string, data: { name?: string; color?: string }) =>
    api.patch<AbsenceType>(`/org/absence-types/${id}`, data).then(r => r.data),
  updateTypeSteps: (id: string, steps: ApprovalStep[]) =>
    api.put<AbsenceType>(`/org/absence-types/${id}/steps`, { steps }).then(r => r.data),
  deleteType: (id: string) =>
    api.delete(`/org/absence-types/${id}`).then(r => r.data),

  // Departments
  getDepartments: () => api.get<Department[]>('/org/departments').then(r => r.data),
  createDepartment: (data: { name: string; parentId?: string | null; headUserId?: string | null }) =>
    api.post<Department>('/org/departments', data).then(r => r.data),
  updateDepartment: (id: string, data: { name?: string; parentId?: string | null; headUserId?: string | null }) =>
    api.patch<Department>(`/org/departments/${id}`, data).then(r => r.data),
  deleteDepartment: (id: string) =>
    api.delete(`/org/departments/${id}`).then(r => r.data),
  assignUserDepartment: (userId: string, departmentId: string | null) =>
    api.patch(`/users/${userId}/department`, { departmentId }).then(r => r.data),

  // Absence Requests
  getRequests: (params?: { status?: string; userId?: string; asApprover?: boolean }) =>
    api.get<AbsenceRequest[]>('/absence-requests', { params }).then(r => r.data),
  createRequest: (data: { userId: string; typeId: string; startDate: string; endDate: string; notes?: string }) =>
    api.post<AbsenceRequest & { warnings?: string[] }>('/absence-requests', data).then(r => r.data),
  updateRequest: (id: string, data: { typeId?: string; startDate?: string; endDate?: string; notes?: string | null }) =>
    api.patch<AbsenceRequest>(`/absence-requests/${id}`, data).then(r => r.data),
  checkConflicts: (userId: string, startDate: string, endDate: string, approverId?: string, approverRole?: string) =>
    api.get<{ tasks: { id: string; title: string; startDate: string | null; dueDate: string | null; project: { id: string; name: string; owner?: { id: string; fullName: string } | null } | null }[] }>(
      '/absence-requests/conflicts', { params: { userId, startDate, endDate, approverId, approverRole } }
    ).then(r => r.data),
  decideStep: (requestId: string, stepId: string, decision: 'approved' | 'rejected', comment?: string) =>
    api.post(`/absence-requests/${requestId}/steps/${stepId}/decide`, { decision, comment }).then(r => r.data),
  cancelRequest: (id: string) =>
    api.post(`/absence-requests/${id}/cancel`).then(r => r.data),
}
