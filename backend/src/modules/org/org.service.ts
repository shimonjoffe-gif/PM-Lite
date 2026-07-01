import { PrismaClient } from '@prisma/client'

export async function getOrgInfo(prisma: PrismaClient, orgId: string) {
  const org = await prisma.organization.findUnique({ where: { id: orgId } })
  if (!org) throw { statusCode: 404, message: 'Организация не найдена' }
  return org
}

export async function updateLogo(prisma: PrismaClient, orgId: string, logoDataUrl: string | null) {
  return prisma.organization.update({ where: { id: orgId }, data: { logoUrl: logoDataUrl } })
}

// ─── Project Statuses ─────────────────────────────────────────────────────────

export async function listStatuses(prisma: PrismaClient, orgId: string) {
  return prisma.projectStatus.findMany({
    where: { organizationId: orgId },
    orderBy: { sortOrder: 'asc' },
  })
}

export async function createStatus(
  prisma: PrismaClient,
  orgId: string,
  data: { name: string; color: string },
) {
  const existing = await prisma.projectStatus.findUnique({
    where: { organizationId_name: { organizationId: orgId, name: data.name } },
  })
  if (existing) throw { statusCode: 409, message: 'Статус с таким именем уже существует' }

  const agg = await prisma.projectStatus.aggregate({
    where: { organizationId: orgId },
    _max: { sortOrder: true },
  })

  return prisma.projectStatus.create({
    data: {
      organizationId: orgId,
      name: data.name,
      color: data.color,
      sortOrder: (agg._max.sortOrder ?? -1) + 1,
    },
  })
}

export async function updateStatus(
  prisma: PrismaClient,
  orgId: string,
  statusId: string,
  data: { name?: string; color?: string },
) {
  const status = await prisma.projectStatus.findUnique({ where: { id: statusId } })
  if (!status || status.organizationId !== orgId) throw { statusCode: 404, message: 'Статус не найден' }

  if (data.name && data.name !== status.name) {
    const dupe = await prisma.projectStatus.findUnique({
      where: { organizationId_name: { organizationId: orgId, name: data.name } },
    })
    if (dupe) throw { statusCode: 409, message: 'Статус с таким именем уже существует' }
  }

  return prisma.projectStatus.update({ where: { id: statusId }, data })
}

export async function deleteStatus(prisma: PrismaClient, orgId: string, statusId: string) {
  const status = await prisma.projectStatus.findUnique({ where: { id: statusId } })
  if (!status || status.organizationId !== orgId) throw { statusCode: 404, message: 'Статус не найден' }

  const inUse = await prisma.project.count({ where: { statusId } })
  if (inUse > 0) {
    throw { statusCode: 400, message: `Статус используется в ${inUse} проект(ах). Сначала смените статус проектов.` }
  }
  await prisma.projectStatus.delete({ where: { id: statusId } })
}

export async function reorderStatuses(prisma: PrismaClient, orgId: string, ids: string[]) {
  const statuses = await prisma.projectStatus.findMany({ where: { organizationId: orgId } })
  const orgSet = new Set(statuses.map(s => s.id))
  if (!ids.every(id => orgSet.has(id))) throw { statusCode: 400, message: 'Некорректный список статусов' }

  await prisma.$transaction(
    ids.map((id, index) => prisma.projectStatus.update({ where: { id }, data: { sortOrder: index } })),
  )
}

// ─── Clients ──────────────────────────────────────────────────────────────────

export async function listClients(prisma: PrismaClient, orgId: string) {
  return prisma.client.findMany({
    where: { organizationId: orgId },
    orderBy: { createdAt: 'asc' },
  })
}

export async function createClient(
  prisma: PrismaClient,
  orgId: string,
  data: { name: string; contactInfo?: string; notes?: string },
) {
  return prisma.client.create({
    data: {
      organizationId: orgId,
      name: data.name,
      contactInfo: data.contactInfo ?? null,
      notes: data.notes ?? null,
    },
  })
}

export async function updateClient(
  prisma: PrismaClient,
  orgId: string,
  clientId: string,
  data: { name?: string; contactInfo?: string | null; notes?: string | null },
) {
  const client = await prisma.client.findUnique({ where: { id: clientId } })
  if (!client || client.organizationId !== orgId) throw { statusCode: 404, message: 'Клиент не найден' }
  return prisma.client.update({ where: { id: clientId }, data })
}

export async function deleteClient(prisma: PrismaClient, orgId: string, clientId: string) {
  const client = await prisma.client.findUnique({ where: { id: clientId } })
  if (!client || client.organizationId !== orgId) throw { statusCode: 404, message: 'Клиент не найден' }
  await prisma.client.delete({ where: { id: clientId } })
}
