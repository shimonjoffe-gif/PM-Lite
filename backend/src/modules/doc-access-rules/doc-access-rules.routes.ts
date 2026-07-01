import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { authenticate, requireAdmin } from '../../plugins/authenticate'
import { AccessRuleSchema, UpsertAccessRulesSchema } from './doc-access-rules.schemas'
import {
  getOrgAccessRules,
  upsertOrgAccessRules,
  getProjectAccessRules,
  upsertProjectAccessRules,
} from './doc-access-rules.service'
import { assertProjectAccess } from '../projects/projects.service'

const idParam = z.object({ id: z.string().uuid() })

export const docAccessRulesRoutes: FastifyPluginAsyncZod = async (app) => {
  // ─── Org-level defaults ────────────────────────────────────────────────────

  app.get(
    '/org/doc-access-rules',
    {
      preHandler: requireAdmin,
      schema: { response: { 200: z.array(AccessRuleSchema) } },
    },
    async (req, reply) => {
      const rules = await getOrgAccessRules(app.prisma, req.currentUser.orgId)
      return reply.send(rules)
    },
  )

  app.put(
    '/org/doc-access-rules',
    {
      preHandler: requireAdmin,
      schema: { body: UpsertAccessRulesSchema, response: { 200: z.array(AccessRuleSchema) } },
    },
    async (req, reply) => {
      const rules = await upsertOrgAccessRules(app.prisma, req.currentUser.orgId, req.body.rules)
      return reply.send(rules)
    },
  )

  // ─── Project-level overrides ───────────────────────────────────────────────

  app.get(
    '/projects/:id/doc-access-rules',
    {
      preHandler: authenticate,
      schema: { params: idParam, response: { 200: z.array(AccessRuleSchema) } },
    },
    async (req, reply) => {
      try {
        await assertProjectAccess(
          app.prisma, req.currentUser.orgId, req.params.id,
          req.currentUser.sub, req.currentUser.isAdmin, 'admin',
        )
        const rules = await getProjectAccessRules(app.prisma, req.currentUser.orgId, req.params.id)
        return reply.send(rules)
      } catch (err: any) {
        return reply.status(err.statusCode ?? 500).send({ error: err.message })
      }
    },
  )

  app.put(
    '/projects/:id/doc-access-rules',
    {
      preHandler: authenticate,
      schema: { params: idParam, body: UpsertAccessRulesSchema, response: { 200: z.array(AccessRuleSchema) } },
    },
    async (req, reply) => {
      try {
        await assertProjectAccess(
          app.prisma, req.currentUser.orgId, req.params.id,
          req.currentUser.sub, req.currentUser.isAdmin, 'admin',
        )
        const rules = await upsertProjectAccessRules(
          app.prisma, req.currentUser.orgId, req.params.id, req.body.rules,
        )
        return reply.send(rules)
      } catch (err: any) {
        return reply.status(err.statusCode ?? 500).send({ error: err.message })
      }
    },
  )
}
