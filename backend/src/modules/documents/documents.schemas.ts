import { z } from 'zod'

export const DocumentVersionSchema = z.object({
  id: z.string().uuid(),
  documentId: z.string().uuid(),
  versionNumber: z.number().int(),
  fileName: z.string(),
  fileSize: z.number().nullable(),
  mimeType: z.string().nullable(),
  comment: z.string().nullable(),
  createdBy: z.string().uuid(),
  createdByName: z.string(),
  createdAt: z.string().datetime(),
})

export const DocumentSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  documentTypeId: z.string().uuid(),
  documentTypeName: z.string(),
  documentTypeCategoryCode: z.string(),
  parentType: z.enum(['project', 'task', 'client']),
  parentId: z.string().uuid(),
  projectId: z.string().uuid().nullable(),
  latestVersion: DocumentVersionSchema.nullable(),
  versionsCount: z.number().int(),
  createdBy: z.string().uuid(),
  createdByName: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export const DocumentListResponseSchema = z.object({
  items: z.array(DocumentSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
})

export const ListDocumentsQuerySchema = z.object({
  projectId: z.string().uuid().optional(),
  taskId: z.string().uuid().optional(),
  clientId: z.string().uuid().optional(),
  documentTypeId: z.string().uuid().optional(),
  categoryCode: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
})

export const CreateDocumentBodySchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  documentTypeId: z.string().uuid(),
  parentType: z.enum(['project', 'task', 'client']),
  parentId: z.string().uuid(),
  comment: z.string().max(500).optional(),
})

export const AddVersionBodySchema = z.object({
  comment: z.string().max(500).optional(),
})
