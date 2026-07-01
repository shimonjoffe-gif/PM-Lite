import 'dotenv/config'
import Fastify from 'fastify'
import { ZodTypeProvider, serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'
import fastifyJwt from '@fastify/jwt'
import fastifyCors from '@fastify/cors'
import prismaPlugin from './plugins/prisma'
import { authRoutes } from './modules/auth/auth.routes'
import { invitationsRoutes } from './modules/invitations/invitations.routes'
import { usersRoutes } from './modules/users/users.routes'
import { rolesRoutes } from './modules/roles/roles.routes'
import { orgRoutes } from './modules/org/org.routes'
import { analyticsRoutes } from './modules/analytics/analytics.routes'
import { aiSettingsRoutes } from './modules/ai-settings/ai-settings.routes'
import { projectsRoutes } from './modules/projects/projects.routes'
import { notificationsRoutes } from './modules/notifications/notifications.routes'
import { userPrefsRoutes } from './modules/user-prefs/user-prefs.routes'
import { tasksRoutes } from './modules/tasks/tasks.routes'
import { resourcesRoutes } from './modules/resources/resources.routes'
import { reportsRoutes } from './modules/reports/reports.routes'
import { aiRoutes } from './modules/ai/ai.routes'
import { templateRoutes } from './modules/templates/templates.routes'
import { effortRoutes } from './modules/effort/effort.routes'
import { documentTypesRoutes } from './modules/document-types/document-types.routes'
import { storageSettingsRoutes } from './modules/storage-settings/storage-settings.routes'
import { documentsRoutes } from './modules/documents/documents.routes'
import { docAccessRulesRoutes } from './modules/doc-access-rules/doc-access-rules.routes'
import { absenceRequestsRoutes } from './modules/absence-requests/absence-requests.routes'
import fastifyMultipart from '@fastify/multipart'
import { env } from './config/env'

async function buildApp() {
  const app = Fastify({ logger: true }).withTypeProvider<ZodTypeProvider>()

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  await app.register(fastifyCors, { origin: env.APP_URL, credentials: true })
  await app.register(fastifyJwt, { secret: env.JWT_SECRET })
  await app.register(prismaPlugin)
  await app.register(fastifyMultipart, { limits: { fileSize: 50 * 1024 * 1024 } })

  await app.register(authRoutes, { prefix: '/api/auth' })
  await app.register(invitationsRoutes, { prefix: '/api/invitations' })
  await app.register(usersRoutes, { prefix: '/api/users' })
  await app.register(rolesRoutes, { prefix: '/api/roles' })
  await app.register(orgRoutes, { prefix: '/api/org' })
  await app.register(analyticsRoutes, { prefix: '/api/analytics' })
  await app.register(aiSettingsRoutes, { prefix: '/api/ai' })
  await app.register(projectsRoutes, { prefix: '/api/projects' })
  await app.register(notificationsRoutes, { prefix: '/api/notifications' })
  await app.register(userPrefsRoutes, { prefix: '/api/user-prefs' })
  await app.register(tasksRoutes)
  await app.register(resourcesRoutes)
  await app.register(reportsRoutes)
  await app.register(aiRoutes, { prefix: '/api/ai' })
  await app.register(templateRoutes, { prefix: '/api/templates' })
  await app.register(effortRoutes, { prefix: '/api/effort' })
  await app.register(documentTypesRoutes, { prefix: '/api/document-types' })
  await app.register(storageSettingsRoutes, { prefix: '/api/storage-settings' })
  await app.register(documentsRoutes)
  await app.register(docAccessRulesRoutes, { prefix: '/api' })
  await app.register(absenceRequestsRoutes)

  app.get('/health', async () => ({ status: 'ok' }))

  return app
}

buildApp()
  .then(app => app.listen({ port: env.PORT, host: '0.0.0.0' }))
  .catch(err => { console.error(err); process.exit(1) })
