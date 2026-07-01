import { z } from 'zod'

export const DocumentTypeCategorySchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  sortOrder: z.number(),
})

export const DocumentTypeSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid().nullable(),
  categoryId: z.string().uuid(),
  categoryCode: z.string(),
  categoryName: z.string(),
  name: z.string(),
  code: z.string().nullable(),
  isSystem: z.boolean(),
  isArchived: z.boolean(),
  sortOrder: z.number(),
  createdAt: z.string().datetime(),
})

export const DocumentTypeListSchema = z.array(
  z.object({
    category: DocumentTypeCategorySchema,
    types: z.array(DocumentTypeSchema),
  }),
)

export const CreateDocumentTypeSchema = z.object({
  categoryId: z.string().uuid(),
  name: z.string().min(1).max(100),
  sortOrder: z.number().int().optional(),
})

export const UpdateDocumentTypeSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  categoryId: z.string().uuid().optional(),
  sortOrder: z.number().int().optional(),
  isArchived: z.boolean().optional(),
})
