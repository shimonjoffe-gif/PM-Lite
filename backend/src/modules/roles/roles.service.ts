import { PrismaClient, PermissionKey } from '@prisma/client'

export async function listRoles(prisma: PrismaClient, orgId: string) {
  const roles = await prisma.orgRole.findMany({
    where: { organizationId: orgId },
    include: {
      permissions: { select: { permission: true } },
      _count: { select: { users: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  return roles.map(r => ({
    id: r.id,
    name: r.name,
    description: r.description,
    isSystem: r.isSystem,
    permissions: r.permissions.map(p => p.permission),
    userCount: r._count.users,
  }))
}

export async function createRole(
  prisma: PrismaClient,
  orgId: string,
  data: { name: string; description?: string; permissions: PermissionKey[] },
) {
  const existing = await prisma.orgRole.findUnique({
    where: { organizationId_name: { organizationId: orgId, name: data.name } },
  })
  if (existing) throw { statusCode: 409, message: 'Роль с таким именем уже существует' }

  return prisma.orgRole.create({
    data: {
      organizationId: orgId,
      name: data.name,
      description: data.description,
      isSystem: false,
      permissions: { create: data.permissions.map(p => ({ permission: p })) },
    },
    include: { permissions: { select: { permission: true } }, _count: { select: { users: true } } },
  })
}

export async function updateRole(
  prisma: PrismaClient,
  orgId: string,
  roleId: string,
  data: { name?: string; description?: string; permissions?: PermissionKey[] },
) {
  const role = await prisma.orgRole.findUnique({ where: { id: roleId } })
  if (!role || role.organizationId !== orgId) {
    throw { statusCode: 404, message: 'Роль не найдена' }
  }

  return prisma.$transaction(async tx => {
    if (data.permissions !== undefined) {
      await tx.rolePermission.deleteMany({ where: { roleId } })
      await tx.rolePermission.createMany({
        data: data.permissions.map(p => ({ roleId, permission: p })),
      })
    }
    return tx.orgRole.update({
      where: { id: roleId },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
      },
      include: { permissions: { select: { permission: true } }, _count: { select: { users: true } } },
    })
  })
}

export async function deleteRole(prisma: PrismaClient, orgId: string, roleId: string) {
  const role = await prisma.orgRole.findUnique({ where: { id: roleId } })
  if (!role || role.organizationId !== orgId) {
    throw { statusCode: 404, message: 'Роль не найдена' }
  }
  if (role.isSystem) {
    throw { statusCode: 400, message: 'Нельзя удалить системную роль' }
  }
  const usersWithRole = await prisma.user.count({ where: { orgRoleId: roleId } })
  if (usersWithRole > 0) {
    throw { statusCode: 400, message: 'Нельзя удалить роль, назначенную пользователям' }
  }
  await prisma.orgRole.delete({ where: { id: roleId } })
}
