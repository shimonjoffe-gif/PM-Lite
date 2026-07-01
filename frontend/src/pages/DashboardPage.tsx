import { Link, useLocation, Outlet, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/Button'
import { FeedbackButton } from '@/components/FeedbackButton'
import clsx from 'clsx'

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Главная', exact: true },
  { to: '/dashboard/team', label: 'Команда' },
  { to: '/dashboard/roles', label: 'Роли', adminOnly: true },
  { to: '/dashboard/settings', label: 'Настройки', adminOnly: true },
  { to: '/dashboard/analytics', label: 'Аналитика', adminOnly: true },
]

function NavLink({ to, label, exact }: { to: string; label: string; exact?: boolean }) {
  const { pathname } = useLocation()
  const active = exact ? pathname === to : pathname.startsWith(to)
  return (
    <Link
      to={to}
      className={clsx(
        'px-3 py-2 rounded-md text-sm font-medium transition-colors',
        active
          ? 'bg-blue-50 text-blue-700'
          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100',
      )}
    >
      {label}
    </Link>
  )
}

export function AppLayout() {
  const { user, clearAuth } = useAuthStore()

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 flex items-center justify-between h-14">
          <div className="flex items-center gap-6">
            <span className="text-base font-bold text-gray-900">PM Lite</span>
            <nav className="flex items-center gap-1">
              {NAV_ITEMS.filter(item => !item.adminOnly || user?.isAdmin).map(item => (
                <NavLink key={item.to} {...item} />
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <FeedbackButton />
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium text-gray-900">{user?.fullName}</p>
              <p className="text-xs text-gray-500">{user?.isAdmin ? 'Администратор' : 'Участник'}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => { clearAuth(); window.location.href = '/login' }}>
              Выйти
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  )
}

export function DashboardHome() {
  const user = useAuthStore(s => s.user)

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-900 mb-6">
        Добро пожаловать, {user?.fullName?.split(' ')[0]}!
      </h2>

      {!user?.emailVerifiedAt && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Пожалуйста, подтвердите ваш e-mail. Проверьте почту и перейдите по ссылке из письма.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          to="/dashboard/team"
          className="rounded-xl border border-gray-200 bg-white p-5 hover:border-blue-300 hover:shadow-sm transition-all"
        >
          <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center mb-3">
            <svg className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <h3 className="font-medium text-gray-900">Команда</h3>
          <p className="text-sm text-gray-500 mt-0.5">Участники, инвайты, заявки на вступление</p>
        </Link>

        {user?.isAdmin && (
          <Link
            to="/dashboard/roles"
            className="rounded-xl border border-gray-200 bg-white p-5 hover:border-blue-300 hover:shadow-sm transition-all"
          >
            <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center mb-3">
              <svg className="h-5 w-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h3 className="font-medium text-gray-900">Роли и права</h3>
            <p className="text-sm text-gray-500 mt-0.5">Настройка ролей и разрешений</p>
          </Link>
        )}

        {user?.isAdmin && (
          <Link
            to="/dashboard/settings"
            className="rounded-xl border border-gray-200 bg-white p-5 hover:border-blue-300 hover:shadow-sm transition-all"
          >
            <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center mb-3">
              <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <h3 className="font-medium text-gray-900">Настройки</h3>
            <p className="text-sm text-gray-500 mt-0.5">Логотип, статусы проектов, клиенты</p>
          </Link>
        )}

        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-5 opacity-50 cursor-not-allowed">
          <div className="h-10 w-10 rounded-lg bg-gray-200 flex items-center justify-center mb-3">
            <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <h3 className="font-medium text-gray-900">Проекты</h3>
          <p className="text-sm text-gray-500 mt-0.5">Скоро — Эпик PM1</p>
        </div>
      </div>
    </div>
  )
}

// Редирект с /dashboard → /dashboard (home)
export function DashboardPage() {
  return <Navigate to="/dashboard" replace />
}
