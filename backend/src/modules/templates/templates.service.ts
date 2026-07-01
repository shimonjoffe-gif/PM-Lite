import { PrismaClient, TaskStatus } from '@prisma/client'
import type { z } from 'zod'
import type {
  CreateTemplateSchema,
  UpdateTemplateSchema,
  CreateTemplateTaskSchema,
  UpdateTemplateTaskSchema,
  CreateTemplateDependencySchema,
  CreateTemplateDocumentSchema,
  CreateProjectFromTemplateSchema,
  AssembleProjectSchema,
  ActualizeTemplateSchema,
  CreateNormParamSchema,
  FormulaSchema,
} from './templates.schemas'

// ── Formula Calculation ───────────────────────────────────────────────────────

type FormulaJson = z.infer<typeof FormulaSchema>

export function calculateDuration(
  formula: FormulaJson | null | undefined,
  params: Record<string, number | string | boolean>,
): number {
  if (!formula) return 1

  let result = formula.base

  for (const m of formula.multipliers ?? []) {
    const val = Number(params[m.paramCode] ?? 1)
    result *= Math.pow(val <= 0 ? 1 : val, m.exponent ?? 1)
  }

  for (const a of formula.addends ?? []) {
    const val = params[a.paramCode]
    if (a.coefficient !== undefined && typeof val === 'number') {
      result += val * a.coefficient
    } else if (a.matchValue !== undefined && String(val) === a.matchValue) {
      result += a.addDays ?? 0
    } else if (a.matchValue === undefined && a.coefficient === undefined) {
      result += a.addDays ?? 0
    }
  }

  return Math.max(1, Math.round(result * 10) / 10)
}

// Add workDays to a date (simple Mon–Fri schedule)
function addWorkDays(date: Date, days: number): Date {
  const d = new Date(date)
  let added = 0
  while (added < Math.floor(days)) {
    d.setDate(d.getDate() + 1)
    const dow = d.getDay()
    if (dow !== 0 && dow !== 6) added++
  }
  return d
}

// ── NormParam CRUD ────────────────────────────────────────────────────────────

export async function listNormParams(prisma: PrismaClient, orgId: string) {
  return prisma.normParam.findMany({
    where: { organizationId: orgId },
    orderBy: { name: 'asc' },
  })
}

export async function createNormParam(
  prisma: PrismaClient,
  orgId: string,
  data: z.infer<typeof CreateNormParamSchema>,
) {
  return prisma.normParam.create({
    data: {
      organizationId: orgId,
      code: data.code,
      name: data.name,
      paramType: data.paramType,
      unit: data.unit,
      possibleValues: data.possibleValues ?? [],
      description: data.description,
    },
  })
}

export async function updateNormParam(
  prisma: PrismaClient,
  id: string,
  orgId: string,
  data: Partial<z.infer<typeof CreateNormParamSchema>>,
) {
  const param = await prisma.normParam.findUnique({ where: { id } })
  if (!param || param.organizationId !== orgId) throw { statusCode: 404, message: 'Параметр не найден' }
  return prisma.normParam.update({
    where: { id },
    data: {
      name: data.name,
      paramType: data.paramType,
      unit: data.unit,
      possibleValues: data.possibleValues,
      description: data.description,
    },
  })
}

export async function deleteNormParam(prisma: PrismaClient, id: string, orgId: string) {
  const param = await prisma.normParam.findUnique({ where: { id } })
  if (!param || param.organizationId !== orgId) throw { statusCode: 404, message: 'Параметр не найден' }
  await prisma.normParam.delete({ where: { id } })
}

// ── Template CRUD ─────────────────────────────────────────────────────────────

export async function listTemplates(prisma: PrismaClient, orgId: string) {
  return prisma.projectTemplate.findMany({
    where: { organizationId: orgId },
    include: {
      creator: { select: { fullName: true } },
      _count: { select: { tasks: true, usages: true } },
    },
    orderBy: [{ usageCount: 'desc' }, { name: 'asc' }],
  })
}

export async function getTemplate(prisma: PrismaClient, id: string, orgId: string) {
  const t = await prisma.projectTemplate.findUnique({
    where: { id },
    include: {
      creator: { select: { fullName: true } },
      tasks: {
        include: {
          dependencies: true,
          documents: true,
          stat: true,
        },
        orderBy: [{ phase: 'asc' }, { sortOrder: 'asc' }],
      },
      documents: { where: { taskId: null }, orderBy: { sortOrder: 'asc' } },
    },
  })
  if (!t || t.organizationId !== orgId) throw { statusCode: 404, message: 'Шаблон не найден' }
  return t
}

export async function createTemplate(
  prisma: PrismaClient,
  orgId: string,
  userId: string,
  data: z.infer<typeof CreateTemplateSchema>,
) {
  return prisma.projectTemplate.create({
    data: {
      organizationId: orgId,
      createdBy: userId,
      name: data.name,
      description: data.description,
      category: data.category,
    },
  })
}

export async function updateTemplate(
  prisma: PrismaClient,
  id: string,
  orgId: string,
  data: z.infer<typeof UpdateTemplateSchema>,
) {
  const t = await prisma.projectTemplate.findUnique({ where: { id } })
  if (!t || t.organizationId !== orgId) throw { statusCode: 404, message: 'Шаблон не найден' }
  return prisma.projectTemplate.update({
    where: { id },
    data: {
      name: data.name,
      description: data.description,
      category: data.category,
      isPublished: data.isPublished,
      ...(data.isPublished && !t.isPublished ? { version: { increment: 1 } } : {}),
    },
  })
}

export async function deleteTemplate(prisma: PrismaClient, id: string, orgId: string) {
  const t = await prisma.projectTemplate.findUnique({ where: { id } })
  if (!t || t.organizationId !== orgId) throw { statusCode: 404, message: 'Шаблон не найден' }
  await prisma.projectTemplate.delete({ where: { id } })
}

// ── Template Task CRUD ────────────────────────────────────────────────────────

export async function createTemplateTask(
  prisma: PrismaClient,
  templateId: string,
  orgId: string,
  data: z.infer<typeof CreateTemplateTaskSchema>,
) {
  const t = await prisma.projectTemplate.findUnique({ where: { id: templateId } })
  if (!t || t.organizationId !== orgId) throw { statusCode: 404, message: 'Шаблон не найден' }

  return prisma.templateTask.create({
    data: {
      templateId,
      parentId: data.parentId,
      title: data.title,
      description: data.description,
      phase: data.phase,
      roleName: data.roleName,
      taskType: (data.taskType as any) ?? 'task',
      priority: (data.priority as any) ?? 'medium',
      baseDuration: data.baseDuration,
      effortHours: data.effortHours,
      formulaJson: data.formulaJson as any,
      sortOrder: data.sortOrder ?? 0,
    },
  })
}

export async function updateTemplateTask(
  prisma: PrismaClient,
  taskId: string,
  orgId: string,
  data: z.infer<typeof UpdateTemplateTaskSchema>,
) {
  const task = await prisma.templateTask.findUnique({
    where: { id: taskId },
    include: { template: { select: { organizationId: true } } },
  })
  if (!task || task.template.organizationId !== orgId) throw { statusCode: 404, message: 'Задача не найдена' }

  return prisma.templateTask.update({
    where: { id: taskId },
    data: {
      parentId: data.parentId,
      title: data.title,
      description: data.description,
      phase: data.phase,
      roleName: data.roleName,
      taskType: data.taskType as any,
      priority: data.priority as any,
      baseDuration: data.baseDuration,
      effortHours: data.effortHours,
      formulaJson: data.formulaJson as any,
      sortOrder: data.sortOrder,
    },
  })
}

export async function deleteTemplateTask(prisma: PrismaClient, taskId: string, orgId: string) {
  const task = await prisma.templateTask.findUnique({
    where: { id: taskId },
    include: { template: { select: { organizationId: true } } },
  })
  if (!task || task.template.organizationId !== orgId) throw { statusCode: 404, message: 'Задача не найдена' }
  await prisma.templateTask.delete({ where: { id: taskId } })
}

export async function createTemplateDependency(
  prisma: PrismaClient,
  taskId: string,
  orgId: string,
  data: z.infer<typeof CreateTemplateDependencySchema>,
) {
  const task = await prisma.templateTask.findUnique({
    where: { id: taskId },
    include: { template: { select: { organizationId: true } } },
  })
  if (!task || task.template.organizationId !== orgId) throw { statusCode: 404, message: 'Задача не найдена' }

  return prisma.templateDependency.create({
    data: {
      taskId,
      predecessorId: data.predecessorId,
      type: data.type as any,
      lagDays: data.lagDays,
    },
  })
}

export async function deleteTemplateDependency(prisma: PrismaClient, depId: string, orgId: string) {
  const dep = await prisma.templateDependency.findUnique({
    where: { id: depId },
    include: { task: { include: { template: { select: { organizationId: true } } } } },
  })
  if (!dep || dep.task.template.organizationId !== orgId) throw { statusCode: 404, message: 'Зависимость не найдена' }
  await prisma.templateDependency.delete({ where: { id: depId } })
}

export async function createTemplateDocument(
  prisma: PrismaClient,
  templateId: string,
  orgId: string,
  data: z.infer<typeof CreateTemplateDocumentSchema>,
) {
  const t = await prisma.projectTemplate.findUnique({ where: { id: templateId } })
  if (!t || t.organizationId !== orgId) throw { statusCode: 404, message: 'Шаблон не найден' }
  return prisma.templateDocument.create({
    data: {
      templateId,
      taskId: data.taskId,
      name: data.name,
      description: data.description,
      isRequired: data.isRequired,
      sortOrder: data.sortOrder ?? 0,
    },
  })
}

export async function deleteTemplateDocument(prisma: PrismaClient, docId: string, orgId: string) {
  const doc = await prisma.templateDocument.findUnique({
    where: { id: docId },
    include: { template: { select: { organizationId: true } } },
  })
  if (!doc || doc.template.organizationId !== orgId) throw { statusCode: 404, message: 'Документ не найден' }
  await prisma.templateDocument.delete({ where: { id: docId } })
}

// ── Create Project from Template ──────────────────────────────────────────────

export async function createProjectFromTemplate(
  prisma: PrismaClient,
  orgId: string,
  userId: string,
  data: z.infer<typeof CreateProjectFromTemplateSchema>,
) {
  const template = await prisma.projectTemplate.findUnique({
    where: { id: data.templateId },
    include: {
      tasks: {
        include: { dependencies: true },
        orderBy: [{ phase: 'asc' }, { sortOrder: 'asc' }],
      },
      documents: true,
    },
  })
  if (!template || template.organizationId !== orgId) throw { statusCode: 404, message: 'Шаблон не найден' }

  const startDate = data.startDate ? new Date(data.startDate) : new Date()
  const params = data.scalingParams

  return prisma.$transaction(async (tx) => {
    // Create project
    const project = await tx.project.create({
      data: {
        organizationId: orgId,
        name: data.projectName,
        description: data.projectDescription,
        startDate,
        sourceTemplateId: template.id,
        createdBy: userId,
        members: { create: { userId, role: 'owner' } },
      },
    })

    // Schedule tasks using topological sort + formula calculation
    const oldToNew = new Map<string, string>()
    const taskEndDates = new Map<string, Date>()

    // Build dependency graph for ordering
    const depMap = new Map<string, string[]>() // taskId → predecessorIds
    for (const t of template.tasks) {
      depMap.set(t.id, t.dependencies.map(d => d.predecessorId))
    }

    const sorted = topoSort(template.tasks.map(t => t.id), depMap)

    for (const templateTaskId of sorted) {
      const tt = template.tasks.find(t => t.id === templateTaskId)
      if (!tt) continue

      const formula = tt.formulaJson as FormulaJson | null
      const duration = calculateDuration(formula, params)

      // Determine start: max(predecessors' end) or project start
      const preds = tt.dependencies
      let taskStart = startDate
      if (preds.length > 0) {
        for (const dep of preds) {
          const predEnd = taskEndDates.get(dep.predecessorId)
          if (predEnd && predEnd > taskStart) taskStart = predEnd
        }
      } else if (tt.parentId && taskEndDates.has(tt.parentId)) {
        // no-dep children start after parent
      }

      const taskEnd = addWorkDays(taskStart, duration)

      const newParentId = tt.parentId ? oldToNew.get(tt.parentId) : undefined

      const task = await tx.task.create({
        data: {
          projectId: project.id,
          parentId: newParentId ?? null,
          title: tt.title,
          description: tt.description,
          taskType: tt.taskType,
          priority: tt.priority,
          effortHours: tt.effortHours,
          startDate: taskStart,
          dueDate: taskEnd,
          sortOrder: tt.sortOrder,
          sourceTemplateTaskId: tt.id,
          sourceTemplateId: template.id,
          createdBy: userId,
        },
      })

      oldToNew.set(tt.id, task.id)
      taskEndDates.set(tt.id, taskEnd)
    }

    // Copy task dependencies
    for (const tt of template.tasks) {
      for (const dep of tt.dependencies) {
        const newTaskId = oldToNew.get(tt.id)
        const newPredId = oldToNew.get(dep.predecessorId)
        if (newTaskId && newPredId) {
          await tx.taskDependency.create({
            data: {
              taskId: newTaskId,
              predecessorId: newPredId,
              type: dep.type,
              lagDays: dep.lagDays,
            },
          })
        }
      }
    }

    // Add project members
    await tx.projectMember.upsert({
      where: { projectId_userId: { projectId: project.id, userId } },
      create: { projectId: project.id, userId, role: 'owner' },
      update: {},
    })

    // Log usage
    await tx.projectTemplateUsage.create({
      data: {
        templateId: template.id,
        projectId: project.id,
        scalingParams: params,
      },
    })

    // Increment usage count
    await tx.projectTemplate.update({
      where: { id: template.id },
      data: { usageCount: { increment: 1 } },
    })

    return project
  })
}

// ── Assemble from Pieces ──────────────────────────────────────────────────────

export async function assembleProject(
  prisma: PrismaClient,
  orgId: string,
  userId: string,
  data: z.infer<typeof AssembleProjectSchema>,
) {
  const startDate = data.startDate ? new Date(data.startDate) : new Date()
  const params = data.scalingParams

  // Collect all tasks from all pieces
  interface CollectedTask {
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
    originalId: string
    sourceTemplateId: string | null
    sourceTemplateTaskId: string | null
    parentOriginalId: string | null
    pieceIndex: number
    scaleFactor: number
  }

  const allTasks: CollectedTask[] = []

  for (let pi = 0; pi < data.pieces.length; pi++) {
    const piece = data.pieces[pi]

    if (piece.type === 'template_full' || piece.type === 'template_phase') {
      const template = await prisma.projectTemplate.findUnique({
        where: { id: piece.sourceId },
        include: { tasks: { include: { dependencies: true }, orderBy: [{ sortOrder: 'asc' }] } },
      })
      if (!template || template.organizationId !== orgId) continue

      let tasks = template.tasks
      if (piece.type === 'template_phase' && piece.phaseLabel) {
        tasks = tasks.filter(t => t.phase === piece.phaseLabel || t.parentId
          ? tasks.some(p => p.id === t.parentId && p.phase === piece.phaseLabel)
          : false)
        tasks = template.tasks.filter(t => t.phase === piece.phaseLabel)
      }

      for (const t of tasks) {
        allTasks.push({
          title: t.title,
          description: t.description,
          phase: t.phase,
          roleName: t.roleName,
          taskType: t.taskType,
          priority: t.priority,
          baseDuration: Number(t.baseDuration),
          effortHours: t.effortHours ? Number(t.effortHours) : null,
          formulaJson: t.formulaJson as FormulaJson | null,
          sortOrder: pi * 10000 + t.sortOrder,
          originalId: `${pi}_${t.id}`,
          sourceTemplateId: template.id,
          sourceTemplateTaskId: t.id,
          parentOriginalId: t.parentId ? `${pi}_${t.parentId}` : null,
          pieceIndex: pi,
          scaleFactor: piece.scaleFactor,
        })
      }
    } else if (piece.type === 'project_phase') {
      // Copy from existing project's task subtree
      const filter: any = { projectId: piece.sourceId }
      if (piece.parentTaskId) filter.parentId = piece.parentTaskId
      else filter.parentId = null

      const topTasks = await prisma.task.findMany({ where: filter })

      const collectSubtree = async (taskIds: string[]): Promise<typeof allTasks[0][]> => {
        const result: typeof allTasks[0][] = []
        for (const t of await prisma.task.findMany({ where: { id: { in: taskIds } } })) {
          result.push({
            title: t.title,
            description: t.description,
            phase: null,
            roleName: null,
            taskType: t.taskType,
            priority: t.priority,
            baseDuration: t.dueDate && t.startDate
              ? Math.max(1, Math.round((new Date(t.dueDate).getTime() - new Date(t.startDate).getTime()) / 86400000 * 5 / 7))
              : 5,
            effortHours: t.effortHours ? Number(t.effortHours) : null,
            formulaJson: null,
            sortOrder: pi * 10000 + t.sortOrder,
            originalId: `${pi}_${t.id}`,
            sourceTemplateId: null,
            sourceTemplateTaskId: null,
            parentOriginalId: t.parentId ? `${pi}_${t.parentId}` : null,
            pieceIndex: pi,
            scaleFactor: piece.scaleFactor,
          })
          const children = await prisma.task.findMany({ where: { parentId: t.id } })
          if (children.length) {
            result.push(...await collectSubtree(children.map(c => c.id)))
          }
        }
        return result
      }

      allTasks.push(...await collectSubtree(topTasks.map(t => t.id)))
    }
  }

  return prisma.$transaction(async (tx) => {
    const project = await tx.project.create({
      data: {
        organizationId: orgId,
        name: data.projectName,
        description: data.projectDescription,
        startDate,
        createdBy: userId,
        members: { create: { userId, role: 'owner' } },
      },
    })

    const oldToNew = new Map<string, string>()
    const taskEndDates = new Map<string, Date>()
    let cursor = startDate

    const sorted = allTasks.sort((a, b) => a.sortOrder - b.sortOrder)

    for (const ct of sorted) {
      const formula = ct.formulaJson
      const rawDuration = calculateDuration(formula, params)
      const duration = Math.max(1, Math.round(rawDuration * ct.scaleFactor))

      const taskStart = cursor
      const taskEnd = addWorkDays(taskStart, duration)
      cursor = taskEnd

      const newParentId = ct.parentOriginalId ? oldToNew.get(ct.parentOriginalId) : undefined

      const task = await tx.task.create({
        data: {
          projectId: project.id,
          parentId: newParentId ?? null,
          title: ct.title,
          description: ct.description,
          taskType: ct.taskType as any,
          priority: ct.priority as any,
          effortHours: ct.effortHours,
          startDate: taskStart,
          dueDate: taskEnd,
          sortOrder: ct.sortOrder,
          sourceTemplateTaskId: ct.sourceTemplateTaskId,
          sourceTemplateId: ct.sourceTemplateId,
          createdBy: userId,
        },
      })

      oldToNew.set(ct.originalId, task.id)
      taskEndDates.set(ct.originalId, taskEnd)
    }

    await tx.projectMember.upsert({
      where: { projectId_userId: { projectId: project.id, userId } },
      create: { projectId: project.id, userId, role: 'owner' },
      update: {},
    })

    return project
  })
}

// ── Template Statistics ───────────────────────────────────────────────────────

export async function getTemplateStats(prisma: PrismaClient, templateId: string, orgId: string) {
  const template = await prisma.projectTemplate.findUnique({
    where: { id: templateId },
    include: {
      tasks: {
        include: { stat: true },
        orderBy: [{ phase: 'asc' }, { sortOrder: 'asc' }],
      },
      usages: { orderBy: { createdAt: 'desc' }, take: 20 },
    },
  })
  if (!template || template.organizationId !== orgId) throw { statusCode: 404, message: 'Шаблон не найден' }

  // Top-5 tasks by project appearance count
  const taskUsageMap = new Map<string, number>()
  for (const usage of await prisma.projectTemplateUsage.findMany({ where: { templateId } })) {
    const tasks = await prisma.task.findMany({
      where: { sourceTemplateId: templateId, projectId: usage.projectId },
      select: { sourceTemplateTaskId: true },
    })
    for (const t of tasks) {
      if (t.sourceTemplateTaskId) {
        taskUsageMap.set(t.sourceTemplateTaskId, (taskUsageMap.get(t.sourceTemplateTaskId) ?? 0) + 1)
      }
    }
  }

  const tasksWithStats = template.tasks.map(t => ({
    id: t.id,
    title: t.title,
    phase: t.phase,
    baseDuration: Number(t.baseDuration),
    stat: t.stat,
    usageCount: taskUsageMap.get(t.id) ?? 0,
    needsUpdate: t.stat && t.stat.avgDeviationPct
      ? Math.abs(Number(t.stat.avgDeviationPct)) > 20
      : false,
  }))

  return {
    template: {
      id: template.id,
      name: template.name,
      usageCount: template.usageCount,
    },
    tasks: tasksWithStats,
    actualizationSuggestions: tasksWithStats
      .filter(t => t.needsUpdate && t.stat?.avgActualDays)
      .map(t => ({
        templateTaskId: t.id,
        title: t.title,
        currentBase: t.baseDuration,
        suggestedBase: Number(t.stat!.avgActualDays),
        deviationPct: Number(t.stat!.avgDeviationPct),
      })),
  }
}

// ── Actualize Template (on project archive) ───────────────────────────────────

export async function computeActualizationSuggestions(
  prisma: PrismaClient,
  projectId: string,
  orgId: string,
) {
  const project = await prisma.project.findUnique({ where: { id: projectId } })
  if (!project || project.organizationId !== orgId) throw { statusCode: 404, message: 'Проект не найден' }
  if (!project.sourceTemplateId) return null

  const tasks = await prisma.task.findMany({
    where: { projectId, sourceTemplateTaskId: { not: null } },
    include: { parent: { select: { title: true } } },
  })

  const suggestions = []
  for (const task of tasks) {
    if (!task.sourceTemplateTaskId || !task.startDate || !task.dueDate) continue
    const templateTask = await prisma.templateTask.findUnique({
      where: { id: task.sourceTemplateTaskId },
    })
    if (!templateTask) continue

    const actualDays = Math.max(1, Math.round(
      (new Date(task.dueDate).getTime() - new Date(task.startDate).getTime()) / 86400000 * 5 / 7,
    ))
    const planDays = Number(templateTask.baseDuration)
    const deviationPct = planDays > 0 ? Math.round(((actualDays - planDays) / planDays) * 100) : 0

    suggestions.push({
      templateTaskId: templateTask.id,
      taskTitle: task.title,
      planDays,
      actualDays,
      deviationPct,
      suggestedBase: actualDays,
    })
  }

  return suggestions.filter(s => Math.abs(s.deviationPct) > 10)
}

export async function applyActualization(
  prisma: PrismaClient,
  templateId: string,
  orgId: string,
  data: z.infer<typeof ActualizeTemplateSchema>,
) {
  const template = await prisma.projectTemplate.findUnique({ where: { id: templateId } })
  if (!template || template.organizationId !== orgId) throw { statusCode: 404, message: 'Шаблон не найден' }

  await prisma.$transaction(async (tx) => {
    for (const u of data.templateTaskUpdates) {
      await tx.templateTask.update({
        where: { id: u.templateTaskId },
        data: { baseDuration: u.newBaseDuration },
      })
    }
    await tx.projectTemplate.update({
      where: { id: templateId },
      data: { version: { increment: 1 } },
    })
  })
}

export async function updateTemplateTaskStats(
  prisma: PrismaClient,
  projectId: string,
  orgId: string,
) {
  const tasks = await prisma.task.findMany({
    where: { projectId, sourceTemplateTaskId: { not: null } },
  })

  for (const task of tasks) {
    if (!task.sourceTemplateTaskId || !task.startDate || !task.dueDate) continue
    const templateTask = await prisma.templateTask.findUnique({
      where: { id: task.sourceTemplateTaskId },
    })
    if (!templateTask) continue

    const actualDays = Math.max(1, Math.round(
      (new Date(task.dueDate).getTime() - new Date(task.startDate).getTime()) / 86400000 * 5 / 7,
    ))
    const planDays = Number(templateTask.baseDuration)
    const deviationPct = planDays > 0 ? ((actualDays - planDays) / planDays) * 100 : 0

    const existing = await prisma.templateTaskStat.findUnique({
      where: { templateTaskId: task.sourceTemplateTaskId },
    })

    if (existing) {
      const n = existing.sampleCount + 1
      const newAvgActual = (Number(existing.avgActualDays ?? 0) * existing.sampleCount + actualDays) / n
      const newAvgPlan = (Number(existing.avgPlanDays ?? 0) * existing.sampleCount + planDays) / n
      const newAvgDev = (Number(existing.avgDeviationPct ?? 0) * existing.sampleCount + deviationPct) / n
      await prisma.templateTaskStat.update({
        where: { templateTaskId: task.sourceTemplateTaskId },
        data: { sampleCount: n, avgActualDays: newAvgActual, avgPlanDays: newAvgPlan, avgDeviationPct: newAvgDev },
      })
    } else {
      await prisma.templateTaskStat.create({
        data: {
          templateTaskId: task.sourceTemplateTaskId,
          sampleCount: 1,
          avgActualDays: actualDays,
          avgPlanDays: planDays,
          avgDeviationPct: deviationPct,
        },
      })
    }
  }
}

// ── Get phases from template (for picker) ─────────────────────────────────────

export async function getTemplatePhases(prisma: PrismaClient, templateId: string, orgId: string) {
  const template = await prisma.projectTemplate.findUnique({
    where: { id: templateId },
    include: { tasks: { select: { phase: true, id: true, title: true, parentId: true }, orderBy: { sortOrder: 'asc' } } },
  })
  if (!template || template.organizationId !== orgId) throw { statusCode: 404, message: 'Шаблон не найден' }

  const phases = [...new Set(template.tasks.map(t => t.phase).filter(Boolean))] as string[]
  return phases.map(phase => ({
    phase,
    taskCount: template.tasks.filter(t => t.phase === phase).length,
  }))
}

// ── Get project phases (for analog picker) ────────────────────────────────────

export async function getProjectPhases(prisma: PrismaClient, projectId: string, orgId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId } })
  if (!project || project.organizationId !== orgId) throw { statusCode: 404, message: 'Проект не найден' }

  const topTasks = await prisma.task.findMany({
    where: { projectId, parentId: null },
    select: { id: true, title: true, _count: { select: { children: true } } },
    orderBy: { sortOrder: 'asc' },
  })
  return topTasks
}

// ── Collect norm params needed for a set of pieces ────────────────────────────

export async function collectRequiredParams(
  prisma: PrismaClient,
  orgId: string,
  templateIds: string[],
) {
  const tasks = await prisma.templateTask.findMany({
    where: { templateId: { in: templateIds }, template: { organizationId: orgId } },
    select: { formulaJson: true },
  })

  const paramCodes = new Set<string>()
  for (const t of tasks) {
    const formula = t.formulaJson as FormulaJson | null
    if (!formula) continue
    formula.multipliers?.forEach(m => paramCodes.add(m.paramCode))
    formula.addends?.forEach(a => paramCodes.add(a.paramCode))
  }

  if (!paramCodes.size) return []

  return prisma.normParam.findMany({
    where: { organizationId: orgId, code: { in: [...paramCodes] } },
  })
}

// ── Topological sort ──────────────────────────────────────────────────────────

function topoSort(ids: string[], depMap: Map<string, string[]>): string[] {
  const visited = new Set<string>()
  const result: string[] = []

  const visit = (id: string, stack = new Set<string>()) => {
    if (visited.has(id)) return
    if (stack.has(id)) return // cycle guard
    stack.add(id)
    for (const dep of depMap.get(id) ?? []) {
      if (ids.includes(dep)) visit(dep, stack)
    }
    visited.add(id)
    result.push(id)
  }

  for (const id of ids) visit(id)
  return result
}
