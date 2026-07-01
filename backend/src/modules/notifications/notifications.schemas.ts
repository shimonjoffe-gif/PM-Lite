import { z } from 'zod'

export const NotificationSchema = z.object({
  id: z.string(),
  type: z.string(),
  payload: z.record(z.unknown()),
  isRead: z.boolean(),
  createdAt: z.string(),
})

export const NotificationsListSchema = z.object({
  items: z.array(NotificationSchema),
  unreadCount: z.number(),
})
