import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { rolesApi, OrgRole } from '@/api/roles'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { Card } from '@/components/ui/Card'

function RoleForm({
  initial,
  labels,
  groups,
  onSave,
  onCancel,
}: {
  initial?: OrgRole
  labels: Record<string, string>
  groups: { key: string; label: string; permissions: string[] }[]
  onSave: (data: { name: string; description: string; permissions: string[] }) => Promise<unknown>
  onCancel: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [selected, setSelected] = useState<Set<string>>(new Set(initial?.permissions ?? []))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const toggle = (p: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(p)) next.delete(p)
      else next.add(p)
      return next
    })
  }

  const toggleGroup = (permissions: string[]) => {
    const allSelected = permissions.every(p => selected.has(p))
    setSelected(prev => {
      const next = new Set(prev)
      if (allSelected) permissions.forEach(p => next.delete(p))
      else permissions.forEach(p => next.add(p))
      return next
    })
  }

  const handleSubmit = async () => {
    if (!name.trim()) { setError('Введите название роли'); return }
    setSaving(true)
    setError('')
    try {
      await onSave({ name: name.trim(), description: description.trim(), permissions: Array.from(selected) })
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'Ошибка при сохранении')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      {error && <Alert>{error}</Alert>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Название роли</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Например: Менеджер по продажам"
            className="w-full h-10 rounded-lg border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Описание (необязательно)</label>
          <input
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Краткое описание роли"
            className="w-full h-10 rounded-lg border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-3">Разрешения</h4>
        <div className="space-y-4">
          {groups.map(group => (
            <div key={group.key} className="rounded-lg border border-gray-200 overflow-hidden">
              <div
                className="flex items-center justify-between bg-gray-50 px-4 py-2.5 cursor-pointer"
                onClick={() => toggleGroup(group.permissions)}
              >
                <span className="text-sm font-medium text-gray-700">{group.label}</span>
                <span className="text-xs text-gray-400">
                  {group.permissions.filter(p => selected.has(p)).length}/{group.permissions.length}
                </span>
              </div>
              <div className="divide-y divide-gray-100">
                {group.permissions.map(perm => (
                  <label key={perm} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selected.has(perm)}
                      onChange={() => toggle(perm)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">{labels[perm] ?? perm}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Button variant="secondary" onClick={onCancel}>Отмена</Button>
        <Button onClick={handleSubmit} loading={saving}>
          {initial ? 'Сохранить' : 'Создать роль'}
        </Button>
      </div>
    </div>
  )
}

export function RolesPage() {
  const queryClient = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const { data: roles, isLoading: rolesLoading } = useQuery({
    queryKey: ['roles'],
    queryFn: rolesApi.list,
  })

  const { data: meta, isLoading: metaLoading } = useQuery({
    queryKey: ['roles-meta'],
    queryFn: rolesApi.meta,
  })

  const createMutation = useMutation({
    mutationFn: (data: { name: string; description: string; permissions: string[] }) =>
      rolesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] })
      setCreating(false)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name: string; description: string; permissions: string[] } }) =>
      rolesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] })
      setEditingId(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: rolesApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] })
      setDeleteError(null)
    },
    onError: (e: any) => setDeleteError(e.response?.data?.error ?? 'Ошибка при удалении'),
  })

  if (rolesLoading || metaLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
      </div>
    )
  }

  if (!meta || !roles) return <Alert>Не удалось загрузить роли</Alert>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Роли и права доступа</h2>
          <p className="text-sm text-gray-500 mt-0.5">Управляйте ролями и разрешениями в организации</p>
        </div>
        {!creating && (
          <Button onClick={() => { setCreating(true); setEditingId(null) }}>
            + Новая роль
          </Button>
        )}
      </div>

      {deleteError && <Alert>{deleteError}</Alert>}

      {creating && (
        <Card>
          <h3 className="text-base font-semibold text-gray-900 mb-4">Новая роль</h3>
          <RoleForm
            labels={meta.labels}
            groups={meta.groups}
            onSave={data => createMutation.mutateAsync(data)}
            onCancel={() => setCreating(false)}
          />
        </Card>
      )}

      <div className="space-y-3">
        {roles.map(role => (
          <Card key={role.id}>
            {editingId === role.id ? (
              <div>
                <h3 className="text-base font-semibold text-gray-900 mb-4">Редактировать роль</h3>
                <RoleForm
                  initial={role}
                  labels={meta.labels}
                  groups={meta.groups}
                  onSave={data => updateMutation.mutateAsync({ id: role.id, data })}
                  onCancel={() => setEditingId(null)}
                />
              </div>
            ) : (
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-semibold text-gray-900">{role.name}</h3>
                    {role.isSystem && (
                      <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                        Системная
                      </span>
                    )}
                    <span className="text-xs text-gray-400">{role.userCount} польз.</span>
                  </div>
                  {role.description && (
                    <p className="text-xs text-gray-500 mb-2">{role.description}</p>
                  )}
                  <div className="flex flex-wrap gap-1">
                    {role.permissions.length === 0 ? (
                      <span className="text-xs text-gray-400">Нет разрешений</span>
                    ) : (
                      role.permissions.map(p => (
                        <span key={p} className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                          {meta.labels[p] ?? p}
                        </span>
                      ))
                    )}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => { setEditingId(role.id); setCreating(false) }}
                  >
                    Изменить
                  </Button>
                  {!role.isSystem && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setDeleteError(null)
                        if (confirm(`Удалить роль "${role.name}"?`)) {
                          deleteMutation.mutate(role.id)
                        }
                      }}
                    >
                      Удалить
                    </Button>
                  )}
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  )
}
