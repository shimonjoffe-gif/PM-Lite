import { z } from 'zod'

export const StorageSettingsSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  storageMode: z.enum(['cloud', 'external']),
  pluginUrl: z.string().url().nullable(),
  pluginVerifiedAt: z.string().datetime().nullable(),
  pluginVersion: z.string().nullable(),
  updatedAt: z.string().datetime(),
})

export const UpdateStorageSettingsSchema = z.object({
  storageMode: z.enum(['cloud', 'external']).optional(),
  pluginUrl: z.string().url().nullable().optional(),
  pluginApiKey: z.string().min(16).nullable().optional(),
})

export const VerifyPluginResponseSchema = z.object({
  ok: z.boolean(),
  version: z.string().optional(),
  error: z.string().optional(),
})
