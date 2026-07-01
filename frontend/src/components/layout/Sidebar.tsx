import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import clsx from 'clsx'

const STORAGE_KEY = 'sidebar_open'

const SECTIONS = [
  {
    label: 'Рабочее пространство',
    items: [
      { to: '/projects', label: 'Проекты', icon: 'folder' },
      { to: '/tasks', label: 'Мои задачи', icon: 'check' },
      { to: '/dashboard/my-absences', label: 'Мои отсутствия', icon: 'calendar' },
      { to: '/resources', label: 'Ресурсы', icon: 'users' },
      { to: '/reports', label: 'Отчёты', icon: 'chart' },
      { to: '/documents', label: 'Документы', icon: 'document' },
    ],
  },
  {
    label: 'Управление',
    items: [
      { to: '/team', label: 'Команда', icon: 'team' },
      { to: '/resources/load', label: 'Загрузка ресурсов', icon: 'chart' },
      { to: '/dashboard/work-calendar', label: 'Рабочий календарь', icon: 'calendar', adminOnly: true },
      { to: '/dashboard/absence-requests', label: 'Заявки на отсутствие', icon: 'document' },
      { to: '/dashboard/absence-settings', label: 'Настройки отсутствий', icon: 'settings', adminOnly: true },
      { to: '/dashboard/analytics', label: 'Аналитика', icon: 'chart', adminOnly: true },
      { to: '/dashboard/roles', label: 'Роли', icon: 'shield', adminOnly: true },
      { to: '/dashboard/settings', label: 'Настройки', icon: 'settings', adminOnly: true },
      { to: '/ai/settings', label: 'Настройки AI', icon: 'ai', adminOnly: true },
      { to: '/dashboard/storage-settings', label: 'Хранилище', icon: 'storage', adminOnly: true },
      { to: '/dashboard/doc-access-rules', label: 'Права на документы', icon: 'shield', adminOnly: true },
      { to: '/templates', label: 'Шаблоны', icon: 'template' },
    ],
  },
]

function Icon({ name }: { name: string }) {
  const icons: Record<string, React.ReactNode> = {
    folder: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />,
    check: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />,
    users: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />,
    chart: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />,
    team: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />,
    shield: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />,
    settings: <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></>,
    star: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />,
    clock: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />,
    calendar: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />,
    ai: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />,
    template: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />,
    document: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />,
    storage: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />,
  }
  return (
    <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      {icons[name]}
    </svg>
  )
}

interface SidebarProps {
  open: boolean
  onClose: () => void
  isAdmin: boolean
}

export function Sidebar({ open, onClose, isAdmin }: SidebarProps) {
  const { pathname } = useLocation()

  // Избранное из localStorage
  const [favorites, setFavorites] = useState<Array<{ label: string; to: string }>>(() => {
    try { return JSON.parse(localStorage.getItem('sidebar_favorites') ?? '[]') }
    catch { return [] }
  })

  const removeFavorite = (to: string) => {
    const next = favorites.filter(f => f.to !== to)
    setFavorites(next)
    localStorage.setItem('sidebar_favorites', JSON.stringify(next))
  }

  return (
    <>
      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/20 backdrop-blur-sm"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <aside
        className={clsx(
          'fixed left-0 top-0 z-40 h-full w-60 bg-white border-r border-gray-200 shadow-xl flex flex-col transition-transform duration-200',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 h-14 border-b border-gray-100 flex-shrink-0">
          <span className="text-sm font-bold text-gray-900">PM Lite</span>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          {SECTIONS.map(section => {
            const items = section.items.filter(i => !('adminOnly' in i && i.adminOnly && !isAdmin))
            if (!items.length) return null
            return (
              <div key={section.label}>
                <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                  {section.label}
                </p>
                <div className="space-y-0.5">
                  {items.map(item => {
                    const active = pathname.startsWith(item.to)
                    if ('disabled' in item && item.disabled) {
                      return (
                        <div key={item.to} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-gray-300 cursor-not-allowed text-sm">
                          <Icon name={item.icon} />
                          <span>{item.label}</span>
                          <span className="ml-auto text-[9px] font-medium text-gray-300 border border-gray-200 rounded px-1">скоро</span>
                        </div>
                      )
                    }
                    return (
                      <Link
                        key={item.to}
                        to={item.to}
                        onClick={onClose}
                        className={clsx(
                          'flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-sm transition-colors',
                          active
                            ? 'bg-blue-50 text-blue-700 font-medium'
                            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                        )}
                      >
                        <Icon name={item.icon} />
                        {item.label}
                      </Link>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {/* Избранное */}
          {favorites.length > 0 && (
            <div>
              <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                Избранное
              </p>
              <div className="space-y-0.5">
                {favorites.map(f => (
                  <div key={f.to} className="group flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                    <Icon name="star" />
                    <Link to={f.to} onClick={onClose} className="flex-1 truncate hover:text-gray-900">
                      {f.label}
                    </Link>
                    <button
                      onClick={() => removeFavorite(f.to)}
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-gray-400 hover:text-red-500"
                    >
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </nav>
      </aside>
    </>
  )
}

// Экспортируемый хук для управления состоянием сайдбара
export function useSidebar() {
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === 'true' }
    catch { return false }
  })

  const toggle = () => {
    setOpen(v => {
      const next = !v
      localStorage.setItem(STORAGE_KEY, String(next))
      return next
    })
  }

  const close = () => {
    setOpen(false)
    localStorage.setItem(STORAGE_KEY, 'false')
  }

  return { open, toggle, close }
}

// Утилита для добавления в избранное (вызывается из других компонентов)
export function addToFavorites(label: string, to: string) {
  try {
    const current: Array<{ label: string; to: string }> = JSON.parse(
      localStorage.getItem('sidebar_favorites') ?? '[]',
    )
    if (current.some(f => f.to === to)) return
    const next = [...current, { label, to }]
    localStorage.setItem('sidebar_favorites', JSON.stringify(next))
  } catch {}
}
