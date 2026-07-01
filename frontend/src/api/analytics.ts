import { api } from './client'

export interface UserStat {
  userId: string
  fullName: string
  email: string
  projectsCreated: number
  tasksCreated: number
  aiCalls: number
}

export interface StatsResponse {
  period: { from: string; to: string }
  totals: { projectsCreated: number; tasksCreated: number; aiCalls: number }
  byUser: UserStat[]
}

export async function fetchStats(from?: string, to?: string): Promise<StatsResponse> {
  const params: Record<string, string> = {}
  if (from) params.from = from
  if (to) params.to = to
  const { data } = await api.get<StatsResponse>('/analytics/stats', { params })
  return data
}

export async function submitFeedback(payload: {
  type: 'bug' | 'feedback'
  text: string
  screenContext?: string
}): Promise<{ id: string; message: string }> {
  const { data } = await api.post<{ id: string; message: string }>('/analytics/feedback', payload)
  return data
}
