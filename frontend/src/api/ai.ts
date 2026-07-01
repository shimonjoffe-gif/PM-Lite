import { api } from './client'
import type { AiCase, AiPromptInfo, AiUsageLog, TaskSuggestion } from '@/types/ai'
export type { AiPromptInfo }

export const aiApi = {
  generateProjectStatus: async (projectId: string): Promise<string> => {
    const r = await api.post(`/ai/generate/project-status/${projectId}`)
    return r.data.text
  },
  generateTaskSummary: async (taskId: string): Promise<string> => {
    const r = await api.post(`/ai/generate/task-summary/${taskId}`)
    return r.data.text
  },
  suggestTaskFields: async (name: string, projectId: string): Promise<TaskSuggestion> => {
    const r = await api.post('/ai/generate/task-suggest', { name, projectId })
    return r.data
  },
  getPlanInfo: async () => { const r = await api.get('/ai/plan'); return r.data },
  listCases: async (): Promise<AiCase[]> => { const r = await api.get('/ai/cases'); return r.data },
  toggleCase: async (key: string, isEnabled: boolean) => { await api.put(`/ai/cases/${key}`, { isEnabled }) },
  updateLimits: async (key: string, dailyCallLimit: number | null, monthlyTokenLimit: number | null) => {
    await api.put(`/ai/cases/${key}/limits`, { dailyCallLimit, monthlyTokenLimit })
  },
  listPrompts: async (): Promise<AiPromptInfo[]> => { const r = await api.get('/ai/prompts'); return r.data },
  updatePrompt: async (key: string, promptText: string) => { await api.put(`/ai/prompts/${key}`, { promptText }) },
  resetPrompt: async (key: string) => { await api.delete(`/ai/prompts/${key}`) },
  getUsageLog: async (days = 30): Promise<AiUsageLog> => { const r = await api.get('/ai/usage-log', { params: { days } }); return r.data },
}
