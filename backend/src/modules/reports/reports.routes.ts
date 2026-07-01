import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { authenticate } from '../../plugins/authenticate'
import {
  ReportFiltersSchema,
  SaveReportSchema,
  ExportQuerySchema,
  ReportTypeEnum,
} from './reports.schemas'
import {
  getProjectsSummary,
  getTeamLoad,
  getTasksCompletion,
  getBillableStages,
  canViewOrgReports,
  exportToExcel,
  exportToPdf,
} from './reports.service'

const REPORT_TITLES: Record<string, string> = {
  projects_summary: 'Сводка по проектам',
  team_load: 'Загрузка команды',
  tasks_completion: 'Выполнение задач',
  billable_stages: 'Актируемые этапы',
}

async function getReportData(
  prisma: any,
  reportType: string,
  user: any,
  filters: any,
) {
  switch (reportType) {
    case 'projects_summary':
      return getProjectsSummary(prisma, user.orgId, user.id, user.isAdmin, filters)
    case 'team_load':
      return getTeamLoad(prisma, user.orgId, user.id, user.isAdmin, user.orgRoleId ?? null, filters)
    case 'tasks_completion':
      return getTasksCompletion(prisma, user.orgId, user.id, user.isAdmin, filters)
    case 'billable_stages':
      return getBillableStages(prisma, user.orgId, user.id, user.isAdmin, filters)
    default:
      throw new Error('Unknown report type')
  }
}

export const reportsRoutes: FastifyPluginAsyncZod = async (app) => {
  // ── Report data endpoints ────────────────────────────────────────────────────

  app.get('/api/reports/projects-summary', {
    preHandler: [authenticate],
    schema: { querystring: ReportFiltersSchema },
  }, async (req, reply) => {
    const user = req.user as any
    const canView = await canViewOrgReports(req.server.prisma, user.id, user.orgId, user.isAdmin, user.orgRoleId ?? null)
    if (!canView) return reply.status(403).send({ message: 'Доступ запрещён' })
    return getProjectsSummary(req.server.prisma, user.orgId, user.id, user.isAdmin, req.query)
  })

  app.get('/api/reports/team-load', {
    preHandler: [authenticate],
    schema: { querystring: ReportFiltersSchema },
  }, async (req, reply) => {
    const user = req.user as any
    const canView = await canViewOrgReports(req.server.prisma, user.id, user.orgId, user.isAdmin, user.orgRoleId ?? null)
    if (!canView) return reply.status(403).send({ message: 'Доступ запрещён' })
    return getTeamLoad(req.server.prisma, user.orgId, user.id, user.isAdmin, user.orgRoleId ?? null, req.query)
  })

  app.get('/api/reports/tasks-completion', {
    preHandler: [authenticate],
    schema: { querystring: ReportFiltersSchema },
  }, async (req) => {
    const user = req.user as any
    return getTasksCompletion(req.server.prisma, user.orgId, user.id, user.isAdmin, req.query)
  })

  app.get('/api/reports/billable-stages', {
    preHandler: [authenticate],
    schema: { querystring: ReportFiltersSchema },
  }, async (req) => {
    const user = req.user as any
    return getBillableStages(req.server.prisma, user.orgId, user.id, user.isAdmin, req.query)
  })

  // Project-scoped versions (for the project Reports tab)
  app.get('/api/projects/:projectId/reports/tasks-completion', {
    preHandler: [authenticate],
    schema: {
      params: z.object({ projectId: z.string().uuid() }),
      querystring: ReportFiltersSchema,
    },
  }, async (req) => {
    const user = req.user as any
    return getTasksCompletion(req.server.prisma, user.orgId, user.id, user.isAdmin, {
      ...req.query,
      projectId: req.params.projectId,
    })
  })

  app.get('/api/projects/:projectId/reports/billable-stages', {
    preHandler: [authenticate],
    schema: {
      params: z.object({ projectId: z.string().uuid() }),
      querystring: ReportFiltersSchema,
    },
  }, async (req) => {
    const user = req.user as any
    return getBillableStages(req.server.prisma, user.orgId, user.id, user.isAdmin, {
      ...req.query,
      projectId: req.params.projectId,
    })
  })

  // ── Export ───────────────────────────────────────────────────────────────────

  app.get('/api/reports/export', {
    preHandler: [authenticate],
    schema: { querystring: ExportQuerySchema },
  }, async (req, reply) => {
    const user = req.user as any
    const { format, reportType, ...filters } = req.query

    const data = await getReportData(req.server.prisma, reportType, user, filters)
    const title = REPORT_TITLES[reportType] ?? 'Отчёт'

    if (format === 'xlsx') {
      const buf = await exportToExcel(data, reportType, title)
      reply
        .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        .header('Content-Disposition', `attachment; filename="${reportType}_${new Date().toISOString().slice(0, 10)}.xlsx"`)
      return reply.send(buf)
    } else {
      const buf = await exportToPdf(data, reportType, title)
      reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `attachment; filename="${reportType}_${new Date().toISOString().slice(0, 10)}.pdf"`)
      return reply.send(buf)
    }
  })

  // ── Saved Reports ────────────────────────────────────────────────────────────

  app.get('/api/reports/saved', {
    preHandler: [authenticate],
  }, async (req) => {
    const user = req.user as any
    return req.server.prisma.savedReport.findMany({
      where: { organizationId: user.orgId, userId: user.id },
      orderBy: { updatedAt: 'desc' },
    })
  })

  app.post('/api/reports/saved', {
    preHandler: [authenticate],
    schema: { body: SaveReportSchema },
  }, async (req) => {
    const user = req.user as any
    return req.server.prisma.savedReport.create({
      data: {
        organizationId: user.orgId,
        userId: user.id,
        name: req.body.name,
        reportType: req.body.reportType as any,
        filters: req.body.filters as any,
      },
    })
  })

  app.delete('/api/reports/saved/:id', {
    preHandler: [authenticate],
    schema: { params: z.object({ id: z.string().uuid() }) },
  }, async (req, reply) => {
    const user = req.user as any
    const report = await req.server.prisma.savedReport.findFirst({
      where: { id: req.params.id, userId: user.id },
    })
    if (!report) return reply.status(404).send({ message: 'Не найдено' })
    await req.server.prisma.savedReport.delete({ where: { id: req.params.id } })
    return { ok: true }
  })
}
