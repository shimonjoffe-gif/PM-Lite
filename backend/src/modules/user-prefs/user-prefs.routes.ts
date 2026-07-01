import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { ColumnPrefsSchema, UpdateColumnPrefsSchema } from './user-prefs.schemas'
import { getColumnPrefs, setColumnPrefs } from './user-prefs.service'
import { authenticate } from '../../plugins/authenticate'

const tableParam = z.object({ table: z.string().min(1) })

export const userPrefsRoutes: FastifyPluginAsyncZod = async (app) => {
  // GET /api/user-prefs/columns/:table
  app.get(
    '/columns/:table',
    { preHandler: authenticate, schema: { params: tableParam, response: { 200: ColumnPrefsSchema } } },
    async (req, reply) => {
      const prefs = await getColumnPrefs(app.prisma, req.currentUser.sub, req.params.table)
      return reply.send(prefs)
    },
  )

  // PUT /api/user-prefs/columns/:table
  app.put(
    '/columns/:table',
    {
      preHandler: authenticate,
      schema: { params: tableParam, body: UpdateColumnPrefsSchema, response: { 200: ColumnPrefsSchema } },
    },
    async (req, reply) => {
      try {
        const prefs = await setColumnPrefs(app.prisma, req.currentUser.sub, req.params.table, req.body.columns)
        return reply.send(prefs)
      } catch (err: any) {
        return reply.status(err.statusCode ?? 500).send({ error: err.message })
      }
    },
  )
}
