import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { usersApi, OrgUser } from '@/api/users'
import { invitationsApi } from '@/api/invitations'
import { rolesApi } from '@/api/roles'
import { absencesApi } from '@/api/absences'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Alert } from '@/components/ui/Alert'
import { Card } from '@/components/ui/Card'
import { UserAvailabilityPanel } from '@/components/UserAvailabilityPanel'

const inviteSchema = z.object({
  email: z.string().email('Некорректный e-mail'),
  orgRoleId: z.string().min(1, 'Выберите роль'),
})
type InviteForm = z.infer<typeof inviteSchema>

function InvitePanel({ orgSlug }: { orgSlug: string }) {
  const [sent, setSent] = useState<string | null>(null)
  const [error, setError] = useState('')
  const { data: roles } = useQuery({ queryKey: ['roles'], queryFn: rolesApi.list })
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<InviteForm>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { orgRoleId: '' },
  })

  const onSubmit = async (data: InviteForm) => {
    try {
      setError('')
      setSent(null)
      await invitationsApi.send(data)
      setSent(`Приглашение отправлено на ${data.email}`)
      reset()
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'Ошибка при отправке')
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Пригласить по e-mail</h3>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          {error && <Alert>{error}</Alert>}
          {sent && <Alert variant="success">{sent}</Alert>}
          <div className="flex gap-3">
            <div className="flex-1">
              <Input {...register('email')} type="email" placeholder="user@example.com" error={!!errors.email} />
              {errors.email && <p className="text-xs text-red-600 mt-1">{errors.email.message}</p>}
            </div>
            <select
              {...register('orgRoleId')}
              className="h-11 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Выберите роль</option>
              {roles?.map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
            <Button type="submit" loading={isSubmitting} size="sm" className="shrink-0">
              Отправить
            </Button>
          </div>
          {errors.orgRoleId && <p className="text-xs text-red-600">{errors.orgRoleId.message}</p>}
        </form>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-1">Открытая ссылка для регистрации</h3>
        <p className="text-xs text-gray-500 mb-2">
          Поделитесь кодом организации — пользователи смогут сами подать заявку на вступление.
        </p>
        <div className="flex items-center gap-2 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2">
          <span className="text-xs text-gray-500 shrink-0">Код организации:</span>
          <code className="flex-1 text-sm font-mono text-gray-900 select-all">{orgSlug}</code>
          <Button variant="ghost" size="sm" type="button" onClick={() => navigator.clipboard.writeText(orgSlug)}>
            Копировать
          </Button>
        </div>
      </div>
    </div>
  )
}

function RoleSelect({
  userId,
  currentRoleId,
  roles,
}: {
  userId: string
  currentRoleId: string | null
  roles: { id: string; name: string }[]
}) {
  const qc = useQueryClient()
  const mutation = useMutation({
    mutationFn: (roleId: string | null) => usersApi.changeRole(userId, roleId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })

  return (
    <select
      value={currentRoleId ?? ''}
      disabled={mutation.isPending}
      onChange={e => mutation.mutate(e.target.value || null)}
      className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
    >
      <option value="">— без роли —</option>
      {roles.map(r => (
        <option key={r.id} value={r.id}>{r.name}</option>
      ))}
    </select>
  )
}

function DeptSelect({ userId, currentDeptId }: { userId: string; currentDeptId: string | null }) {
  const qc = useQueryClient()
  const { data: depts = [] } = useQuery({ queryKey: ['departments'], queryFn: absencesApi.getDepartments })
  const mutation = useMutation({
    mutationFn: (deptId: string | null) => absencesApi.assignUserDepartment(userId, deptId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })
  return (
    <select
      value={currentDeptId ?? ''}
      disabled={mutation.isPending}
      onChange={e => mutation.mutate(e.target.value || null)}
      className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
    >
      <option value="">— отдел —</option>
      {depts.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
    </select>
  )
}

function UserRow({
  user,
  isAdmin,
  isSelf,
  roles,
  isAvailabilityOpen,
  onToggleAvailability,
  onActivate,
  onDeactivate,
}: {
  user: OrgUser & { departmentId?: string | null }
  isAdmin: boolean
  isSelf: boolean
  roles: { id: string; name: string }[]
  isAvailabilityOpen: boolean
  onToggleAvailability: () => void
  onActivate: () => void
  onDeactivate: () => void
}) {
  const isPending = !user.isActive

  return (
    <div>
      <div className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-blue-100 flex items-center justify-center text-sm font-semibold text-blue-700 shrink-0">
            {user.fullName.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-900">{user.fullName}</span>
              {isSelf && <span className="text-xs text-gray-400">(вы)</span>}
              {isPending && (
                <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                  Ожидает
                </span>
              )}
            </div>
            <div className="text-xs text-gray-500">{user.email}</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Роль: select для admin+неself+active, иначе текст */}
          {isAdmin && !isSelf && !isPending && !user.isAdmin ? (
            <RoleSelect userId={user.id} currentRoleId={user.orgRoleId} roles={roles} />
          ) : (
            <span className="text-xs text-gray-500 hidden sm:block">
              {user.isAdmin ? 'Администратор' : (user.orgRoleName ?? '—')}
            </span>
          )}

          {/* Отдел */}
          {isAdmin && !isPending && (
            <DeptSelect userId={user.id} currentDeptId={(user as any).departmentId ?? null} />
          )}

          {/* Доступность (только для активных, только для admin) */}
          {isAdmin && !isPending && (
            <Button
              size="sm"
              variant={isAvailabilityOpen ? 'secondary' : 'ghost'}
              onClick={onToggleAvailability}
              title="Рабочая доступность"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </Button>
          )}

          {isAdmin && !isSelf && (
            <div className="flex gap-1">
              {isPending ? (
                <Button size="sm" onClick={onActivate}>Одобрить</Button>
              ) : (
                <Button size="sm" variant="secondary" onClick={onDeactivate}>Деактивировать</Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Панель доступности */}
      {isAvailabilityOpen && <UserAvailabilityPanel user={user} />}
    </div>
  )
}

function FilterBar({
  roles,
  roleId,
  status,
  onRoleChange,
  onStatusChange,
}: {
  roles: { id: string; name: string }[]
  roleId: string
  status: string
  onRoleChange: (v: string) => void
  onStatusChange: (v: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-2 items-center">
      <span className="text-xs text-gray-500 font-medium">Фильтр:</span>
      <select
        value={roleId}
        onChange={e => onRoleChange(e.target.value)}
        className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">Все роли</option>
        {roles.map(r => (
          <option key={r.id} value={r.id}>{r.name}</option>
        ))}
      </select>
      <select
        value={status}
        onChange={e => onStatusChange(e.target.value)}
        className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="all">Все статусы</option>
        <option value="active">Активные</option>
        <option value="inactive">Неактивные</option>
      </select>
      {(roleId || status !== 'all') && (
        <button
          onClick={() => { onRoleChange(''); onStatusChange('all') }}
          className="text-xs text-blue-600 hover:underline"
        >
          Сбросить
        </button>
      )}
    </div>
  )
}

export function TeamPage() {
  const user = useAuthStore(s => s.user)
  const isAdmin = user?.isAdmin === true
  const qc = useQueryClient()
  const [showInvite, setShowInvite] = useState(false)
  const [filterRoleId, setFilterRoleId] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [openAvailability, setOpenAvailability] = useState<string | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['users'],
    queryFn: usersApi.list,
  })
  const { data: roles = [] } = useQuery({ queryKey: ['roles'], queryFn: rolesApi.list })

  const activateMutation = useMutation({
    mutationFn: usersApi.activate,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })
  const deactivateMutation = useMutation({
    mutationFn: usersApi.deactivate,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
      </div>
    )
  }

  if (error) {
    return <Alert>Не удалось загрузить список участников</Alert>
  }

  const allUsers = data!.users

  const filtered = allUsers.filter(u => {
    if (filterRoleId && u.orgRoleId !== filterRoleId) return false
    if (filterStatus === 'active' && !u.isActive) return false
    if (filterStatus === 'inactive' && u.isActive) return false
    return true
  })

  const pending = filtered.filter(u => !u.isActive)
  const active = filtered.filter(u => u.isActive)

  const toggleAvailability = (userId: string) => {
    setOpenAvailability(prev => (prev === userId ? null : userId))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Команда</h2>
          <p className="text-sm text-gray-500 mt-0.5">{data!.org.name}</p>
        </div>
        {isAdmin && (
          <Button onClick={() => setShowInvite(v => !v)}>
            {showInvite ? 'Скрыть' : '+ Пригласить'}
          </Button>
        )}
      </div>

      {isAdmin && showInvite && (
        <Card>
          <InvitePanel orgSlug={data!.org.slug} />
        </Card>
      )}

      {/* Фильтры (US-A2.1 T2) */}
      {isAdmin && (
        <FilterBar
          roles={roles}
          roleId={filterRoleId}
          status={filterStatus}
          onRoleChange={setFilterRoleId}
          onStatusChange={setFilterStatus}
        />
      )}

      {/* Ожидающие одобрения */}
      {pending.length > 0 && (
        <Card>
          <h3 className="text-sm font-semibold text-amber-700 mb-3 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            Ожидают одобрения ({pending.length})
          </h3>
          {pending.map(u => (
            <UserRow
              key={u.id}
              user={u}
              isAdmin={isAdmin}
              isSelf={u.id === user?.id}
              roles={roles}
              isAvailabilityOpen={openAvailability === u.id}
              onToggleAvailability={() => toggleAvailability(u.id)}
              onActivate={() => activateMutation.mutate(u.id)}
              onDeactivate={() => deactivateMutation.mutate(u.id)}
            />
          ))}
        </Card>
      )}

      {/* Активные участники */}
      <Card>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          Участники ({active.length})
          {(filterRoleId || filterStatus !== 'all') && allUsers.filter(u => u.isActive).length !== active.length && (
            <span className="ml-1 text-gray-400 font-normal">
              из {allUsers.filter(u => u.isActive).length}
            </span>
          )}
        </h3>
        {active.length === 0 ? (
          <p className="text-sm text-gray-400">Нет участников, соответствующих фильтру</p>
        ) : (
          active.map(u => (
            <UserRow
              key={u.id}
              user={u}
              isAdmin={isAdmin}
              isSelf={u.id === user?.id}
              roles={roles}
              isAvailabilityOpen={openAvailability === u.id}
              onToggleAvailability={() => toggleAvailability(u.id)}
              onActivate={() => activateMutation.mutate(u.id)}
              onDeactivate={() => deactivateMutation.mutate(u.id)}
            />
          ))
        )}
      </Card>
    </div>
  )
}
