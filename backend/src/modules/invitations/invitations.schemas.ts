import { z } from 'zod'

export const CreateInvitationSchema = z.object({
  email: z.string().email(),
  orgRoleId: z.string().uuid(),
})

export const AcceptInvitationSchema = z.object({
  fullName: z.string().min(2).max(100),
  password: z.string().min(8),
})

export const InvitationInfoSchema = z.object({
  id: z.string(),
  email: z.string(),
  roleName: z.string().nullable(),
  orgName: z.string(),
  inviterName: z.string(),
  expiresAt: z.string(),
})
