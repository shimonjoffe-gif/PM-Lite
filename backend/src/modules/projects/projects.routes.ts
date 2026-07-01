import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import {
  ProjectSchema,
  ProjectListResponseSchema,
  ProjectAggregatesSchema,
  ProjectMemberSchema,
  CreateProjectSchema,
  UpdateProjectSchema,
  ListProjectsQuerySchema,
  AddMemberSchema,
  UpdateMemberSchema,
  DelegateProjectSchema,
} from './projects.schemas'
import {
  listProjects,
  getProjectAggregates,
  getProject,
  createProject,
  updateProject,
  archiveProject,
  unarchiveProject,
  delegateProject,
  listMembers,
  addMember,
  updateMember,
  removeMember,
  assertProjectAccess,
} from './projects.service'
import { authenticate, requirePermission } from '../../plugins/authenticate'

const idParam = z.object({ id: z.string().uuid() })
const memberParam = z.object({ id: z.string().uuid(), userId: z.string().uuid() })
const msgOk = z.object({ message: z.string() })

export const projectsRoutes: FastifyPluginAsyncZod = async (app) => {
  // ─── List ───────────────────────────────────────────────────────────────────

  app.get(
    '/',
    {
      preHandler: requirePermission('project_view'),
      schema: { querystring: ListProjectsQuerySchema, response: { 200: ProjectListResponseSchema } },
    },
    async (req, reply) => {
      const { status, owner, client, search, archived, page } = req.query
      const result = await listProjects(
        app.prisma,
        req.currentUser.orgId,
        {
          statusId: status,
          ownerId: owner,
          clientId: client,
          search,
          archived: archived === 'true',
        },
        page,
      )
      return reply.send(result)
    },
  )

  // ─── Aggregates ─────────────────────────────────────────────────────────────

  app.get(
    '/aggregates',
    {
      preHandler: requirePermission('project_view'),
      schema: {
        querystring: ListProjectsQuerySchema.omit({ page: true }),
        response: { 200: ProjectAggregatesSchema },
      },
    },
    async (req, reply) => {
      const { status, owner, client, search, archived } = req.query
      const result = await getProjectAggregates(
        app.prisma,
        req.currentUser.orgId,
        { statusId: status, ownerId: owner, clientId: client, search, archived: archived === 'true' },
      )
      return reply.send(result)
    },
  )

  // ─── Create ─────────────────────────────────────────────────────────────────

  app.post(
    '/',
    {
      preHandler: requirePermission('project_create'),
      schema: { body: CreateProjectSchema, response: { 201: ProjectSchema } },
    },
    async (req, reply) => {
      try {
        const project = await createProject(app.prisma, req.currentUser.orgId, req.currentUser.sub, req.body)
        return reply.status(201).send(project)
      } catch (err: any) {
        return reply.status(err.statusCode ?? 500).send({ error: err.message })
      }
    },
  )

  // ─── Single project ─────────────────────────────────────────────────────────

  app.get(
    '/:id',
    {
      preHandler: authenticate,
      schema: { params: idParam },
    },
    async (req, reply) => {
      try {
        await assertProjectAccess(app.prisma, req.currentUser.orgId, req.params.id, req.currentUser.sub, req.currentUser.isAdmin)
        const project = await getProject(app.prisma, req.currentUser.orgId, req.params.id)
        return reply.send(project)
      } catch (err: any) {
        return reply.status(err.statusCode ?? 500).send({ error: err.message })
      }
    },
  )

  // ─── Update ─────────────────────────────────────────────────────────────────

  app.patch(
    '/:id',
    {
      preHandler: requirePermission('project_edit'),
      schema: { params: idParam, body: UpdateProjectSchema },
    },
    async (req, reply) => {
      try {
        await assertProjectAccess(app.prisma, req.currentUser.orgId, req.params.id, req.currentUser.sub, req.currentUser.isAdmin, 'admin')
        const project = await updateProject(app.prisma, req.currentUser.orgId, req.params.id, req.body)
        return reply.send(project)
      } catch (err: any) {
        return reply.status(err.statusCode ?? 500).send({ error: err.message })
      }
    },
  )

  // ─── Archive / Unarchive ────────────────────────────────────────────────────

  app.post(
    '/:id/archive',
    {
      preHandler: requirePermission('project_archive'),
      schema: { params: idParam, response: { 200: msgOk } },
    },
    async (req, reply) => {
      try {
        await archiveProject(app.prisma, req.currentUser.orgId, req.params.id, req.currentUser.sub, req.currentUser.isAdmin)
        return reply.send({ message: 'Проект архивирован' })
      } catch (err: any) {
        return reply.status(err.statusCode ?? 500).send({ error: err.message })
      }
    },
  )

  app.post(
    '/:id/unarchive',
    {
      preHandler: requirePermission('project_archive'),
      schema: { params: idParam, response: { 200: msgOk } },
    },
    async (req, reply) => {
      try {
        await unarchiveProject(app.prisma, req.currentUser.orgId, req.params.id, req.currentUser.sub, req.currentUser.isAdmin)
        return reply.send({ message: 'Проект восстановлен из архива' })
      } catch (err: any) {
        return reply.status(err.statusCode ?? 500).send({ error: err.message })
      }
    },
  )

  // ─── Delegation ─────────────────────────────────────────────────────────────

  app.post(
    '/:id/delegate',
    {
      preHandler: authenticate,
      schema: { params: idParam, body: DelegateProjectSchema, response: { 200: msgOk } },
    },
    async (req, reply) => {
      try {
        await delegateProject(
          app.prisma,
          req.currentUser.orgId,
          req.params.id,
          req.currentUser.sub,
          req.currentUser.isAdmin,
          req.body.newOwnerId,
        )
        return reply.send({ message: 'Проект передан новому владельцу' })
      } catch (err: any) {
        return reply.status(err.statusCode ?? 500).send({ error: err.message })
      }
    },
  )

  // ─── Members ────────────────────────────────────────────────────────────────

  app.get(
    '/:id/members',
    {
      preHandler: authenticate,
      schema: { params: idParam, response: { 200: z.array(ProjectMemberSchema) } },
    },
    async (req, reply) => {
      try {
        await assertProjectAccess(app.prisma, req.currentUser.orgId, req.params.id, req.currentUser.sub, req.currentUser.isAdmin)
        const members = await listMembers(app.prisma, req.params.id)
        return reply.send(members)
      } catch (err: any) {
        return reply.status(err.statusCode ?? 500).send({ error: err.message })
      }
    },
  )

  app.post(
    '/:id/members',
    {
      preHandler: authenticate,
      schema: { params: idParam, body: AddMemberSchema, response: { 201: ProjectMemberSchema } },
    },
    async (req, reply) => {
      try {
        await assertProjectAccess(app.prisma, req.currentUser.orgId, req.params.id, req.currentUser.sub, req.currentUser.isAdmin, 'admin')
        const member = await addMember(app.prisma, req.currentUser.orgId, req.params.id, req.body.userId, req.body.role)
        return reply.status(201).send(member)
      } catch (err: any) {
        return reply.status(err.statusCode ?? 500).send({ error: err.message })
      }
    },
  )

  app.patch(
    '/:id/members/:userId',
    {
      preHandler: authenticate,
      schema: { params: memberParam, body: UpdateMemberSchema, response: { 200: ProjectMemberSchema } },
    },
    async (req, reply) => {
      try {
        await assertProjectAccess(app.prisma, req.currentUser.orgId, req.params.id, req.currentUser.sub, req.currentUser.isAdmin, 'admin')
        const member = await updateMember(app.prisma, req.params.id, req.params.userId, req.body.role)
        return reply.send(member)
      } catch (err: any) {
        return reply.status(err.statusCode ?? 500).send({ error: err.message })
      }
    },
  )

  app.delete(
    '/:id/members/:userId',
    {
      preHandler: authenticate,
      schema: { params: memberParam, response: { 200: msgOk } },
    },
    async (req, reply) => {
      try {
        await assertProjectAccess(app.prisma, req.currentUser.orgId, req.params.id, req.currentUser.sub, req.currentUser.isAdmin, 'admin')
        await removeMember(app.prisma, req.params.id, req.params.userId)
        return reply.send({ message: 'Участник удалён' })
      } catch (err: any) {
        return reply.status(err.statusCode ?? 500).send({ error: err.message })
      }
    },
  )
}
