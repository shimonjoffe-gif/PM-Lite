import { PrismaClient } from '@prisma/client'
import { createHash } from 'crypto'
import { checkPluginHealth } from '../../utils/storage'

function hashKey(key: string) {
  return createHash('sha256').update(key).digest('hex')
}

function mapSettings(s: any) {
  return {
    id: s.id,
    organizationId: s.organizationId,
    storageMode: s.storageMode,
    pluginUrl: s.pluginUrl ?? null,
    pluginVerifiedAt: s.pluginVerifiedAt?.toISOString() ?? null,
    pluginVersion: s.pluginVersion ?? null,
    updatedAt: s.updatedAt.toISOString(),
  }
}

export async function getStorageSettings(prisma: PrismaClient, orgId: string) {
  let settings = await prisma.storageProviderSetting.findUnique({ where: { organizationId: orgId } })
  if (!settings) {
    settings = await prisma.storageProviderSetting.create({ data: { organizationId: orgId } })
  }
  return mapSettings(settings)
}

export async function updateStorageSettings(
  prisma: PrismaClient,
  orgId: string,
  data: { storageMode?: 'cloud' | 'external'; pluginUrl?: string | null; pluginApiKey?: string | null },
) {
  const updateData: Record<string, any> = { updatedAt: new Date() }
  if (data.storageMode !== undefined) updateData.storageMode = data.storageMode
  if (data.pluginUrl !== undefined) updateData.pluginUrl = data.pluginUrl
  if (data.pluginApiKey !== undefined) {
    updateData.pluginApiKeyHash = data.pluginApiKey ? hashKey(data.pluginApiKey) : null
    // Reset verification on key change
    updateData.pluginVerifiedAt = null
    updateData.pluginVersion = null
  }

  const settings = await prisma.storageProviderSetting.upsert({
    where: { organizationId: orgId },
    update: updateData,
    create: { organizationId: orgId, ...updateData },
  })
  return mapSettings(settings)
}

export async function verifyPlugin(prisma: PrismaClient, orgId: string, apiKey: string) {
  const settings = await prisma.storageProviderSetting.findUnique({ where: { organizationId: orgId } })
  if (!settings?.pluginUrl) {
    throw Object.assign(new Error('URL плагина не настроен'), { statusCode: 400 })
  }

  // Validate API key matches stored hash
  if (settings.pluginApiKeyHash && hashKey(apiKey) !== settings.pluginApiKeyHash) {
    throw Object.assign(new Error('Неверный API-ключ'), { statusCode: 401 })
  }

  const { version } = await checkPluginHealth(settings.pluginUrl, apiKey)

  await prisma.storageProviderSetting.update({
    where: { organizationId: orgId },
    data: { pluginVerifiedAt: new Date(), pluginVersion: version },
  })

  return { ok: true, version }
}

export async function getStorageConfig(
  prisma: PrismaClient,
  orgId: string,
): Promise<{ mode: 'cloud' | 'external'; pluginUrl: string | null; pluginApiKeyHash: string | null }> {
  const s = await prisma.storageProviderSetting.findUnique({ where: { organizationId: orgId } })
  return {
    mode: (s?.storageMode ?? 'cloud') as 'cloud' | 'external',
    pluginUrl: s?.pluginUrl ?? null,
    pluginApiKeyHash: s?.pluginApiKeyHash ?? null,
  }
}
