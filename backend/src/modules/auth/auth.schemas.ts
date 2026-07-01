import { z } from 'zod'

export const RegisterSchema = z.object({
  orgName: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(2).max(100),
})

export const JoinOrgSchema = z.object({
  orgSlug: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(2).max(100),
})

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
})

export const VerifyEmailSchema = z.object({
  token: z.string(),
})

export const ResendVerificationSchema = z.object({
  email: z.string().email(),
})

export const UserResponseSchema = z.object({
  id: z.string(),
  email: z.string(),
  fullName: z.string(),
  isAdmin: z.boolean(),
  orgRoleId: z.string().nullable(),
  roleName: z.string().nullable(),
  organizationId: z.string(),
  emailVerifiedAt: z.string().nullable(),
  isActive: z.boolean(),
})

export const AuthResponseSchema = z.object({
  token: z.string(),
  user: UserResponseSchema,
})

export const ForgotPasswordSchema = z.object({
  email: z.string().email(),
})

export const ResetPasswordSchema = z.object({
  token: z.string(),
  password: z.string().min(8),
})
