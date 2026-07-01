import { z } from 'zod'

// Доступные колонки для таблицы проектов
export const PROJECT_COLUMNS = [
  'name',
  'status',
  'client',
  'owner',
  'startDate',
  'endDate',
  'totalTasks',
  'doneTasks',
  'overdueTasks',
  'completionPct',
  'totalEffortHours',
  'membersCount',
] as const

export type ProjectColumnKey = (typeof PROJECT_COLUMNS)[number]

export const ColumnPrefsSchema = z.object({
  tableName: z.string(),
  columns: z.array(z.string()),
})

export const UpdateColumnPrefsSchema = z.object({
  columns: z.array(z.string().min(1)).min(1),
})
