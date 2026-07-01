import { z } from 'zod'

// ─── Task stats embedded in project ──────────────────────────────────────────

export const ProjectKpiSchema = z.object({
  totalTasks: z.number(),
  doneTasks: z.number(),
  overdueTasks: z.number(),
  completionPct: z.number(),
  totalEffortHours: z.number(),
  membersCount: z.number(),
})

// ─── Project ──────────────────────────────────────────────────────────────────

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  isArchived: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  clientId: z.string().nullable(),
  clientName: z.string().nullable(),
  statusId: z.string().nullable(),
  statusName: z.string().nullable(),
  statusColor: z.string().nullable(),
  ownerId: z.string().nullable(),
  ownerName: z.string().nullable(),
  kpi: ProjectKpiSchema,
})

export const CreateProjectSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
  clientId: z.string().uuid().optional(),
  statusId: z.string().uuid().optional(),
  ownerId: z.string().uuid().optional(),
  // Если clientId не указан — можно создать нового клиента прямо из формы
  newClientName: z.string().min(1).max(200).optional(),
})

export const UpdateProjectSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  startDate: z.string().date().nullable().optional(),
  endDate: z.string().date().nullable().optional(),
  clientId: z.string().uuid().nullable().optional(),
  newClientName: z.string().min(1).max(200).optional(),
  statusId: z.string().uuid().nullable().optional(),
  ownerId: z.string().uuid().nullable().optional(),
})

export const ListProjectsQuerySchema = z.object({
  status: z.string().uuid().optional(),
  owner: z.string().uuid().optional(),
  client: z.string().uuid().optional(),
  search: z.string().max(200).optional(),
  archived: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).default(1),
})

export const ProjectListResponseSchema = z.object({
  items: z.array(ProjectSchema),
  total: z.number(),
  page: z.number(),
  pages: z.number(),
})

// ─── Aggregates ───────────────────────────────────────────────────────────────

export const AggregateGroupSchema = z.object({
  id: z.string().nullable(),
  name: z.string().nullable(),
  color: z.string().nullable().optional(),
  projectCount: z.number(),
  totalTasks: z.number(),
  doneTasks: z.number(),
  overdueTasks: z.number(),
  totalEffortHours: z.number(),
})

export const ProjectAggregatesSchema = z.object({
  totals: z.object({
    projectCount: z.number(),
    totalTasks: z.number(),
    doneTasks: z.number(),
    overdueTasks: z.number(),
    completionPct: z.number(),
    totalEffortHours: z.number(),
  }),
  byOwner: z.array(AggregateGroupSchema),
  byStatus: z.array(AggregateGroupSchema),
  byClient: z.array(AggregateGroupSchema),
})

// ─── Project Members ──────────────────────────────────────────────────────────

export const ProjectMemberSchema = z.object({
  userId: z.string(),
  fullName: z.string(),
  email: z.string(),
  role: z.enum(['owner', 'admin', 'member']),
  createdAt: z.string(),
})

export const AddMemberSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(['admin', 'member']).default('member'),
})

export const UpdateMemberSchema = z.object({
  role: z.enum(['admin', 'member']),
})

// ─── Delegation ───────────────────────────────────────────────────────────────

export const DelegateProjectSchema = z.object({
  newOwnerId: z.string().uuid(),
})
