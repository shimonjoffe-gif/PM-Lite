import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { useState, useRef, useEffect } from 'react'
import clsx from 'clsx'
import { useQueryClient, useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { Sidebar, useSidebar } from './Sidebar'
import { NotificationBell } from './NotificationBell'
import { FeedbackButton } from '@/components/FeedbackButton'
import { AiPanel, AiTriggerButton } from '@/pages/ai/AiPanel'
import { orgApi } from '@/api/org'

const TABS = [
  { to: '/projects', label: 'Проекты' },
  { to: '/tasks', label: 'Задачи' },
  { to: '/resources', label: 'Ресурсы' },
  { to: '/reports', label: 'Отчёты' },
]

function UserMenu() {
  const { user, clearAuth } = useAuthStore()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const handleLogout = () => {
    setOpen(false)
    qc.clear()   // сбросить весь кэш перед выходом
    clearAuth()
    navigate('/login')
  }

  return (
    <div className="relative flex items-center gap-2" ref={ref}>
      <div className="hidden sm:block text-right">
        <p className="text-sm font-medium text-gray-900 leading-tight">{user?.fullName}</p>
        <p className="text-xs text-gray-400">{user?.isAdmin ? 'Администратор' : (user?.roleName ?? 'Участник')}</p>
      </div>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
        aria-label="Меню пользователя"
      >
        {user?.fullName?.charAt(0).toUpperCase()}
      </button>

      {open && (
        <div className="absolute right-0 top-10 w-40 rounded-lg border border-gray-200 bg-white shadow-lg py-1 z-50">
          <button
            onClick={handleLogout}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Выйти
          </button>
        </div>
      )}
    </div>
  )
}

export function AppLayout() {
  const { user } = useAuthStore()
  const { pathname } = useLocation()
  const { open, toggle, close } = useSidebar()
  const { data: orgInfo } = useQuery({ queryKey: ['org-info'], queryFn: orgApi.getInfo, staleTime: 5 * 60_000 })

  // Full-screen routes: no padding, overflow-hidden
  // Matches any project page (/projects/<id>) but not /projects/new or /projects list
  const isFullScreen = /\/projects\/[^/]{8,}/.test(pathname)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <Sidebar open={open} onClose={close} isAdmin={!!user?.isAdmin} />

      {/* Topbar */}
      <header className="fixed top-0 left-0 right-0 z-20 h-14 border-b border-gray-200 bg-white flex items-center px-3 sm:px-4 gap-2 sm:gap-4">
        {/* Left: sidebar toggle + logo */}
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          <button
            onClick={toggle}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
            aria-label="Открыть меню"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <Link to="/projects" className="hidden sm:flex items-center gap-2 hover:opacity-80 transition-opacity">
            {orgInfo?.logoUrl && (
              <img src={orgInfo.logoUrl} alt="Логотип" className="h-7 w-auto max-w-[40px] object-contain" />
            )}
            <span className="text-base font-bold text-gray-900">{orgInfo?.name ?? 'PM Lite'}</span>
          </Link>
        </div>

        {/* Center: tab navigation — hidden on mobile, visible from md */}
        <nav className="hidden md:flex items-center gap-1 flex-1 justify-center">
          {TABS.map(tab => {
            const active = pathname.startsWith(tab.to)
            return (
              <Link
                key={tab.to}
                to={tab.to}
                className={clsx(
                  'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap',
                  active
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100',
                )}
              >
                {tab.label}
              </Link>
            )
          })}
        </nav>

        {/* Mobile: spacer to push right section */}
        <div className="flex-1 md:hidden" />

        {/* Right: AI + feedback + notifications + user */}
        <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
          <AiTriggerButton />
          <span className="hidden sm:block"><FeedbackButton /></span>
          <NotificationBell />
          <UserMenu />
        </div>
      </header>

      {/* Main content */}
      {isFullScreen ? (
        <main className="pt-14 h-screen flex flex-col overflow-hidden">
          <Outlet />
        </main>
      ) : (
        <main className="pt-14 pb-16 md:pb-0">
          <div className="mx-auto max-w-screen-2xl px-3 sm:px-4 lg:px-6 xl:px-8 py-4 sm:py-6">
            <Outlet />
          </div>
        </main>
      )}

      {/* Mobile bottom nav — visible only on < md */}
      <nav className="fixed bottom-0 left-0 right-0 z-20 h-16 bg-white border-t border-gray-200 flex md:hidden">
        {TABS.map(tab => {
          const active = pathname.startsWith(tab.to)
          const icons: Record<string, React.ReactNode> = {
            '/projects': (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                d="M3 7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
            ),
            '/tasks': (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            ),
            '/resources': (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            ),
            '/reports': (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            ),
          }
          return (
            <Link
              key={tab.to}
              to={tab.to}
              className={clsx(
                'flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors',
                active ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600',
              )}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {icons[tab.to]}
              </svg>
              {tab.label}
            </Link>
          )
        })}
      </nav>

      {/* Global AI panel */}
      <AiPanel />
    </div>
  )
}
