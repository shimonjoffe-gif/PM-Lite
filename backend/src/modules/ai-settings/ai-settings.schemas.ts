import { z } from 'zod'

export const PlanInfoSchema = z.object({
  planType: z.enum(['free', 'paid']),
  limits: z.object({
    dailyCallsLimit: z.number().nullable(),
  }),
  usage: z.object({
    callsToday: z.number(),
    callsThisMonth: z.number(),
  }),
})

export const AiCaseSchema = z.object({
  promptKey: z.string(),
  label: z.string(),
  description: z.string(),
  isEnabled: z.boolean(),
  dailyCallLimit: z.number().nullable().optional(),
  monthlyTokenLimit: z.number().nullable().optional(),
})

export const UpdateLimitsSchema = z.object({
  dailyCallLimit: z.number().int().positive().nullable(),
  monthlyTokenLimit: z.number().int().positive().nullable(),
})

export const UsageLogSchema = z.object({
  totalCalls: z.number(),
  totalTokens: z.number(),
  byUser: z.array(z.object({ userId: z.string(), fullName: z.string(), calls: z.number(), tokens: z.number() })),
  byKey: z.array(z.object({ promptKey: z.string(), calls: z.number(), tokens: z.number() })),
  recent: z.array(z.object({
    id: z.string(),
    promptKey: z.string(),
    userName: z.string(),
    tokensUsed: z.number().nullable(),
    createdAt: z.string().or(z.date()),
  })),
})

export const ToggleCaseSchema = z.object({
  isEnabled: z.boolean(),
})

export const AiPromptInfoSchema = z.object({
  promptKey: z.string(),
  label: z.string(),
  isCustom: z.boolean(),
  promptText: z.string(),
  variables: z.array(z.string()),
})

export const UpdatePromptSchema = z.object({
  promptText: z.string().min(10).max(5000),
})
