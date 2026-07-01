import { FastifyInstance } from 'fastify'
import fsp from 'fs/promises'
import { env } from '../config/env'

const VERSION = '1.0.0'

export async function healthRoutes(app: FastifyInstance) {
  app.get('/api/v1/health', async (_req, reply) => {
    let storageAvailableBytes: number | null = null
    try {
      const stat = await fsp.statfs(env.STORAGE_DIR)
      storageAvailableBytes = stat.bavail * stat.bsize
    } catch {
      // statfs not available on all platforms
    }

    return reply.send({
      status: 'ok',
      version: VERSION,
      ...(storageAvailableBytes !== null ? { storage_available_bytes: storageAvailableBytes } : {}),
    })
  })
}
