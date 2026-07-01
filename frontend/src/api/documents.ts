import { api } from './client'
import { Document, DocumentListResponse, DocumentVersion, DocumentTypesGrouped } from '../types/document'

export interface ListDocumentsParams {
  parentType?: string
  parentId?: string
  projectId?: string
  documentTypeId?: string
  search?: string
  page?: number
  limit?: number
}

export const documentsApi = {
  list: async (params?: ListDocumentsParams): Promise<DocumentListResponse> => {
    const r = await api.get('/documents', { params })
    return r.data
  },

  listForProject: async (projectId: string, params?: Omit<ListDocumentsParams, 'projectId'>): Promise<DocumentListResponse> => {
    const r = await api.get(`/projects/${projectId}/documents`, { params })
    return r.data
  },

  listForTask: async (taskId: string): Promise<DocumentListResponse> => {
    const r = await api.get(`/tasks/${taskId}/documents`)
    return r.data
  },

  get: async (id: string): Promise<Document> => {
    const r = await api.get(`/documents/${id}`)
    return r.data
  },

  upload: async (data: {
    file: File
    title: string
    documentTypeId: string
    parentType: string
    parentId: string
    description?: string
    versionComment?: string
  }): Promise<Document> => {
    const form = new FormData()
    form.append('file', data.file)
    form.append('title', data.title)
    form.append('documentTypeId', data.documentTypeId)
    form.append('parentType', data.parentType)
    form.append('parentId', data.parentId)
    if (data.description) form.append('description', data.description)
    if (data.versionComment) form.append('versionComment', data.versionComment)
    const r = await api.post('/documents', form, { headers: { 'Content-Type': 'multipart/form-data' } })
    return r.data
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/documents/${id}`)
  },

  listVersions: async (id: string): Promise<{ items: DocumentVersion[] }> => {
    const r = await api.get(`/documents/${id}/versions`)
    return r.data
  },

  uploadVersion: async (id: string, data: { file: File; comment?: string }): Promise<DocumentVersion> => {
    const form = new FormData()
    form.append('file', data.file)
    if (data.comment) form.append('comment', data.comment)
    const r = await api.post(`/documents/${id}/versions`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
    return r.data
  },

  downloadUrl: (id: string, versionId: string): string => {
    const token = localStorage.getItem('token')
    return `/api/documents/${id}/versions/${versionId}/download?token=${token}`
  },

  listTypes: async (): Promise<{ items: DocumentTypesGrouped[] }> => {
    const r = await api.get('/document-types')
    // API returns a plain array; wrap it so callers get { items: [...] }
    return Array.isArray(r.data) ? { items: r.data } : r.data
  },
}
