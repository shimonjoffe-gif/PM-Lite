import { PrismaClient } from '@prisma/client'

function mapType(t: any) {
  return {
    id: t.id,
    organizationId: t.organizationId ?? null,
    categoryId: t.categoryId,
    categoryCode: t.category.code,
    categoryName: t.category.name,
    name: t.name,
    code: t.code ?? null,
    isSystem: t.isSystem,
    isArchived: t.isArchived,
    sortOrder: t.sortOrder,
    createdAt: t.createdAt.toISOString(),
  }
}

const typeSelect = {
  id: true,
  organizationId: true,
  categoryId: true,
  category: { select: { code: true, name: true } },
  name: true,
  code: true,
  isSystem: true,
  isArchived: true,
  sortOrder: true,
  createdAt: true,
}

export async function listDocumentTypes(prisma: PrismaClient, orgId: string) {
  const categories = await prisma.documentTypeCategory.findMany({
    orderBy: { sortOrder: 'asc' },
  })

  const types = await prisma.documentType.findMany({
    where: {
      OR: [{ organizationId: null }, { organizationId: orgId }],
    },
    select: typeSelect,
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  })

  return categories.map(cat => ({
    category: { id: cat.id, code: cat.code, name: cat.name, sortOrder: cat.sortOrder },
    types: types.filter(t => t.categoryId === cat.id).map(mapType),
  }))
}

export async function createDocumentType(
  prisma: PrismaClient,
  orgId: string,
  data: { categoryId: string; name: string; sortOrder?: number },
) {
  const existing = await prisma.documentType.findFirst({
    where: { organizationId: orgId, name: data.name },
  })
  if (existing) throw Object.assign(new Error('Тип документа с таким названием уже существует'), { statusCode: 409 })

  const t = await prisma.documentType.create({
    data: {
      organizationId: orgId,
      categoryId: data.categoryId,
      name: data.name,
      isSystem: false,
      sortOrder: data.sortOrder ?? 0,
    },
    select: typeSelect,
  })
  return mapType(t)
}

export async function updateDocumentType(
  prisma: PrismaClient,
  orgId: string,
  id: string,
  data: { name?: string; categoryId?: string; sortOrder?: number; isArchived?: boolean },
) {
  const type = await prisma.documentType.findFirst({ where: { id, organizationId: orgId } })
  if (!type) throw Object.assign(new Error('Тип документа не найден'), { statusCode: 404 })
  if (type.isSystem) throw Object.assign(new Error('Нельзя редактировать системный тип'), { statusCode: 403 })

  const t = await prisma.documentType.update({
    where: { id },
    data,
    select: typeSelect,
  })
  return mapType(t)
}

export async function archiveDocumentType(prisma: PrismaClient, orgId: string, id: string) {
  const type = await prisma.documentType.findFirst({ where: { id, organizationId: orgId } })
  if (!type) throw Object.assign(new Error('Тип документа не найден'), { statusCode: 404 })
  if (type.isSystem) throw Object.assign(new Error('Нельзя архивировать системный тип'), { statusCode: 403 })

  await prisma.documentType.update({ where: { id }, data: { isArchived: true } })
}
