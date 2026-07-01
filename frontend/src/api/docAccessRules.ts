import { api } from './client'
import { AccessRule } from '../types/document'

export interface UpsertRule {
  documentTypeId: string | null
  orgRoleId: string
  canView: boolean
  canUpload: boolean
}

export const docAccessRulesApi = {
  getOrg: async (): Promise<AccessRule[]> => {
    const r = await api.get('/org/doc-access-rules')
    return r.data
  },

  putOrg: async (rules: UpsertRule[]): Promise<AccessRule[]> => {
    const r = await api.put('/org/doc-access-rules', { rules })
    return r.data
  },

  getProject: async (projectId: string): Promise<AccessRule[]> => {
    const r = await api.get(`/projects/${projectId}/doc-access-rules`)
    return r.data
  },

  putProject: async (projectId: string, rules: UpsertRule[]): Promise<AccessRule[]> => {
    const r = await api.put(`/projects/${projectId}/doc-access-rules`, { rules })
    return r.data
  },
}
