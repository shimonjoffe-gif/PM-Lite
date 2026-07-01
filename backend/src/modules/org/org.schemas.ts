import { z } from 'zod'

export const OrgInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  logoUrl: z.string().nullable(),
  planType: z.string(),
})

export const UpdateLogoSchema = z.object({
  logoDataUrl: z.string().max(3_500_000),
})

export const ProjectStatusSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  sortOrder: z.number(),
})

export const CreateProjectStatusSchema = z.object({
  name: z.string().min(1).max(100),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#6B7280'),
})

export const UpdateProjectStatusSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
})

export const ReorderStatusesSchema = z.object({
  ids: z.array(z.string()),
})

export const ClientSchema = z.object({
  id: z.string(),
  name: z.string(),
  contactInfo: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
})

export const CreateClientSchema = z.object({
  name: z.string().min(1).max(200),
  contactInfo: z.string().max(500).optional(),
  notes: z.string().max(2000).optional(),
})

export const UpdateClientSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  contactInfo: z.string().max(500).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
})
