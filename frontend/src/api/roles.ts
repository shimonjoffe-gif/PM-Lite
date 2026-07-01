import { api } from './client'

export interface OrgRole {
  id: string
  name: string
  description: string | null
  isSystem: boolean
  permissions: string[]
  userCount: number
}

export interface PermissionGroup {
  key: string
  label: string
  permissions: string[]
}

export interface RolesMeta {
  groups: PermissionGroup[]
  labels: Record<string, string>
}

export const rolesApi = {
  list: () => api.get<OrgRole[]>('/roles').then(r => r.data),
  meta: () => api.get<RolesMeta>('/roles/meta').then(r => r.data),
  create: (data: { name: string; description?: string; permissions: string[] }) =>
    api.post<OrgRole>('/roles', data).then(r => r.data),
  update: (id: string, data: { name?: string; description?: string; permissions?: string[] }) =>
    api.patch<OrgRole>(`/roles/${id}`, data).then(r => r.data),
  delete: (id: string) =>
    api.delete<{ message: string }>(`/roles/${id}`).then(r => r.data),
}
