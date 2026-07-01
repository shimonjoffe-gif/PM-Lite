import { FastifyInstance } from 'fastify'
import fsp from 'fs/promises'
import fs from 'fs'
import path from 'path'
import { createHash, randomUUID } from 'crypto'
import { env } from '../config/env'

function authGuard(req: any, reply: any) {
  const header = req.headers['authorization'] ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (token !== env.API_KEY) {
    reply.status(401).send({ error: 'Unauthorized' })
    return false
  }
  return true
}

function filePath(id: string, fileName: string) {
  return path.join(env.STORAGE_DIR, `${id}_${path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, '_')}`)
}

// Index file: maps id → {fileName, mimeType}
const INDEX_FILE = () => path.join(env.STORAGE_DIR, '.index.json')

async function loadIndex(): Promise<Record<string, { fileName: string; mimeType: string }>> {
  try {
    const raw = await fsp.readFile(INDEX_FILE(), 'utf8')
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

async function saveIndex(index: Record<string, { fileName: string; mimeType: string }>) {
  await fsp.writeFile(INDEX_FILE(), JSON.stringify(index, null, 2))
}

export async function filesRoutes(app: FastifyInstance) {
  await fsp.mkdir(env.STORAGE_DIR, { recursive: true })

  // ─── Upload ────────────────────────────────────────────────────────────────

  app.post('/api/v1/files', async (req, reply) => {
    if (!authGuard(req, reply)) return

    try {
      const parts = (req as any).parts()
      let fileBuffer: Buffer | null = null
      let fileName = 'file'
      let mimeType = 'application/octet-stream'
      let metadata: Record<string, string> = {}

      for await (const part of parts) {
        if (part.type === 'file') {
          fileBuffer = await part.toBuffer()
          fileName = part.filename || 'file'
          mimeType = part.mimetype || 'application/octet-stream'
        } else {
          if (part.fieldname === 'metadata') {
            try { metadata = JSON.parse(part.value as string) } catch { /* ignore */ }
          }
        }
      }

      if (!fileBuffer) return reply.status(400).send({ error: 'File is required' })

      const id = randomUUID()
      const fp = filePath(id, fileName)
      await fsp.writeFile(fp, fileBuffer)

      const checksum = 'sha256:' + createHash('sha256').update(fileBuffer).digest('hex')

      const index = await loadIndex()
      index[id] = { fileName, mimeType }
      await saveIndex(index)

      const baseUrl = `http://${req.hostname}:${env.PORT}`

      return reply.status(201).send({
        id,
        url: `${baseUrl}/api/v1/files/${id}/download`,
        checksum,
        stored_at: new Date().toISOString(),
      })
    } catch (err: any) {
      app.log.error(err)
      return reply.status(500).send({ error: err.message })
    }
  })

  // ─── Download ──────────────────────────────────────────────────────────────

  app.get('/api/v1/files/:id/download', async (req: any, reply) => {
    if (!authGuard(req, reply)) return

    const { id } = req.params
    const index = await loadIndex()
    const meta = index[id]
    if (!meta) return reply.status(404).send({ error: 'Not found' })

    const fp = filePath(id, meta.fileName)
    try {
      await fsp.access(fp)
    } catch {
      return reply.status(404).send({ error: 'File not found on disk' })
    }

    reply.header('Content-Type', meta.mimeType)
    reply.header('Content-Disposition', `attachment; filename="${encodeURIComponent(meta.fileName)}"`)
    return reply.send(fs.createReadStream(fp))
  })

  // ─── Delete ────────────────────────────────────────────────────────────────

  app.delete('/api/v1/files/:id', async (req: any, reply) => {
    if (!authGuard(req, reply)) return

    const { id } = req.params
    const index = await loadIndex()
    const meta = index[id]

    if (meta) {
      const fp = filePath(id, meta.fileName)
      await fsp.unlink(fp).catch(() => {})
      delete index[id]
      await saveIndex(index)
    }

    return reply.status(204).send()
  })
}
