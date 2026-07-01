import type { FastifyPluginAsync } from 'fastify'
import { authenticate, requirePermission } from '../../plugins/authenticate'
import {
  CreateNormParamSchema,
  UpdateNormParamSchema,
  CreateTemplateSchema,
  UpdateTemplateSchema,
  CreateTemplateTaskSchema,
  UpdateTemplateTaskSchema,
  CreateTemplateDependencySchema,
  CreateTemplateDocumentSchema,
  CreateProjectFromTemplateSchema,
  AssembleProjectSchema,
  ActualizeTemplateSchema,
} from './templates.schemas'
import {
  listNormParams,
  createNormParam,
  updateNormParam,
  deleteNormParam,
  listTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  createTemplateTask,
  updateTemplateTask,
  deleteTemplateTask,
  createTemplateDependency,
  deleteTemplateDependency,
  createTemplateDocument,
  deleteTemplateDocument,
  createProjectFromTemplate,
  assembleProject,
  getTemplateStats,
  computeActualizationSuggestions,
  applyActualization,
  updateTemplateTaskStats,
  getTemplatePhases,
  getProjectPhases,
  collectRequiredParams,
} from './templates.service'

export const templateRoutes: FastifyPluginAsync = async (app) => {
  const prisma = app.prisma

  // ── NormParams ────────────────────────────────────────────────────────────

  app.get('/norm-params', {
    preHandler: [authenticate, requirePermission('template_view')],
  }, async (req) => {
    return listNormParams(prisma, req.currentUser.orgId)
  })

  app.post('/norm-params', {
    preHandler: [authenticate, requirePermission('template_manage')],
  }, async (req, reply) => {
    const data = CreateNormParamSchema.parse(req.body)
    const param = await createNormParam(prisma, req.currentUser.orgId, data)
    return reply.status(201).send(param)
  })

  app.put('/norm-params/:id', {
    preHandler: [authenticate, requirePermission('template_manage')],
  }, async (req) => {
    const { id } = req.params as { id: string }
    const data = UpdateNormParamSchema.parse(req.body)
    return updateNormParam(prisma, id, req.currentUser.orgId, data)
  })

  app.delete('/norm-params/:id', {
    preHandler: [authenticate, requirePermission('template_manage')],
  }, async (req, reply) => {
    const { id } = req.params as { id: string }
    await deleteNormParam(prisma, id, req.currentUser.orgId)
    return reply.status(204).send()
  })

  // ── Templates ─────────────────────────────────────────────────────────────

  app.get('/', {
    preHandler: [authenticate, requirePermission('template_view')],
  }, async (req) => {
    return listTemplates(prisma, req.currentUser.orgId)
  })

  app.get('/:id', {
    preHandler: [authenticate, requirePermission('template_view')],
  }, async (req) => {
    const { id } = req.params as { id: string }
    return getTemplate(prisma, id, req.currentUser.orgId)
  })

  app.post('/', {
    preHandler: [authenticate, requirePermission('template_manage')],
  }, async (req, reply) => {
    const data = CreateTemplateSchema.parse(req.body)
    const t = await createTemplate(prisma, req.currentUser.orgId, req.currentUser.sub, data)
    return reply.status(201).send(t)
  })

  app.put('/:id', {
    preHandler: [authenticate, requirePermission('template_manage')],
  }, async (req) => {
    const { id } = req.params as { id: string }
    const data = UpdateTemplateSchema.parse(req.body)
    return updateTemplate(prisma, id, req.currentUser.orgId, data)
  })

  app.delete('/:id', {
    preHandler: [authenticate, requirePermission('template_manage')],
  }, async (req, reply) => {
    const { id } = req.params as { id: string }
    await deleteTemplate(prisma, id, req.currentUser.orgId)
    return reply.status(204).send()
  })

  // ── Template Tasks ────────────────────────────────────────────────────────

  app.post('/:templateId/tasks', {
    preHandler: [authenticate, requirePermission('template_manage')],
  }, async (req, reply) => {
    const { templateId } = req.params as { templateId: string }
    const data = CreateTemplateTaskSchema.parse(req.body)
    const task = await createTemplateTask(prisma, templateId, req.currentUser.orgId, data)
    return reply.status(201).send(task)
  })

  app.put('/tasks/:taskId', {
    preHandler: [authenticate, requirePermission('template_manage')],
  }, async (req) => {
    const { taskId } = req.params as { taskId: string }
    const data = UpdateTemplateTaskSchema.parse(req.body)
    return updateTemplateTask(prisma, taskId, req.currentUser.orgId, data)
  })

  app.delete('/tasks/:taskId', {
    preHandler: [authenticate, requirePermission('template_manage')],
  }, async (req, reply) => {
    const { taskId } = req.params as { taskId: string }
    await deleteTemplateTask(prisma, taskId, req.currentUser.orgId)
    return reply.status(204).send()
  })

  // ── Dependencies ──────────────────────────────────────────────────────────

  app.post('/tasks/:taskId/dependencies', {
    preHandler: [authenticate, requirePermission('template_manage')],
  }, async (req, reply) => {
    const { taskId } = req.params as { taskId: string }
    const data = CreateTemplateDependencySchema.parse(req.body)
    const dep = await createTemplateDependency(prisma, taskId, req.currentUser.orgId, data)
    return reply.status(201).send(dep)
  })

  app.delete('/dependencies/:depId', {
    preHandler: [authenticate, requirePermission('template_manage')],
  }, async (req, reply) => {
    const { depId } = req.params as { depId: string }
    await deleteTemplateDependency(prisma, depId, req.currentUser.orgId)
    return reply.status(204).send()
  })

  // ── Documents ─────────────────────────────────────────────────────────────

  app.post('/:templateId/documents', {
    preHandler: [authenticate, requirePermission('template_manage')],
  }, async (req, reply) => {
    const { templateId } = req.params as { templateId: string }
    const data = CreateTemplateDocumentSchema.parse(req.body)
    const doc = await createTemplateDocument(prisma, templateId, req.currentUser.orgId, data)
    return reply.status(201).send(doc)
  })

  app.delete('/documents/:docId', {
    preHandler: [authenticate, requirePermission('template_manage')],
  }, async (req, reply) => {
    const { docId } = req.params as { docId: string }
    await deleteTemplateDocument(prisma, docId, req.currentUser.orgId)
    return reply.status(204).send()
  })

  // ── Phases (for picker) ───────────────────────────────────────────────────

  app.get('/:id/phases', {
    preHandler: [authenticate, requirePermission('template_view')],
  }, async (req) => {
    const { id } = req.params as { id: string }
    return getTemplatePhases(prisma, id, req.currentUser.orgId)
  })

  // ── Statistics ────────────────────────────────────────────────────────────

  app.get('/:id/stats', {
    preHandler: [authenticate, requirePermission('template_view')],
  }, async (req) => {
    const { id } = req.params as { id: string }
    return getTemplateStats(prisma, id, req.currentUser.orgId)
  })

  // ── Actualization ─────────────────────────────────────────────────────────

  app.get('/:id/actualization-suggestions', {
    preHandler: [authenticate, requirePermission('template_view')],
  }, async (req) => {
    const { id } = req.params as { id: string }
    // Get projects using this template and compute suggestions
    const usages = await prisma.projectTemplateUsage.findMany({
      where: { templateId: id },
      include: { project: { select: { id: true, isArchived: true, organizationId: true } } },
    })
    const archivedProjectIds = usages
      .filter(u => u.project.isArchived && u.project.organizationId === req.currentUser.orgId)
      .map(u => u.projectId)

    if (!archivedProjectIds.length) return []

    const allSuggestions = []
    for (const projectId of archivedProjectIds) {
      const s = await computeActualizationSuggestions(prisma, projectId, req.currentUser.orgId)
      if (s) allSuggestions.push(...s)
    }
    return allSuggestions
  })

  app.post('/:id/actualize', {
    preHandler: [authenticate, requirePermission('template_manage')],
  }, async (req) => {
    const { id } = req.params as { id: string }
    const data = ActualizeTemplateSchema.parse(req.body)
    await applyActualization(prisma, id, req.currentUser.orgId, data)
    return { success: true }
  })

  // Called when a project is archived
  app.post('/projects/:projectId/archive-stats', {
    preHandler: [authenticate],
  }, async (req, reply) => {
    const { projectId } = req.params as { projectId: string }
    await updateTemplateTaskStats(prisma, projectId, req.currentUser.orgId)
    return reply.status(204).send()
  })

  // ── Required params for pieces ────────────────────────────────────────────

  app.post('/collect-params', {
    preHandler: [authenticate, requirePermission('template_view')],
  }, async (req) => {
    const { templateIds } = req.body as { templateIds: string[] }
    return collectRequiredParams(prisma, req.currentUser.orgId, templateIds)
  })

  // ── Project phases (for analog picker) ───────────────────────────────────

  app.get('/project-phases/:projectId', {
    preHandler: [authenticate],
  }, async (req) => {
    const { projectId } = req.params as { projectId: string }
    return getProjectPhases(prisma, projectId, req.currentUser.orgId)
  })

  // ── Create from template ──────────────────────────────────────────────────

  app.post('/create-project', {
    preHandler: [authenticate, requirePermission('template_view')],
  }, async (req, reply) => {
    const data = CreateProjectFromTemplateSchema.parse(req.body)
    const project = await createProjectFromTemplate(prisma, req.currentUser.orgId, req.currentUser.sub, data)
    return reply.status(201).send(project)
  })

  // ── Assemble from pieces ──────────────────────────────────────────────────

  app.post('/assemble-project', {
    preHandler: [authenticate, requirePermission('template_view')],
  }, async (req, reply) => {
    const data = AssembleProjectSchema.parse(req.body)
    const project = await assembleProject(prisma, req.currentUser.orgId, req.currentUser.sub, data)
    return reply.status(201).send(project)
  })
}
