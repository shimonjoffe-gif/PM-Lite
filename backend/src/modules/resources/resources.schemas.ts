import { z } from 'zod'

// ── Work Schedule ─────────────────────────────────────────────────────────────
export const WorkScheduleTypeEnum = z.enum(['five_two', 'two_two', 'six_one', 'custom'])

export const WorkScheduleSchema = z.object({
  scheduleType: WorkScheduleTypeEnum,
  hoursPerDay: z.number().min(0.5).max(24),
  workDays: z.array(z.number().int().min(1).max(7)).min(1).max(7),
  shiftStart: z.string().regex(/^\d{2}:\d{2}$/),
  shiftEnd: z.string().regex(/^\d{2}:\d{2}$/),
})

// ── Work Schedule Presets ─────────────────────────────────────────────────────
const HoursPerDayMapSchema = z.record(
  z.string(),
  z.number().min(0.5).max(24),
).nullable().optional()

export const CreatePresetSchema = z.object({
  name: z.string().min(1).max(100),
  scheduleType: WorkScheduleTypeEnum.optional(),
  hoursPerDay: z.number().min(0.5).max(24),
  hoursPerDayMap: HoursPerDayMapSchema,
  workDays: z.array(z.number().int().min(1).max(7)).max(7).default([1, 2, 3, 4, 5]),
  cycleDays: z.number().int().min(2).max(28).nullable().optional(),
  workDaysInCycle: z.number().int().min(1).max(14).nullable().optional(),
})

export const UpdatePresetSchema = CreatePresetSchema.partial().omit({ scheduleType: true })

export const AssignUserScheduleSchema = z.object({
  presetId: z.string().uuid().nullable().optional(),
  cycleStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  name: z.string().max(100).nullable().optional(),
  hoursPerDay: z.number().min(0.5).max(24).optional(),
  hoursPerDayMap: HoursPerDayMapSchema,
  workDays: z.array(z.number().int().min(1).max(7)).max(7).optional(),
})

// ── Production Calendar ───────────────────────────────────────────────────────
export const NonWorkingDayTypeEnum = z.enum(['holiday', 'extra_workday'])

export const UpsertNonWorkingDaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: NonWorkingDayTypeEnum.default('holiday'),
  name: z.string().max(200).optional(),
})

export const BulkImportCalendarSchema = z.object({
  country: z.string().max(10), // 'RU', 'US', etc.
  year: z.number().int().min(2020).max(2035),
})

// ── Org Task Types ────────────────────────────────────────────────────────────
export const CreateOrgTaskTypeSchema = z.object({
  name: z.string().min(1).max(100),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
})

export const UpdateOrgTaskTypeSchema = CreateOrgTaskTypeSchema.partial()

// ── Task Dependencies ─────────────────────────────────────────────────────────
export const DependencyTypeEnum = z.enum(['FS', 'SS', 'FF', 'SF'])
export const ConstraintTypeEnum = z.enum(['asap', 'alap', 'snet', 'snlt', 'fnet', 'fnlt', 'exact', 'mso', 'mfo', 'hammock'])

export const CreateDependencySchema = z.object({
  predecessorId: z.string().uuid(),
  type: DependencyTypeEnum.default('FS'),
  lagDays: z.number().int().min(-999).max(999).default(0),
})

export const UpdateTaskConstraintSchema = z.object({
  constraintType: ConstraintTypeEnum.nullable(),
  constraintDate: z.string().nullable().optional(),
})

// ── Resource Timeline ─────────────────────────────────────────────────────────
export const TimelineQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  projectId: z.string().uuid().optional(),
  groupBy: z.enum(['user', 'project']).default('user'),
})

// ── Queue ─────────────────────────────────────────────────────────────────────
export const ReorderQueueSchema = z.object({
  taskIds: z.array(z.string().uuid()),
})

export const AutoLevelSchema = z.object({
  userIds: z.array(z.string().uuid()).optional(), // null = all org users
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  weights: z.object({
    dueDate: z.number().min(0).max(1).default(0.4),
    projectPriority: z.number().min(0).max(1).default(0.3),
    criticalPath: z.number().min(0).max(1).default(0.2),
    freeFloat: z.number().min(0).max(1).default(0.1),
  }).optional(),
})

// ── Import ────────────────────────────────────────────────────────────────────
export const ImportFormatEnum = z.enum(['msproject_xml', 'xlsx', 'csv', 'primavera_xml'])
