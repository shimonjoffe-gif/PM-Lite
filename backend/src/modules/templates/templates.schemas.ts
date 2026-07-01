import { z } from 'zod'

// ── NormParam ─────────────────────────────────────────────────────────────────

export const NormParamTypeEnum = z.enum(['numeric', 'boolean', 'enum'])

export const CreateNormParamSchema = z.object({
  code: z.string().min(1).max(64).regex(/^[a-z0-9_]+$/, 'Только строчные буквы, цифры и _'),
  name: z.string().min(1).max(200),
  paramType: NormParamTypeEnum,
  unit: z.string().max(32).optional(),
  possibleValues: z.array(z.string()).optional(),
  description: z.string().max(1000).optional(),
})

export const UpdateNormParamSchema = CreateNormParamSchema.partial().omit({ code: true })

// ── Formula ───────────────────────────────────────────────────────────────────

export const FormulaMultiplierSchema = z.object({
  paramCode: z.string(),
  exponent: z.number().default(1),
})

export const FormulaAddendSchema = z.object({
  paramCode: z.string(),
  // For numeric params: add += paramValue * coefficient
  coefficient: z.number().optional(),
  // For boolean/enum: add if param matches this value
  matchValue: z.string().optional(),
  addDays: z.number().optional(),
})

export const FormulaSchema = z.object({
  base: z.number().min(0),
  multipliers: z.array(FormulaMultiplierSchema).optional(),
  addends: z.array(FormulaAddendSchema).optional(),
})

// ── Template Task ─────────────────────────────────────────────────────────────

export const CreateTemplateTaskSchema = z.object({
  parentId: z.string().uuid().optional(),
  title: z.string().min(1).max(500),
  description: z.string().max(10000).optional(),
  phase: z.string().max(200).optional(),
  roleName: z.string().max(200).optional(),
  taskType: z.enum(['task', 'milestone', 'billable_stage', 'management']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  baseDuration: z.number().min(0).default(1),
  effortHours: z.number().min(0).optional(),
  formulaJson: FormulaSchema.optional(),
  sortOrder: z.number().int().optional(),
})

export const UpdateTemplateTaskSchema = CreateTemplateTaskSchema.partial()

// ── Template Dependency ───────────────────────────────────────────────────────

export const CreateTemplateDependencySchema = z.object({
  predecessorId: z.string().uuid(),
  type: z.enum(['FS', 'SS', 'FF', 'SF']).default('FS'),
  lagDays: z.number().int().default(0),
})

// ── Template Document ─────────────────────────────────────────────────────────

export const CreateTemplateDocumentSchema = z.object({
  taskId: z.string().uuid().optional(),
  name: z.string().min(1).max(500),
  description: z.string().max(2000).optional(),
  isRequired: z.boolean().default(false),
  sortOrder: z.number().int().optional(),
})

// ── Project Template ──────────────────────────────────────────────────────────

export const CreateTemplateSchema = z.object({
  name: z.string().min(1).max(300),
  description: z.string().max(5000).optional(),
  category: z.string().max(200).optional(),
})

export const UpdateTemplateSchema = CreateTemplateSchema.partial().extend({
  isPublished: z.boolean().optional(),
})

// ── Create Project from Template ──────────────────────────────────────────────

export const CreateProjectFromTemplateSchema = z.object({
  templateId: z.string().uuid(),
  projectName: z.string().min(1).max(300),
  projectDescription: z.string().max(5000).optional(),
  startDate: z.string().optional(), // YYYY-MM-DD
  scalingParams: z.record(z.union([z.number(), z.string(), z.boolean()])).default({}),
})

// ── Assemble from Pieces ──────────────────────────────────────────────────────

export const AssemblePieceSchema = z.object({
  type: z.enum(['template_phase', 'template_full', 'project_phase']),
  sourceId: z.string().uuid(),      // templateId or projectId
  phaseLabel: z.string().optional(), // filter by phase (for template_phase)
  parentTaskId: z.string().uuid().optional(), // filter by parent task (for project_phase)
  scaleFactor: z.number().min(0.01).max(100).default(1),
})

export const AssembleProjectSchema = z.object({
  projectName: z.string().min(1).max(300),
  projectDescription: z.string().max(5000).optional(),
  startDate: z.string().optional(),
  pieces: z.array(AssemblePieceSchema).min(1),
  scalingParams: z.record(z.union([z.number(), z.string(), z.boolean()])).default({}),
})

// ── Actualization ─────────────────────────────────────────────────────────────

export const ActualizeTemplateSchema = z.object({
  templateTaskUpdates: z.array(z.object({
    templateTaskId: z.string().uuid(),
    newBaseDuration: z.number().min(0),
  })),
})
