export type NormParamType = 'numeric' | 'boolean' | 'enum'

export interface NormParam {
  id: string
  code: string
  name: string
  paramType: NormParamType
  unit: string | null
  possibleValues: string[] | null
  description: string | null
  createdAt: string
}

export interface FormulaMultiplier {
  paramCode: string
  exponent: number
}

export interface FormulaAddend {
  paramCode: string
  coefficient?: number
  matchValue?: string
  addDays?: number
}

export interface FormulaJson {
  base: number
  multipliers?: FormulaMultiplier[]
  addends?: FormulaAddend[]
}

export interface TemplateDependency {
  id: string
  taskId: string
  predecessorId: string
  type: 'FS' | 'SS' | 'FF' | 'SF'
  lagDays: number
}

export interface TemplateDocument {
  id: string
  templateId: string
  taskId: string | null
  name: string
  description: string | null
  isRequired: boolean
  sortOrder: number
}

export interface TemplateTaskStat {
  id: string
  sampleCount: number
  avgPlanDays: number | null
  avgActualDays: number | null
  avgDeviationPct: number | null
}

export interface TemplateTask {
  id: string
  templateId: string
  parentId: string | null
  title: string
  description: string | null
  phase: string | null
  roleName: string | null
  taskType: string
  priority: string
  baseDuration: number
  effortHours: number | null
  formulaJson: FormulaJson | null
  sortOrder: number
  dependencies: TemplateDependency[]
  documents: TemplateDocument[]
  stat: TemplateTaskStat | null
  children?: TemplateTask[]
}

export interface ProjectTemplate {
  id: string
  organizationId: string
  name: string
  description: string | null
  category: string | null
  version: number
  isPublished: boolean
  usageCount: number
  createdBy: string | null
  createdAt: string
  updatedAt: string
  creator?: { fullName: string | null }
  _count?: { tasks: number; usages: number }
  tasks?: TemplateTask[]
  documents?: TemplateDocument[]
}

export interface TemplatePhase {
  phase: string
  taskCount: number
}

export interface ProjectTopTask {
  id: string
  title: string
  _count: { children: number }
}

export interface TemplateTaskWithStats extends TemplateTask {
  usageCount: number
  needsUpdate: boolean
}

export interface ActualizationSuggestion {
  templateTaskId: string
  title: string
  currentBase: number
  suggestedBase: number
  deviationPct: number
}

export interface TemplateStats {
  template: { id: string; name: string; usageCount: number }
  tasks: TemplateTaskWithStats[]
  actualizationSuggestions: ActualizationSuggestion[]
}

// For assembling project
export interface AssemblePiece {
  type: 'template_phase' | 'template_full' | 'project_phase'
  sourceId: string
  phaseLabel?: string
  parentTaskId?: string
  scaleFactor: number
}
