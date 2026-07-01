import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'
import { createHash } from 'crypto'
import { env } from '../config/env'

// ─── Cloud (local disk) ───────────────────────────────────────────────────────

export async function saveToCloud(
  buffer: Buffer,
  orgId: string,
  docId: string,
  versionId: string,
  fileName: string,
): Promise<{ storagePath: string; checksum: string }> {
  const dir = path.join(env.UPLOADS_DIR, orgId, docId)
  await fsp.mkdir(dir, { recursive: true })

  const safeFileName = path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, '_')
  const relativePath = path.join(orgId, docId, `${versionId}_${safeFileName}`)
  const fullPath = path.join(env.UPLOADS_DIR, relativePath)

  await fsp.writeFile(fullPath, buffer)

  const checksum = createHash('sha256').update(buffer).digest('hex')
  return { storagePath: relativePath, checksum }
}

export function createCloudReadStream(storagePath: string): fs.ReadStream {
  const fullPath = path.join(env.UPLOADS_DIR, storagePath)
  return fs.createReadStream(fullPath)
}

export async function deleteFromCloud(storagePath: string): Promise<void> {
  const fullPath = path.join(env.UPLOADS_DIR, storagePath)
  await fsp.unlink(fullPath).catch(() => {})
}

// ─── External plugin ──────────────────────────────────────────────────────────

interface PluginUploadResult {
  externalId: string
  externalUrl: string
  checksum: string
}

export async function uploadToPlugin(
  pluginUrl: string,
  apiKey: string,
  buffer: Buffer,
  metadata: { documentId: string; orgId: string; fileName: string; mimeType: string },
): Promise<PluginUploadResult> {
  const boundary = `----FormBoundary${Date.now()}`
  const metaJson = JSON.stringify(metadata)

  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="metadata"\r\n\r\n` +
      `${metaJson}\r\n`,
    ),
    Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${metadata.fileName}"\r\n` +
      `Content-Type: ${metadata.mimeType || 'application/octet-stream'}\r\n\r\n`,
    ),
    buffer,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ])

  const res = await fetch(`${pluginUrl}/api/v1/files`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Plugin upload failed (${res.status}): ${text}`)
  }

  const data = (await res.json()) as { id: string; url: string; checksum: string }
  return { externalId: data.id, externalUrl: data.url, checksum: data.checksum }
}

export async function downloadFromPlugin(
  pluginUrl: string,
  apiKey: string,
  externalId: string,
): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
  const res = await fetch(`${pluginUrl}/api/v1/files/${externalId}/download`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })

  if (!res.ok) throw new Error(`Plugin download failed (${res.status})`)

  const contentType = res.headers.get('content-type') ?? 'application/octet-stream'
  const disposition = res.headers.get('content-disposition') ?? ''
  const nameMatch = disposition.match(/filename="?([^";]+)"?/)
  const fileName = nameMatch ? nameMatch[1] : externalId

  const arrayBuffer = await res.arrayBuffer()
  return { buffer: Buffer.from(arrayBuffer), mimeType: contentType, fileName }
}

export async function deleteFromPlugin(
  pluginUrl: string,
  apiKey: string,
  externalId: string,
): Promise<void> {
  const res = await fetch(`${pluginUrl}/api/v1/files/${externalId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!res.ok && res.status !== 404) {
    throw new Error(`Plugin delete failed (${res.status})`)
  }
}

export async function checkPluginHealth(
  pluginUrl: string,
  apiKey: string,
): Promise<{ version: string }> {
  const res = await fetch(`${pluginUrl}/api/v1/health`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!res.ok) throw new Error(`Plugin health check failed (${res.status})`)
  const data = (await res.json()) as { status: string; version: string }
  if (data.status !== 'ok') throw new Error('Plugin returned non-ok status')
  return { version: data.version }
}
