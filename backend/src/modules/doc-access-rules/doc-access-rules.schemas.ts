import { z } from 'zod'

export const AccessRuleSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  projectId: z.string().uuid().nullable(),
  documentTypeId: z.string().uuid().nullable(),
  orgRoleId: z.string().uuid(),
  orgRoleName: z.string(),
  canView: z.boolean(),
  canUpload: z.boolean(),
})

// Matrix: array of rules to upsert (replace all rules for a scope)
export const UpsertAccessRulesSchema = z.object({
  rules: z.array(
    z.object({
      documentTypeId: z.string().uuid().nullable(),
      orgRoleId: z.string().uuid(),
      canView: z.boolean(),
      canUpload: z.boolean(),
    }),
  ),
})
