import { api } from './client'
import type {
  NormParam,
  ProjectTemplate,
  TemplateTask,
  TemplateDependency,
  TemplateDocument,
  TemplatePhase,
  ProjectTopTask,
  TemplateStats,
  FormulaJson,
  AssemblePiece,
} from '@/types/templates'

export const normParamsApi = {
  list: async (): Promise<NormParam[]> => {
    const r = await api.get('/templates/norm-params')
    return r.data
  },
  create: async (data: {
    code: string
    name: string
    paramType: 'numeric' | 'boolean' | 'enum'
    unit?: string
    possibleValues?: string[]
    description?: string
  }): Promise<NormParam> => {
    const r = await api.post('/templates/norm-params', data)
    return r.data
  },
  update: async (id: string, data: Partial<Omit<NormParam, 'id' | 'code' | 'createdAt' | 'organizationId'>>): Promise<NormParam> => {
    const r = await api.put(`/templates/norm-params/${id}`, data)
    return r.data
  },
  delete: async (id: string): Promise<void> => {
    await api.delete(`/templates/norm-params/${id}`)
  },
}

export const templatesApi = {
  list: async (): Promise<ProjectTemplate[]> => {
    const r = await api.get('/templates')
    return r.data
  },
  get: async (id: string): Promise<ProjectTemplate> => {
    const r = await api.get(`/templates/${id}`)
    return r.data
  },
  create: async (data: { name: string; description?: string; category?: string }): Promise<ProjectTemplate> => {
    const r = await api.post('/templates', data)
    return r.data
  },
  update: async (id: string, data: {
    name?: string
    description?: string
    category?: string
    isPublished?: boolean
  }): Promise<ProjectTemplate> => {
    const r = await api.put(`/templates/${id}`, data)
    return r.data
  },
  delete: async (id: string): Promise<void> => {
    await api.delete(`/templates/${id}`)
  },
  getPhases: async (id: string): Promise<TemplatePhase[]> => {
    const r = await api.get(`/templates/${id}/phases`)
    return r.data
  },
  getStats: async (id: string): Promise<TemplateStats> => {
    const r = await api.get(`/templates/${id}/stats`)
    return r.data
  },
  getActualizationSuggestions: async (id: string) => {
    const r = await api.get(`/templates/${id}/actualization-suggestions`)
    return r.data
  },
  actualize: async (id: string, updates: { templateTaskId: string; newBaseDuration: number }[]) => {
    const r = await api.post(`/templates/${id}/actualize`, { templateTaskUpdates: updates })
    return r.data
  },
  // Task CRUD
  createTask: async (templateId: string, data: {
    title: string
    parentId?: string
    phase?: string
    roleName?: string
    taskType?: string
    priority?: string
    baseDuration?: number
    effortHours?: number
    formulaJson?: FormulaJson
    sortOrder?: number
    description?: string
  }): Promise<TemplateTask> => {
    const r = await api.post(`/templates/${templateId}/tasks`, data)
    return r.data
  },
  updateTask: async (taskId: string, data: Partial<{
    title: string
    parentId: string | null
    phase: string
    roleName: string
    taskType: string
    priority: string
    baseDuration: number
    effortHours: number
    formulaJson: FormulaJson | null
    sortOrder: number
    description: string
  }>): Promise<TemplateTask> => {
    const r = await api.put(`/templates/tasks/${taskId}`, data)
    return r.data
  },
  deleteTask: async (taskId: string): Promise<void> => {
    await api.delete(`/templates/tasks/${taskId}`)
  },
  // Dependencies
  createDependency: async (taskId: string, data: {
    predecessorId: string
    type?: 'FS' | 'SS' | 'FF' | 'SF'
    lagDays?: number
  }): Promise<TemplateDependency> => {
    const r = await api.post(`/templates/tasks/${taskId}/dependencies`, data)
    return r.data
  },
  deleteDependency: async (depId: string): Promise<void> => {
    await api.delete(`/templates/dependencies/${depId}`)
  },
  // Documents
  createDocument: async (templateId: string, data: {
    name: string
    taskId?: string
    description?: string
    isRequired?: boolean
    sortOrder?: number
  }): Promise<TemplateDocument> => {
    const r = await api.post(`/templates/${templateId}/documents`, data)
    return r.data
  },
  deleteDocument: async (docId: string): Promise<void> => {
    await api.delete(`/templates/documents/${docId}`)
  },
  // Create project from template
  createProject: async (data: {
    templateId: string
    projectName: string
    projectDescription?: string
    startDate?: string
    scalingParams?: Record<string, number | string | boolean>
  }) => {
    const r = await api.post('/templates/create-project', data)
    return r.data
  },
  // Assemble from pieces
  assembleProject: async (data: {
    projectName: string
    projectDescription?: string
    startDate?: string
    pieces: AssemblePiece[]
    scalingParams?: Record<string, number | string | boolean>
  }) => {
    const r = await api.post('/templates/assemble-project', data)
    return r.data
  },
  // Collect required norm params for given templates
  collectParams: async (templateIds: string[]): Promise<NormParam[]> => {
    const r = await api.post('/templates/collect-params', { templateIds })
    return r.data
  },
  // Get top-level tasks from a project (for analog planning)
  getProjectPhases: async (projectId: string): Promise<ProjectTopTask[]> => {
    const r = await api.get(`/templates/project-phases/${projectId}`)
    return r.data
  },
}
