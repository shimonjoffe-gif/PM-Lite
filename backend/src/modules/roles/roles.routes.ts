import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { CreateRoleSchema, UpdateRoleSchema, RoleSchema } from './roles.schemas'
import { listRoles, createRole, updateRole, deleteRole } from './roles.service'
import { requireAdmin, authenticate } from '../../plugins/authenticate'
import { PERMISSION_GROUPS, PERMISSION_LABELS } from '../../utils/permissions'
import { JwtPayload } from '../../plugins/authenticate'

export const rolesRoutes: FastifyPluginAsyncZod = async (app) => {
  // Метаданные о разрешениях (для UI матрицы)
  app.get(
    '/meta',
    { preHandler: authenticate, schema: { response: { 200: z.any() } } },
    async (_request, reply) => {
      return reply.send({ groups: PERMISSION_GROUPS, labels: PERMISSION_LABELS })
    },
  )

  // GET /api/roles — список ролей организации
  app.get(
    '/',
    { preHandler: authenticate, schema: { response: { 200: z.array(RoleSchema) } } },
    async (request, reply) => {
      const { orgId } = request.currentUser as JwtPayload
      return reply.send(await listRoles(app.prisma, orgId))
    },
  )

  // POST /api/roles — создать кастомную роль (только admin)
  app.post(
    '/',
    { preHandler: requireAdmin, schema: { body: CreateRoleSchema, response: { 201: RoleSchema } } },
    async (request, reply) => {
      try {
        const { orgId } = request.currentUser as JwtPayload
        const role = await createRole(app.prisma, orgId, request.body)
        return reply.status(201).send({
          id: role.id,
          name: role.name,
          description: role.description,
          isSystem: role.isSystem,
          permissions: role.permissions.map(p => p.permission),
          userCount: role._count.users,
        })
      } catch (err: any) {
        return reply.status(err.statusCode ?? 500).send({ error: err.message })
      }
    },
  )

  // PATCH /api/roles/:id — обновить роль (только admin)
  app.patch(
    '/:id',
    { preHandler: requireAdmin, schema: { params: z.object({ id: z.string() }), body: UpdateRoleSchema, response: { 200: RoleSchema } } },
    async (request, reply) => {
      try {
        const { orgId } = request.currentUser as JwtPayload
        const role = await updateRole(app.prisma, orgId, request.params.id, request.body)
        return reply.send({
          id: role.id,
          name: role.name,
          description: role.description,
          isSystem: role.isSystem,
          permissions: role.permissions.map(p => p.permission),
          userCount: role._count.users,
        })
      } catch (err: any) {
        return reply.status(err.statusCode ?? 500).send({ error: err.message })
      }
    },
  )

  // DELETE /api/roles/:id — удалить кастомную роль (только admin)
  app.delete(
    '/:id',
    { preHandler: requireAdmin, schema: { params: z.object({ id: z.string() }), response: { 200: z.object({ message: z.string() }) } } },
    async (request, reply) => {
      try {
        const { orgId } = request.currentUser as JwtPayload
        await deleteRole(app.prisma, orgId, request.params.id)
        return reply.send({ message: 'Роль удалена' })
      } catch (err: any) {
        return reply.status(err.statusCode ?? 500).send({ error: err.message })
      }
    },
  )
}
