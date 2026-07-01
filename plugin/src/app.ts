import 'dotenv/config'
import Fastify from 'fastify'
import fastifyMultipart from '@fastify/multipart'
import { env } from './config/env'
import { healthRoutes } from './routes/health.routes'
import { filesRoutes } from './routes/files.routes'

async function buildApp() {
  const app = Fastify({ logger: true })

  await app.register(fastifyMultipart, { limits: { fileSize: 500 * 1024 * 1024 } }) // 500 MB

  await app.register(healthRoutes)
  await app.register(filesRoutes)

  return app
}

buildApp()
  .then(app => app.listen({ port: env.PORT, host: '0.0.0.0' }))
  .catch(err => { console.error(err); process.exit(1) })
