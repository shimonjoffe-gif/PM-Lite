import { PrismaClient, DocumentParentType, StorageMode } from '@prisma/client'
import { saveToCloud, uploadToPlugin, deleteFromCloud, deleteFromPlugin } from '../../utils/storage'
import { getStorageConfig } from '../storage-settings/storage-settings.service'

// ─── Access resolution ────────────────────────────────────────────────────────

export async function resolveAccess(
  prisma: PrismaClient,
  orgId: string,
  isAdmin: boolean,
  orgRoleId: string | null,
  documentTypeId: string,
  projectId: string | null,
): Promise<{ canView: boolean; canUpload: boolean }> {
  if (isAdmin) return { canView: true, canUpload: true }
  if (!orgRoleId) return { canView: false, canUpload: false }

  const rules = await prisma.documentAccessRule.findMany({
    where: {
      organizationId: orgId,
      orgRoleId,
      OR: [
        ...(projectId
          ? [
              { projectId, documentTypeId },
              { projectId, documentTypeId: null },
            ]
          : []),
        { projectId: null, documentTypeId },
        { projectId: null, documentTypeId: null },
      ],
    },
  })

  if (rules.length === 0) return { canView: true, canUpload: false }

  const priority = (r: { projectId: string | null; documentTypeId: string | null }) => {
    if (r.projectId && r.documentTypeId) return 0
    if (r.projectId) return 1
    if (r.documentTypeId) return 2
    return 3
  }

  rules.sort((a, b) => priority(a) - priority(b))
  const best = rules[0]
  return { canView: best.canView, canUpload: best.canUpload }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mapVersion(v: any) {
  return {
    id: v.id,
    documentId: v.documentId,
    versionNumber: v.versionNumber,
    fileName: v.fileName,
    fileSize: v.fileSize !== null ? Number(v.fileSize) : null,
    mimeType: v.mimeType ?? null,
    comment: v.comment ?? null,
    createdBy: v.createdBy,
    createdByName: v.creator?.fullName ?? '',
    createdAt: v.createdAt.toISOString(),
  }
}

const docSelect = {
  id: true,
  organizationId: true,
  title: true,
  description: true,
  documentTypeId: true,
  documentType: { select: { name: true, category: { select: { code: true } } } },
  parentType: true,
  parentId: true,
  projectId: true,
  createdBy: true,
  creator: { select: { fullName: true } },
  createdAt: true,
  updatedAt: true,
  versions: {
    select: {
      id: true,
      documentId: true,
      versionNumber: true,
      fileName: true,
      fileSize: true,
      mimeType: true,
      comment: true,
      createdBy: true,
      creator: { select: { fullName: true } },
      createdAt: true,
    },
    orderBy: { versionNumber: 'desc' as const },
  },
}

function mapDoc(d: any) {
  const versions = d.versions ?? []
  const latest = versions[0] ?? null
  return {
    id: d.id,
    organizationId: d.organizationId,
    title: d.title,
    description: d.description ?? null,
    documentTypeId: d.documentTypeId,
    documentTypeName: d.documentType.name,
    documentTypeCategoryCode: d.documentType.category.code,
    parentType: d.parentType,
    parentId: d.parentId,
    projectId: d.projectId ?? null,
    latestVersion: latest ? mapVersion(latest) : null,
    versionsCount: versions.length,
    createdBy: d.createdBy,
    createdByName: d.creator?.fullName ?? '',
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  }
}

// Resolve projectId from parent entity for denormalization
async function resolveProjectId(
  prisma: PrismaClient,
  orgId: string,
  parentType: DocumentParentType,
  parentId: string,
): Promise<string | null> {
  if (parentType === 'project') {
    const p = await prisma.project.findFirst({ where: { id: parentId, organizationId: orgId } })
    if (!p) throw Object.assign(new Error('Проект не найден'), { statusCode: 404 })
    return parentId
  }
  if (parentType === 'task') {
    const t = await prisma.task.findUnique({ where: { id: parentId }, select: { projectId: true } })
    if (!t) throw Object.assign(new Error('Задача не найдена'), { statusCode: 404 })
    const p = await prisma.project.findFirst({ where: { id: t.projectId, organizationId: orgId } })
    if (!p) throw Object.assign(new Error('Проект не найден'), { statusCode: 404 })
    return t.projectId
  }
  if (parentType === 'client') {
    const c = await prisma.client.findFirst({ where: { id: parentId, organizationId: orgId } })
    if (!c) throw Object.assign(new Error('Клиент не найден'), { statusCode: 404 })
    return null
  }
  return null
}

// ─── List ─────────────────────────────────────────────────────────────────────

interface ListFilters {
  projectId?: string
  taskId?: string
  clientId?: string
  documentTypeId?: string
  categoryCode?: string
  search?: string
  page?: number
  pageSize?: number
}

export async function listDocuments(
  prisma: PrismaClient,
  orgId: string,
  isAdmin: boolean,
  orgRoleId: string | null,
  filters: ListFilters,
) {
  const { page = 1, pageSize = 25 } = filters

  const where: any = {
    organizationId: orgId,
    deletedAt: null,
  }

  if (filters.projectId) {
    where.projectId = filters.projectId
  }
  if (filters.taskId) {
    where.parentType = 'task'
    where.parentId = filters.taskId
  }
  if (filters.clientId) {
    where.parentType = 'client'
    where.parentId = filters.clientId
  }
  if (filters.documentTypeId) {
    where.documentTypeId = filters.documentTypeId
  }
  if (filters.categoryCode) {
    where.documentType = { category: { code: filters.categoryCode } }
  }
  if (filters.search) {
    where.title = { contains: filters.search, mode: 'insensitive' }
  }

  const [total, rawDocs] = await Promise.all([
    prisma.document.count({ where }),
    prisma.document.findMany({
      where,
      select: docSelect,
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])

  // Filter by access rules
  const accessible: any[] = []
  for (const d of rawDocs) {
    const access = await resolveAccess(
      prisma, orgId, isAdmin, orgRoleId, d.documentTypeId, d.projectId ?? null,
    )
    if (access.canView) accessible.push(mapDoc(d))
  }

  return { items: accessible, total, page, pageSize }
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createDocument(
  prisma: PrismaClient,
  orgId: string,
  userId: string,
  isAdmin: boolean,
  orgRoleId: string | null,
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string,
  data: {
    title: string
    description?: string
    documentTypeId: string
    parentType: string
    parentId: string
    comment?: string
  },
) {
  const parentType = data.parentType as DocumentParentType
  const projectId = await resolveProjectId(prisma, orgId, parentType, data.parentId)

  const access = await resolveAccess(prisma, orgId, isAdmin, orgRoleId, data.documentTypeId, projectId)
  if (!access.canUpload) {
    throw Object.assign(new Error('Нет прав на загрузку документов этого типа'), { statusCode: 403 })
  }

  const doc = await prisma.document.create({
    data: {
      organizationId: orgId,
      title: data.title,
      description: data.description,
      documentTypeId: data.documentTypeId,
      parentType,
      parentId: data.parentId,
      projectId,
      createdBy: userId,
    },
    select: { id: true },
  })

  await _createVersion(prisma, orgId, doc.id, userId, fileBuffer, fileName, mimeType, data.comment)

  const full = await prisma.document.findUniqueOrThrow({ where: { id: doc.id }, select: docSelect })
  return mapDoc(full)
}

// ─── Get ──────────────────────────────────────────────────────────────────────

export async function getDocument(
  prisma: PrismaClient,
  orgId: string,
  docId: string,
  isAdmin: boolean,
  orgRoleId: string | null,
) {
  const doc = await prisma.document.findFirst({
    where: { id: docId, organizationId: orgId, deletedAt: null },
    select: docSelect,
  })
  if (!doc) throw Object.assign(new Error('Документ не найден'), { statusCode: 404 })

  const access = await resolveAccess(prisma, orgId, isAdmin, orgRoleId, doc.documentTypeId, doc.projectId ?? null)
  if (!access.canView) throw Object.assign(new Error('Нет доступа к документу'), { statusCode: 403 })

  return mapDoc(doc)
}

// ─── Versions ─────────────────────────────────────────────────────────────────

async function _createVersion(
  prisma: PrismaClient,
  orgId: string,
  documentId: string,
  userId: string,
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string,
  comment?: string,
) {
  const lastVersion = await prisma.documentVersion.findFirst({
    where: { documentId },
    orderBy: { versionNumber: 'desc' },
    select: { versionNumber: true },
  })
  const nextNumber = (lastVersion?.versionNumber ?? 0) + 1

  const storageConfig = await getStorageConfig(prisma, orgId)
  const versionId = crypto.randomUUID()

  let storagePath: string | null = null
  let externalId: string | null = null
  let externalUrl: string | null = null
  let checksum: string | null = null

  if (storageConfig.mode === 'external' && storageConfig.pluginUrl && storageConfig.pluginApiKeyHash) {
    // For external mode we need the raw API key — stored only as hash, so we can't re-derive it.
    // The plugin must be called using the key stored in env or passed during verification.
    // For MVP: use pluginApiKeyHash as the key (plugin is responsible for matching).
    const result = await uploadToPlugin(
      storageConfig.pluginUrl,
      storageConfig.pluginApiKeyHash, // hash is used as bearer token in this MVP
      fileBuffer,
      { documentId, orgId, fileName, mimeType: mimeType || 'application/octet-stream' },
    )
    externalId = result.externalId
    externalUrl = result.externalUrl
    checksum = result.checksum
  } else {
    const docId = documentId
    const result = await saveToCloud(fileBuffer, orgId, docId, versionId, fileName)
    storagePath = result.storagePath
    checksum = result.checksum
  }

  const version = await prisma.documentVersion.create({
    data: {
      id: versionId,
      documentId,
      versionNumber: nextNumber,
      fileName,
      fileSize: BigInt(fileBuffer.length),
      mimeType: mimeType || null,
      storagePath,
      externalId,
      externalUrl,
      checksum,
      comment: comment ?? null,
      createdBy: userId,
    },
    select: {
      id: true, documentId: true, versionNumber: true, fileName: true,
      fileSize: true, mimeType: true, comment: true, createdBy: true,
      creator: { select: { fullName: true } }, createdAt: true,
    },
  })

  await prisma.document.update({ where: { id: documentId }, data: { updatedAt: new Date() } })

  return mapVersion(version)
}

export async function addVersion(
  prisma: PrismaClient,
  orgId: string,
  docId: string,
  userId: string,
  isAdmin: boolean,
  orgRoleId: string | null,
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string,
  comment?: string,
) {
  const doc = await prisma.document.findFirst({
    where: { id: docId, organizationId: orgId, deletedAt: null },
    select: { createdBy: true, documentTypeId: true, projectId: true },
  })
  if (!doc) throw Object.assign(new Error('Документ не найден'), { statusCode: 404 })

  const isOwner = doc.createdBy === userId
  const access = await resolveAccess(prisma, orgId, isAdmin, orgRoleId, doc.documentTypeId, doc.projectId ?? null)

  if (!isAdmin && !isOwner && !access.canUpload) {
    throw Object.assign(new Error('Нет прав на загрузку новой версии'), { statusCode: 403 })
  }

  return _createVersion(prisma, orgId, docId, userId, fileBuffer, fileName, mimeType, comment)
}

export async function listVersions(
  prisma: PrismaClient,
  orgId: string,
  docId: string,
  isAdmin: boolean,
  orgRoleId: string | null,
) {
  const doc = await prisma.document.findFirst({
    where: { id: docId, organizationId: orgId, deletedAt: null },
    select: { documentTypeId: true, projectId: true },
  })
  if (!doc) throw Object.assign(new Error('Документ не найден'), { statusCode: 404 })

  const access = await resolveAccess(prisma, orgId, isAdmin, orgRoleId, doc.documentTypeId, doc.projectId ?? null)
  if (!access.canView) throw Object.assign(new Error('Нет доступа к документу'), { statusCode: 403 })

  const versions = await prisma.documentVersion.findMany({
    where: { documentId: docId },
    select: {
      id: true, documentId: true, versionNumber: true, fileName: true,
      fileSize: true, mimeType: true, comment: true, createdBy: true,
      creator: { select: { fullName: true } }, createdAt: true,
    },
    orderBy: { versionNumber: 'desc' },
  })

  return versions.map(mapVersion)
}

// ─── Download ─────────────────────────────────────────────────────────────────

export async function getVersionForDownload(
  prisma: PrismaClient,
  orgId: string,
  docId: string,
  versionId: string,
  isAdmin: boolean,
  orgRoleId: string | null,
) {
  const doc = await prisma.document.findFirst({
    where: { id: docId, organizationId: orgId, deletedAt: null },
    select: { documentTypeId: true, projectId: true },
  })
  if (!doc) throw Object.assign(new Error('Документ не найден'), { statusCode: 404 })

  const access = await resolveAccess(prisma, orgId, isAdmin, orgRoleId, doc.documentTypeId, doc.projectId ?? null)
  if (!access.canView) throw Object.assign(new Error('Нет доступа к документу'), { statusCode: 403 })

  const version = await prisma.documentVersion.findFirst({
    where: { id: versionId, documentId: docId },
  })
  if (!version) throw Object.assign(new Error('Версия не найдена'), { statusCode: 404 })

  return version
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteDocument(
  prisma: PrismaClient,
  orgId: string,
  docId: string,
  userId: string,
  isAdmin: boolean,
) {
  const doc = await prisma.document.findFirst({
    where: { id: docId, organizationId: orgId, deletedAt: null },
    select: { createdBy: true },
  })
  if (!doc) throw Object.assign(new Error('Документ не найден'), { statusCode: 404 })
  if (!isAdmin && doc.createdBy !== userId) {
    throw Object.assign(new Error('Нет прав на удаление документа'), { statusCode: 403 })
  }

  // Soft delete — physical files remain (can be cleaned up by admin later)
  await prisma.document.update({ where: { id: docId }, data: { deletedAt: new Date() } })
}
