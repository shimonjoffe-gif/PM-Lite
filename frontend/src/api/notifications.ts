import { api } from './client'

export interface Notification {
  id: string
  type: string
  payload: Record<string, unknown>
  isRead: boolean
  createdAt: string
}

export interface NotificationsResponse {
  items: Notification[]
  unreadCount: number
}

export const notificationsApi = {
  list: async (): Promise<NotificationsResponse> => {
    const res = await api.get('/notifications')
    return res.data
  },

  markRead: async (id: string): Promise<void> => {
    await api.patch(`/notifications/${id}/read`)
  },

  markAllRead: async (): Promise<void> => {
    await api.post('/notifications/read-all')
  },
}
