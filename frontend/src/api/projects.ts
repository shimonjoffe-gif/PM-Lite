import { api } from './client'
import type { Project, ProjectListResponse, ProjectAggregates, ProjectMember } from '../types/project'

export interface ListProjectsParams {
  status?: string
  owner?: string
  client?: string
  search?: string
  archived?: boolean
  page?: number
}

export const projectsApi = {
  list: async (params: ListProjectsParams = {}): Promise<ProjectListResponse> => {
    const res = await api.get('/projects', {
      params: {
        ...params,
        archived: params.archived ? 'true' : 'false',
        page: params.page ?? 1,
      },
    })
    return res.data
  },

  aggregates: async (params: Omit<ListProjectsParams, 'page'> = {}): Promise<ProjectAggregates> => {
    const res = await api.get('/projects/aggregates', {
      params: { ...params, archived: params.archived ? 'true' : 'false' },
    })
    return res.data
  },

  get: async (id: string): Promise<Project & { members: ProjectMember[] }> => {
    const res = await api.get(`/projects/${id}`)
    return res.data
  },

  create: async (data: {
    name: string
    description?: string
    startDate?: string
    endDate?: string
    clientId?: string
    newClientName?: string
    statusId?: string
    ownerId?: string
  }): Promise<Project> => {
    const res = await api.post('/projects', data)
    return res.data
  },

  update: async (id: string, data: {
    name?: string
    description?: string | null
    startDate?: string | null
    endDate?: string | null
    clientId?: string | null
    newClientName?: string
    statusId?: string | null
    ownerId?: string | null
  }): Promise<Project> => {
    const res = await api.patch(`/projects/${id}`, data)
    return res.data
  },

  archive: async (id: string): Promise<void> => {
    await api.post(`/projects/${id}/archive`)
  },

  unarchive: async (id: string): Promise<void> => {
    await api.post(`/projects/${id}/unarchive`)
  },

  delegate: async (id: string, newOwnerId: string): Promise<void> => {
    await api.post(`/projects/${id}/delegate`, { newOwnerId })
  },

  listMembers: async (id: string): Promise<ProjectMember[]> => {
    const res = await api.get(`/projects/${id}/members`)
    return res.data
  },

  addMember: async (id: string, userId: string, role: 'admin' | 'member'): Promise<ProjectMember> => {
    const res = await api.post(`/projects/${id}/members`, { userId, role })
    return res.data
  },

  updateMember: async (id: string, userId: string, role: 'admin' | 'member'): Promise<ProjectMember> => {
    const res = await api.patch(`/projects/${id}/members/${userId}`, { role })
    return res.data
  },

  removeMember: async (id: string, userId: string): Promise<void> => {
    await api.delete(`/projects/${id}/members/${userId}`)
  },
}
