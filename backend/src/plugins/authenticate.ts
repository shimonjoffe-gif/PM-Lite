import { FastifyRequest, FastifyReply } from 'fastify'
import { PermissionKey } from '@prisma/client'

export interface JwtPayload {
  sub: string
  orgId: string
  isAdmin: boolean
  roleId: string | null
}

declare module 'fastify' {
  interface FastifyRequest {
    permissions: Set<PermissionKey>
    currentUser: JwtPayload
  }
}

async function loadPermissions(request: FastifyRequest): Promise<Set<PermissionKey>> {
  const payload = request.user as JwtPayload
  if (payload.isAdmin) return new Set(Object.values(PermissionKey))
  if (!payload.roleId) return new Set()

  const rows = await request.server.prisma.rolePermission.findMany({
    where: { roleId: payload.roleId },
    select: { permission: true },
  })
  return new Set(rows.map(r => r.permission))
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify<JwtPayload>()
    request.currentUser = request.user as JwtPayload
    request.permissions = await loadPermissions(request)
  } catch {
    reply.status(401).send({ error: 'Unauthorized' })
  }
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  await authenticate(request, reply)
  if (!request.currentUser?.isAdmin) {
    reply.status(403).send({ error: 'Forbidden: требуется роль Администратора' })
  }
}

export function requirePermission(permission: PermissionKey) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await authenticate(request, reply)
    if (!request.permissions?.has(permission)) {
      reply.status(403).send({ error: `Forbidden: нет разрешения ${permission}` })
    }
  }
}
