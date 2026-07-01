import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { notificationsApi, Notification } from '@/api/notifications'
import { useAuthStore } from '@/store/authStore'

function notificationLabel(n: Notification): string {
  const p = n.payload
  if (n.type === 'project_delegated') {
    return `Вам передан проект «${p.projectName}» от ${p.delegatedBy}`
  }
  if (n.type === 'task_delegated') {
    return `Вам делегирована задача «${p.taskTitle}»`
  }
  if (p?.message) return p.message
  return n.type
}

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return 'только что'
  if (diff < 3600) return `${Math.floor(diff / 60)} мин. назад`
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч. назад`
  return `${Math.floor(diff / 86400)} д. назад`
}

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { user } = useAuthStore()

  function handleNotificationClick(n: Notification) {
    if (!n.isRead) markRead.mutate(n.id)
    setOpen(false)
    const rid = n.payload?.requestId
    if (!rid) return
    const isApprover = n.type === 'absence_request_pending' || n.type === 'absence_request_notify'
    const path = isApprover
      ? `/dashboard/absence-requests?requestId=${rid}`
      : `/dashboard/my-absences?requestId=${rid}`
    navigate(path)
  }

  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: notificationsApi.list,
    refetchInterval: 30_000,
  })

  const markRead = useMutation({
    mutationFn: notificationsApi.markRead,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const markAll = useMutation({
    mutationFn: notificationsApi.markAllRead,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const unread = data?.unreadCount ?? 0

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="relative p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
        aria-label="Уведомления"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unread > 0 && (
          <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-80 rounded-xl border border-gray-200 bg-white shadow-lg">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="text-sm font-semibold text-gray-900">Уведомления</span>
            {unread > 0 && (
              <button
                onClick={() => markAll.mutate()}
                className="text-xs text-blue-600 hover:text-blue-700"
              >
                Прочитать все
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
            {!data?.items.length && (
              <p className="px-4 py-6 text-sm text-center text-gray-400">Нет уведомлений</p>
            )}
            {data?.items.map(n => (
              <div
                key={n.id}
                className={`px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors ${!n.isRead ? 'bg-blue-50/40' : ''}`}
                onClick={() => handleNotificationClick(n)}
              >
                {!n.isRead && (
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-500 mr-1.5 mb-0.5" />
                )}
                <p className="text-sm text-gray-800 leading-snug">{notificationLabel(n)}</p>
                <p className="text-xs text-gray-400 mt-0.5">{timeAgo(n.createdAt)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
