import { z } from 'zod'

export const TaskStatusEnum = z.enum(['todo', 'in_progress', 'review', 'done', 'cancelled'])
export const TaskPriorityEnum = z.enum(['low', 'medium', 'high', 'critical'])

// ── Single task (flat) ────────────────────────────────────────────────────────
export const TaskSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  parentId: z.string().nullable(),
  parentTitle: z.string().nullable(),
  boardColumnId: z.string().nullable(),
  assigneeId: z.string().nullable(),
  assigneeName: z.string().nullable(),
  createdBy: z.string().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  status: TaskStatusEnum,
  priority: TaskPriorityEnum,
  effortHours: z.number().nullable(),
  startDate: z.string().nullable(),
  dueDate: z.string().nullable(),
  sortOrder: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
  childCount: z.number(),
})

// ── Tree node (recursive) ─────────────────────────────────────────────────────
export type TaskNode = z.infer<typeof TaskSchema> & { children: TaskNode[] }

// ── Create / Update ───────────────────────────────────────────────────────────
export const ConstraintTypeEnum = z.enum(['asap', 'alap', 'snet', 'snlt', 'fnet', 'fnlt', 'exact', 'mso', 'mfo', 'hammock'])
export const TaskTypeEnum = z.enum(['task', 'milestone', 'billable_stage', 'management'])

export const CreateTaskSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(10000).optional(),
  parentId: z.string().uuid().nullable().optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  boardColumnId: z.string().uuid().nullable().optional(),
  status: TaskStatusEnum.optional(),
  priority: TaskPriorityEnum.optional(),
  effortHours: z.number().positive().max(9999).nullable().optional(),
  duration: z.number().int().positive().max(9999).nullable().optional(),
  startDate: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  percentComplete: z.number().int().min(0).max(100).optional(),
  baselineStart: z.string().nullable().optional(),
  baselineFinish: z.string().nullable().optional(),
  constraintType: ConstraintTypeEnum.nullable().optional(),
  constraintDate: z.string().nullable().optional(),
  taskType: TaskTypeEnum.optional(),
  sortOrder: z.number().int().optional(),
  insertAfterId: z.string().uuid().nullable().optional(),
})

export const UpdateTaskSchema = CreateTaskSchema.partial()

export const MoveTaskSchema = z.object({
  parentId: z.string().uuid().nullable(),
  sortOrder: z.number().int().optional(),
})

export const DelegateSubtreeSchema = z.object({
  assigneeId: z.string().uuid(),
})

// ── Board columns ─────────────────────────────────────────────────────────────
export const BoardColumnSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  color: z.string().nullable(),
  sortOrder: z.number(),
  statusMapping: TaskStatusEnum.nullable(),
})

export const CreateBoardColumnSchema = z.object({
  name: z.string().min(1).max(100),
  color: z.string().optional(),
  sortOrder: z.number().int().optional(),
  statusMapping: TaskStatusEnum.optional(),
})

export const UpdateBoardColumnSchema = CreateBoardColumnSchema.partial()

export const ReorderColumnsSchema = z.object({
  ids: z.array(z.string().uuid()),
})

// ── Status transitions (org-level config) ────────────────────────────────────
export const StatusTransitionSchema = z.object({
  id: z.string(),
  fromStatus: TaskStatusEnum,
  toStatus: TaskStatusEnum,
  allowedOrgRoleIds: z.array(z.string()),
})

export const UpsertTransitionSchema = z.object({
  fromStatus: TaskStatusEnum,
  toStatus: TaskStatusEnum,
  allowedOrgRoleIds: z.array(z.string().uuid()),
})

// ── Comments ──────────────────────────────────────────────────────────────────
export const CommentSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  userId: z.string(),
  userName: z.string(),
  text: z.string(),
  createdAt: z.string(),
  updatedAt: z.string().nullable(),
  deletedAt: z.string().nullable(),
})

export const CreateCommentSchema = z.object({
  text: z.string().min(1).max(10000),
})

export const UpdateCommentSchema = z.object({
  text: z.string().min(1).max(10000),
})

// ── List query ────────────────────────────────────────────────────────────────
export const SortByEnum = z.enum(['deadline_asc', 'deadline_desc', 'priority_desc'])

export const ListTasksQuerySchema = z.object({
  status: TaskStatusEnum.optional(),
  priority: TaskPriorityEnum.optional(),
  assigneeId: z.string().uuid().optional(),
  search: z.string().optional(),
  flat: z.coerce.boolean().default(false),
  my: z.coerce.boolean().default(false),
  overdue: z.coerce.boolean().optional(),
  dueDateFrom: z.string().optional(),
  dueDateTo: z.string().optional(),
  sortBy: SortByEnum.optional(),
  page: z.coerce.number().int().default(1),
  pageSize: z.coerce.number().int().default(50),
})

export const CalendarQuerySchema = z.object({
  from: z.string(),
  to: z.string(),
  projectId: z.string().uuid().optional(),
})

// ── Task dependencies ─────────────────────────────────────────────────────────

export const DependencyTypeEnum = z.enum(['FS', 'SS', 'FF', 'SF'])

export const CreateDependencySchema = z.object({
  predecessorId: z.string().uuid(),
  type: DependencyTypeEnum.default('FS'),
  lagDays: z.number().int().min(-999).max(999).default(0),
})

// ── Effort unit settings ──────────────────────────────────────────────────────
export const EffortUnitEnum = z.enum(['hours', 'days', 'weeks'])

export const UpdateEffortUnitSchema = z.object({
  effortUnit: EffortUnitEnum,
})
