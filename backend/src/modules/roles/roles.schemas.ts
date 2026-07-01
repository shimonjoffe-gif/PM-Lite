import { z } from 'zod'
import { PermissionKey } from '@prisma/client'

const permissionKeys = Object.values(PermissionKey) as [string, ...string[]]

export const CreateRoleSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(300).optional(),
  permissions: z.array(z.enum(permissionKeys as [PermissionKey, ...PermissionKey[]])),
})

export const UpdateRoleSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(300).optional(),
  permissions: z.array(z.enum(permissionKeys as [PermissionKey, ...PermissionKey[]])).optional(),
})

export const RoleSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  isSystem: z.boolean(),
  permissions: z.array(z.string()),
  userCount: z.number(),
})
