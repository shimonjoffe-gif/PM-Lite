import { z } from 'zod'

export const DistributionRuleEnum = z.enum(['uniform', 'front_loaded', 'back_loaded', 's_curve', 'manual'])

export const ManualDistEntrySchema = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  pct: z.number().min(0).max(100),
})

export const UpsertRoleEffortSchema = z.object({
  roleId: z.string().uuid(),
  plannedHours: z.number().min(0),
  distribution: DistributionRuleEnum.default('uniform'),
  manualDistJson: z.array(ManualDistEntrySchema).optional(),
  note: z.string().max(1000).optional(),
})

export const UpsertTimeEntrySchema = z.object({
  taskId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hours: z.number().min(0).max(24),
  note: z.string().max(500).optional(),
})

export const ResourceLoadQuerySchema = z.object({
  projectId: z.string().uuid().optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

export const TimeLogQuerySchema = z.object({
  taskId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})
