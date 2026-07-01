import { api } from './client'
import type {
  Task, TaskListResponse, TaskTreeResponse,
  BoardColumn, Comment, StatusTransition, EffortUnit,
  TaskStatus, TaskPriority,
} from '@/types/task'

export interface ListTasksParams {
  status?: TaskStatus
  priority?: TaskPriority
  assigneeId?: string
  search?: string
  flat?: boolean
  my?: boolean
  overdue?: boolean
  dueDateFrom?: string
  dueDateTo?: string
  sortBy?: 'deadline_asc' | 'deadline_desc' | 'priority_desc'
  page?: number
  pageSize?: number
}

export interface CreateTaskData {
  title: string
  description?: string
  parentId?: string
  assigneeId?: string
  boardColumnId?: string
  status?: TaskStatus
  priority?: TaskPriority
  effortHours?: number
  startDate?: string
  dueDate?: string
  sortOrder?: number
}

export const tasksApi = {
  // ── Project tasks ──────────────────────────────────────────────────────────
  list: async (projectId: string, params?: ListTasksParams): Promise<TaskTreeResponse | TaskListResponse> => {
    const r = await api.get(`/projects/${projectId}/tasks`, { params })
    return r.data
  },

  create: async (projectId: string, data: CreateTaskData): Promise<Task> => {
    const r = await api.post(`/projects/${projectId}/tasks`, data)
    return r.data
  },

  // ── Single task ────────────────────────────────────────────────────────────
  get: async (taskId: string): Promise<Task> => {
    const r = await api.get(`/tasks/${taskId}`)
    return r.data
  },

  update: async (taskId: string, data: Partial<CreateTaskData & { status?: TaskStatus }>): Promise<Task> => {
    const r = await api.patch(`/tasks/${taskId}`, data)
    return r.data
  },

  delete: async (taskId: string): Promise<void> => {
    await api.delete(`/tasks/${taskId}`)
  },

  move: async (taskId: string, parentId: string | null, sortOrder?: number): Promise<Task> => {
    const r = await api.patch(`/tasks/${taskId}/move`, { parentId, sortOrder })
    return r.data
  },

  delegate: async (taskId: string, assigneeId: string): Promise<{ updatedCount: number; taskIds: string[] }> => {
    const r = await api.post(`/tasks/${taskId}/delegate`, { assigneeId })
    return r.data
  },

  // ── My tasks (global) ──────────────────────────────────────────────────────
  myTasks: async (params?: ListTasksParams): Promise<TaskListResponse & { items: Array<Task & { projectName: string | null }> }> => {
    const r = await api.get('/tasks/my', { params })
    return r.data
  },

  // ── Calendar ───────────────────────────────────────────────────────────────
  calendar: async (from: string, to: string, projectId?: string): Promise<{ items: Array<Task & { projectName: string | null }> }> => {
    const r = await api.get('/tasks/calendar', { params: { from, to, projectId } })
    return r.data
  },

  // ── Comments ───────────────────────────────────────────────────────────────
  getComments: async (taskId: string): Promise<{ items: Comment[] }> => {
    const r = await api.get(`/tasks/${taskId}/comments`)
    return r.data
  },

  addComment: async (taskId: string, text: string): Promise<Comment> => {
    const r = await api.post(`/tasks/${taskId}/comments`, { text })
    return r.data
  },

  updateComment: async (taskId: string, commentId: string, text: string): Promise<Comment> => {
    const r = await api.patch(`/tasks/${taskId}/comments/${commentId}`, { text })
    return r.data
  },

  deleteComment: async (taskId: string, commentId: string): Promise<Comment> => {
    const r = await api.delete(`/tasks/${taskId}/comments/${commentId}`)
    return r.data
  },

  // ── Board columns ──────────────────────────────────────────────────────────
  getBoardColumns: async (projectId: string): Promise<{ items: BoardColumn[] }> => {
    const r = await api.get(`/projects/${projectId}/board-columns`)
    return r.data
  },

  createBoardColumn: async (projectId: string, data: { name: string; color?: string; statusMapping?: TaskStatus }): Promise<BoardColumn> => {
    const r = await api.post(`/projects/${projectId}/board-columns`, data)
    return r.data
  },

  updateBoardColumn: async (projectId: string, columnId: string, data: Partial<{ name: string; color: string; statusMapping: TaskStatus | null }>): Promise<BoardColumn> => {
    const r = await api.patch(`/projects/${projectId}/board-columns/${columnId}`, data)
    return r.data
  },

  deleteBoardColumn: async (projectId: string, columnId: string): Promise<void> => {
    await api.delete(`/projects/${projectId}/board-columns/${columnId}`)
  },

  reorderBoardColumns: async (projectId: string, ids: string[]): Promise<void> => {
    await api.post(`/projects/${projectId}/board-columns/reorder`, { ids })
  },

  // ── Effort unit ────────────────────────────────────────────────────────────
  getEffortUnit: async (projectId: string): Promise<{ effortUnit: EffortUnit }> => {
    const r = await api.get(`/projects/${projectId}/effort-unit`)
    return r.data
  },

  // ── Status transitions ─────────────────────────────────────────────────────
  getTransitions: async (): Promise<{ items: StatusTransition[] }> => {
    const r = await api.get('/org/task-transitions')
    return r.data
  },
}
