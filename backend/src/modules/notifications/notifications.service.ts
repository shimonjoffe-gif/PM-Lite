import { PrismaClient, Prisma } from '@prisma/client'

export async function createNotification(
  prisma: PrismaClient,
  data: { userId: string; orgId: string; type: string; payload: Record<string, unknown> },
) {
  return prisma.notification.create({
    data: { ...data, payload: data.payload as Prisma.InputJsonValue },
  })
}

export async function listNotifications(prisma: PrismaClient, userId: string) {
  const [items, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.notification.count({ where: { userId, isRead: false } }),
  ])

  return {
    items: items.map(n => ({
      id: n.id,
      type: n.type,
      payload: n.payload as Record<string, unknown>,
      isRead: n.isRead,
      createdAt: n.createdAt.toISOString(),
    })),
    unreadCount,
  }
}

export async function markRead(prisma: PrismaClient, userId: string, notificationId: string) {
  const n = await prisma.notification.findUnique({ where: { id: notificationId } })
  if (!n || n.userId !== userId) throw { statusCode: 404, message: 'Уведомление не найдено' }

  await prisma.notification.update({ where: { id: notificationId }, data: { isRead: true } })
}

export async function markAllRead(prisma: PrismaClient, userId: string) {
  await prisma.notification.updateMany({ where: { userId, isRead: false }, data: { isRead: true } })
}
