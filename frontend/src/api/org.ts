import { api } from './client'

export interface OrgInfo {
  id: string
  name: string
  slug: string
  logoUrl: string | null
  planType: string
}

export interface ProjectStatus {
  id: string
  name: string
  color: string
  sortOrder: number
}

export interface Client {
  id: string
  name: string
  contactInfo: string | null
  notes: string | null
  createdAt: string
}

export const orgApi = {
  getInfo: (): Promise<OrgInfo> =>
    api.get('/org').then(r => r.data),

  updateLogo: (logoDataUrl: string): Promise<OrgInfo> =>
    api.put('/org/logo', { logoDataUrl }).then(r => r.data),

  deleteLogo: (): Promise<void> =>
    api.delete('/org/logo').then(() => undefined),

  listStatuses: (): Promise<ProjectStatus[]> =>
    api.get('/org/project-statuses').then(r => r.data),

  createStatus: (data: { name: string; color: string }): Promise<ProjectStatus> =>
    api.post('/org/project-statuses', data).then(r => r.data),

  updateStatus: (id: string, data: { name?: string; color?: string }): Promise<ProjectStatus> =>
    api.patch(`/org/project-statuses/${id}`, data).then(r => r.data),

  deleteStatus: (id: string): Promise<void> =>
    api.delete(`/org/project-statuses/${id}`).then(() => undefined),

  reorderStatuses: (ids: string[]): Promise<void> =>
    api.put('/org/project-statuses/reorder', { ids }).then(() => undefined),

  listClients: (): Promise<Client[]> =>
    api.get('/org/clients').then(r => r.data),

  createClient: (data: { name: string; contactInfo?: string; notes?: string }): Promise<Client> =>
    api.post('/org/clients', data).then(r => r.data),

  updateClient: (id: string, data: { name?: string; contactInfo?: string | null; notes?: string | null }): Promise<Client> =>
    api.patch(`/org/clients/${id}`, data).then(r => r.data),

  deleteClient: (id: string): Promise<void> =>
    api.delete(`/org/clients/${id}`).then(() => undefined),
}
