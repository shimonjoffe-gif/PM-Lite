export type PromptKey = 'project_status' | 'task_summary' | 'task_suggest'

export interface AiCase {
  promptKey: PromptKey
  label: string
  description: string
  isEnabled: boolean
  dailyCallLimit: number | null
  monthlyTokenLimit: number | null
}

export interface AiPromptInfo {
  promptKey: PromptKey
  label: string
  isCustom: boolean
  promptText: string
  variables: string[]
}

export interface TaskSuggestion {
  description: string
  dueDate: string | null
  priority: 'low' | 'medium' | 'high' | 'critical'
  subtasks: string[]
}

export interface UsageByUser {
  userId: string
  fullName: string
  calls: number
  tokens: number
}

export interface UsageByKey {
  promptKey: string
  calls: number
  tokens: number
}

export interface AiUsageLog {
  totalCalls: number
  totalTokens: number
  byUser: UsageByUser[]
  byKey: UsageByKey[]
  recent: {
    id: string
    promptKey: string
    userName: string
    tokensUsed: number | null
    createdAt: string
  }[]
}

export const PROMPT_KEY_LABELS: Record<PromptKey, string> = {
  project_status: 'Статус проекта',
  task_summary: 'Резюме задачи',
  task_suggest: 'Авто-заполнение',
}

// Panel context — what to show in the AI panel
export type AiPanelMode =
  | { type: 'idle' }
  | { type: 'project_status'; projectId: string; projectName: string }
  | { type: 'task_summary'; taskId: string; taskTitle: string }
