import { z } from 'zod'

export const ReportTypeEnum = z.enum([
  'projects_summary',
  'team_load',
  'tasks_completion',
  'billable_stages',
])

export const ReportFiltersSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  projectId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  status: z.string().optional(),
  granularity: z.enum(['day', 'week', 'month']).default('week'),
})

export const SaveReportSchema = z.object({
  name: z.string().min(1).max(100),
  reportType: ReportTypeEnum,
  filters: ReportFiltersSchema,
})

export const ExportQuerySchema = z.object({
  format: z.enum(['xlsx', 'pdf']),
  reportType: ReportTypeEnum,
  from: z.string().optional(),
  to: z.string().optional(),
  projectId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  status: z.string().optional(),
})
