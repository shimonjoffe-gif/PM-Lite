import { z } from 'zod'

export const StatsQuerySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
})

export const UserStatSchema = z.object({
  userId: z.string().uuid(),
  fullName: z.string(),
  email: z.string(),
  projectsCreated: z.number(),
  tasksCreated: z.number(),
  aiCalls: z.number(),
})

export const StatsResponseSchema = z.object({
  period: z.object({ from: z.string(), to: z.string() }),
  totals: z.object({
    projectsCreated: z.number(),
    tasksCreated: z.number(),
    aiCalls: z.number(),
  }),
  byUser: z.array(UserStatSchema),
})

export const CreateFeedbackSchema = z.object({
  type: z.enum(['bug', 'feedback']),
  text: z.string().min(1).max(2000),
  screenContext: z.string().max(500).optional(),
})

export const FeedbackResponseSchema = z.object({
  id: z.string().uuid(),
  message: z.string(),
})
