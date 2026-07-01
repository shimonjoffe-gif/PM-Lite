import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { orgApi, ProjectStatus, Client } from '@/api/org'
import { aiApi, AiPromptInfo } from '@/api/ai'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { Card } from '@/components/ui/Card'

// ─── Logo Section ─────────────────────────────────────────────────────────────

function LogoSection() {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState('')

  const { data: org } = useQuery({ queryKey: ['org'], queryFn: orgApi.getInfo })

  const uploadMutation = useMutation({
    mutationFn: (dataUrl: string) => orgApi.updateLogo(dataUrl),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['org'] }); setPreview(null) },
    onError: (e: any) => setError(e.response?.data?.error ?? 'Ошибка загрузки'),
  })

  const deleteMutation = useMutation({
    mutationFn: orgApi.deleteLogo,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org'] }),
    onError: (e: any) => setError(e.response?.data?.error ?? 'Ошибка удаления'),
  })

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    if (!file.type.startsWith('image/')) { setError('Допустимы только изображения'); return }
    if (file.size > 2 * 1024 * 1024) { setError('Файл не должен превышать 2 МБ'); return }
    const reader = new FileReader()
    reader.onload = ev => setPreview(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  const logoSrc = preview ?? org?.logoUrl

  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold text-gray-900">Логотип организации</h3>
      <p className="text-sm text-gray-500">Отображается в интерфейсе и отчётах. Рекомендуемый размер — не менее 200×200 px, до 2 МБ.</p>

      {error && <Alert>{error}</Alert>}

      <div className="flex items-start gap-6">
        <div className="h-24 w-24 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center bg-gray-50 overflow-hidden shrink-0">
          {logoSrc ? (
            <img src={logoSrc} alt="Логотип" className="h-full w-full object-contain" />
          ) : (
            <svg className="h-8 w-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
          <Button variant="secondary" size="sm" onClick={() => { setError(''); fileRef.current?.click() }}>
            Выбрать файл
          </Button>
          {preview && (
            <Button
              size="sm"
              loading={uploadMutation.isPending}
              onClick={() => uploadMutation.mutate(preview)}
            >
              Сохранить логотип
            </Button>
          )}
          {org?.logoUrl && !preview && (
            <Button
              variant="secondary"
              size="sm"
              loading={deleteMutation.isPending}
              onClick={() => { setError(''); deleteMutation.mutate() }}
            >
              Удалить логотип
            </Button>
          )}
          {preview && (
            <button className="text-sm text-gray-400 hover:text-gray-600" onClick={() => { setPreview(null); if (fileRef.current) fileRef.current.value = '' }}>
              Отмена
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Project Statuses Section ─────────────────────────────────────────────────

function StatusRow({
  status,
  onEdit,
  onDelete,
  dragHandlers,
  isDragOver,
}: {
  status: ProjectStatus
  onEdit: () => void
  onDelete: () => void
  dragHandlers: {
    onDragStart: () => void
    onDragOver: (e: React.DragEvent) => void
    onDrop: () => void
    onDragEnd: () => void
  }
  isDragOver: boolean
}) {
  return (
    <div
      draggable
      onDragStart={dragHandlers.onDragStart}
      onDragOver={dragHandlers.onDragOver}
      onDrop={dragHandlers.onDrop}
      onDragEnd={dragHandlers.onDragEnd}
      className={`flex items-center gap-3 px-4 py-3 border rounded-lg bg-white transition-all ${isDragOver ? 'border-blue-400 bg-blue-50 shadow-sm' : 'border-gray-200'}`}
    >
      <span className="cursor-grab text-gray-300 select-none" title="Перетащить для изменения порядка">
        ⠿
      </span>
      <span
        className="h-5 w-5 rounded-full shrink-0 border border-black/10"
        style={{ backgroundColor: status.color }}
      />
      <span className="flex-1 text-sm font-medium text-gray-800">{status.name}</span>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" onClick={onEdit}>Изменить</Button>
        <Button variant="secondary" size="sm" onClick={onDelete}>Удалить</Button>
      </div>
    </div>
  )
}

function StatusForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: ProjectStatus
  onSave: (data: { name: string; color: string }) => Promise<unknown>
  onCancel: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [color, setColor] = useState(initial?.color ?? '#6B7280')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (!name.trim()) { setError('Введите название статуса'); return }
    setSaving(true)
    setError('')
    try {
      await onSave({ name: name.trim(), color })
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'Ошибка при сохранении')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      {error && <Alert>{error}</Alert>}
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700 mb-1">Название</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Например: В работе"
            className="w-full h-10 rounded-lg border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Цвет</label>
          <input
            type="color"
            value={color}
            onChange={e => setColor(e.target.value)}
            className="h-10 w-16 rounded-lg border border-gray-300 px-1 py-1 cursor-pointer"
          />
        </div>
      </div>
      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={onCancel}>Отмена</Button>
        <Button onClick={handleSubmit} loading={saving}>
          {initial ? 'Сохранить' : 'Создать'}
        </Button>
      </div>
    </div>
  )
}

function ProjectStatusesSection() {
  const qc = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)

  const { data: statuses = [], isLoading } = useQuery({
    queryKey: ['org-statuses'],
    queryFn: orgApi.listStatuses,
  })

  const createMutation = useMutation({
    mutationFn: orgApi.createStatus,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['org-statuses'] }); setCreating(false) },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name?: string; color?: string } }) =>
      orgApi.updateStatus(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['org-statuses'] }); setEditingId(null) },
  })

  const deleteMutation = useMutation({
    mutationFn: orgApi.deleteStatus,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['org-statuses'] }); setDeleteError('') },
    onError: (e: any) => setDeleteError(e.response?.data?.error ?? 'Ошибка при удалении'),
  })

  const reorderMutation = useMutation({
    mutationFn: orgApi.reorderStatuses,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org-statuses'] }),
  })

  const handleDrop = (toIndex: number) => {
    if (dragFrom === null || dragFrom === toIndex) return
    const reordered = [...statuses]
    const [moved] = reordered.splice(dragFrom, 1)
    reordered.splice(toIndex, 0, moved)
    reorderMutation.mutate(reordered.map(s => s.id))
  }

  if (isLoading) return <div className="text-sm text-gray-400">Загрузка...</div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Статусы проектов</h3>
          <p className="text-sm text-gray-500 mt-0.5">Кастомные статусы для группировки и фильтрации проектов. Перетащите для изменения порядка.</p>
        </div>
        {!creating && (
          <Button size="sm" onClick={() => { setCreating(true); setEditingId(null) }}>
            + Добавить
          </Button>
        )}
      </div>

      {deleteError && <Alert>{deleteError}</Alert>}

      {creating && (
        <Card>
          <h4 className="text-sm font-semibold text-gray-900 mb-3">Новый статус</h4>
          <StatusForm
            onSave={data => createMutation.mutateAsync(data)}
            onCancel={() => setCreating(false)}
          />
        </Card>
      )}

      <div className="space-y-2">
        {statuses.length === 0 && !creating && (
          <p className="text-sm text-gray-400 py-4 text-center">Статусы не созданы</p>
        )}
        {statuses.map((status, index) => (
          <div key={status.id}>
            {editingId === status.id ? (
              <Card>
                <h4 className="text-sm font-semibold text-gray-900 mb-3">Редактировать статус</h4>
                <StatusForm
                  initial={status}
                  onSave={data => updateMutation.mutateAsync({ id: status.id, data })}
                  onCancel={() => setEditingId(null)}
                />
              </Card>
            ) : (
              <StatusRow
                status={status}
                onEdit={() => { setEditingId(status.id); setCreating(false) }}
                onDelete={() => {
                  setDeleteError('')
                  if (confirm(`Удалить статус "${status.name}"?`)) deleteMutation.mutate(status.id)
                }}
                isDragOver={dragOver === index}
                dragHandlers={{
                  onDragStart: () => { setDragFrom(index); setDragOver(null) },
                  onDragOver: (e) => { e.preventDefault(); setDragOver(index) },
                  onDrop: () => { handleDrop(index); setDragOver(null) },
                  onDragEnd: () => { setDragFrom(null); setDragOver(null) },
                }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Clients Section ──────────────────────────────────────────────────────────

function ClientForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Client
  onSave: (data: { name: string; contactInfo: string; notes: string }) => Promise<unknown>
  onCancel: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [contactInfo, setContactInfo] = useState(initial?.contactInfo ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (!name.trim()) { setError('Введите название клиента'); return }
    setSaving(true)
    setError('')
    try {
      await onSave({ name: name.trim(), contactInfo: contactInfo.trim(), notes: notes.trim() })
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'Ошибка при сохранении')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      {error && <Alert>{error}</Alert>}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Название *</label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Название компании или клиента"
          className="w-full h-10 rounded-lg border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Контактные данные</label>
        <input
          value={contactInfo}
          onChange={e => setContactInfo(e.target.value)}
          placeholder="Email, телефон, сайт"
          className="w-full h-10 rounded-lg border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Комментарий</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Любые заметки о клиенте"
          rows={3}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
      </div>
      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={onCancel}>Отмена</Button>
        <Button onClick={handleSubmit} loading={saving}>
          {initial ? 'Сохранить' : 'Создать'}
        </Button>
      </div>
    </div>
  )
}

function ClientsSection() {
  const qc = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ['org-clients'],
    queryFn: orgApi.listClients,
  })

  const createMutation = useMutation({
    mutationFn: orgApi.createClient,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['org-clients'] }); setCreating(false) },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name?: string; contactInfo?: string | null; notes?: string | null } }) =>
      orgApi.updateClient(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['org-clients'] }); setEditingId(null) },
  })

  const deleteMutation = useMutation({
    mutationFn: orgApi.deleteClient,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['org-clients'] }); setDeleteError('') },
    onError: (e: any) => setDeleteError(e.response?.data?.error ?? 'Ошибка при удалении'),
  })

  if (isLoading) return <div className="text-sm text-gray-400">Загрузка...</div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Клиенты</h3>
          <p className="text-sm text-gray-500 mt-0.5">Справочник клиентов для группировки и фильтрации проектов.</p>
        </div>
        {!creating && (
          <Button size="sm" onClick={() => { setCreating(true); setEditingId(null) }}>
            + Добавить
          </Button>
        )}
      </div>

      {deleteError && <Alert>{deleteError}</Alert>}

      {creating && (
        <Card>
          <h4 className="text-sm font-semibold text-gray-900 mb-3">Новый клиент</h4>
          <ClientForm
            onSave={data => createMutation.mutateAsync(data)}
            onCancel={() => setCreating(false)}
          />
        </Card>
      )}

      <div className="space-y-2">
        {clients.length === 0 && !creating && (
          <p className="text-sm text-gray-400 py-4 text-center">Клиенты не добавлены</p>
        )}
        {clients.map(client => (
          <div key={client.id} className="rounded-lg border border-gray-200 bg-white overflow-hidden">
            {editingId === client.id ? (
              <div className="p-4">
                <h4 className="text-sm font-semibold text-gray-900 mb-3">Редактировать клиента</h4>
                <ClientForm
                  initial={client}
                  onSave={data => updateMutation.mutateAsync({ id: client.id, data })}
                  onCancel={() => setEditingId(null)}
                />
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-3 px-4 py-3">
                  <button
                    className="flex-1 flex items-center gap-2 text-left"
                    onClick={() => setExpanded(expanded === client.id ? null : client.id)}
                  >
                    <svg
                      className={`h-4 w-4 text-gray-400 shrink-0 transition-transform ${expanded === client.id ? 'rotate-90' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    <span className="text-sm font-medium text-gray-900">{client.name}</span>
                    {client.contactInfo && (
                      <span className="text-xs text-gray-400 truncate">{client.contactInfo}</span>
                    )}
                  </button>
                  <div className="flex gap-2 shrink-0">
                    <Button variant="secondary" size="sm" onClick={() => { setEditingId(client.id); setCreating(false) }}>
                      Изменить
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setDeleteError('')
                        if (confirm(`Удалить клиента "${client.name}"?`)) deleteMutation.mutate(client.id)
                      }}
                    >
                      Удалить
                    </Button>
                  </div>
                </div>
                {expanded === client.id && (client.contactInfo || client.notes) && (
                  <div className="px-4 pb-3 border-t border-gray-100 pt-3 space-y-1.5">
                    {client.contactInfo && (
                      <p className="text-sm text-gray-600">
                        <span className="font-medium text-gray-700">Контакт:</span> {client.contactInfo}
                      </p>
                    )}
                    {client.notes && (
                      <p className="text-sm text-gray-600">
                        <span className="font-medium text-gray-700">Заметки:</span> {client.notes}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── AI Plan Section ──────────────────────────────────────────────────────────

function PlanSection() {
  const { data: plan, isLoading } = useQuery({ queryKey: ['ai-plan'], queryFn: aiApi.getPlanInfo })

  if (isLoading) return <div className="text-sm text-gray-400">Загрузка...</div>
  if (!plan) return null

  const isPaid = plan.planType === 'paid'
  const limit = plan.limits.dailyCallsLimit

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-gray-900">Текущий тариф</h3>
        <p className="text-sm text-gray-500 mt-0.5">Информация о доступных AI-возможностях и лимитах.</p>
      </div>

      <div className="flex items-center gap-3">
        <span
          className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold ${
            isPaid ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
          }`}
        >
          {isPaid ? 'Платный' : 'Бесплатный'}
        </span>
        {!isPaid && (
          <span className="text-sm text-gray-500">Для кастомизации AI обновитесь до платного тарифа.</span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
          <p className="text-xs text-gray-500 mb-1">Лимит AI-вызовов / день</p>
          <p className="text-lg font-semibold text-gray-900">{limit === null ? '∞' : limit}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
          <p className="text-xs text-gray-500 mb-1">Вызовы сегодня</p>
          <p className="text-lg font-semibold text-gray-900">{plan.usage.callsToday}</p>
          {limit !== null && (
            <p className="text-xs text-gray-400 mt-0.5">из {limit}</p>
          )}
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
          <p className="text-xs text-gray-500 mb-1">Вызовы за месяц</p>
          <p className="text-lg font-semibold text-gray-900">{plan.usage.callsThisMonth}</p>
        </div>
      </div>

      <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 space-y-1.5">
        <p className="text-sm font-medium text-gray-700">Что включено:</p>
        <ul className="text-sm text-gray-600 space-y-1">
          <li className="flex items-start gap-2">
            <span className="text-green-500 mt-0.5">✓</span>
            Базовые AI-кейсы: автостатус проекта, резюме обсуждений
          </li>
          {isPaid ? (
            <>
              <li className="flex items-start gap-2">
                <span className="text-green-500 mt-0.5">✓</span>
                Включение / отключение AI-кейсов для пользователей
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500 mt-0.5">✓</span>
                Кастомизация текстов AI-промтов под специфику компании
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500 mt-0.5">✓</span>
                Неограниченное количество AI-вызовов
              </li>
            </>
          ) : (
            <>
              <li className="flex items-start gap-2 opacity-40">
                <span className="mt-0.5">—</span>
                Включение / отключение AI-кейсов (платный тариф)
              </li>
              <li className="flex items-start gap-2 opacity-40">
                <span className="mt-0.5">—</span>
                Кастомизация промтов (платный тариф)
              </li>
            </>
          )}
        </ul>
      </div>
    </div>
  )
}

// ─── AI Cases Section ─────────────────────────────────────────────────────────

function AiCasesSection() {
  const qc = useQueryClient()
  const [error, setError] = useState('')
  const { data: plan } = useQuery({ queryKey: ['ai-plan'], queryFn: aiApi.getPlanInfo })
  const { data: cases = [], isLoading } = useQuery({ queryKey: ['ai-cases'], queryFn: aiApi.listCases })

  const toggleMutation = useMutation({
    mutationFn: ({ key, isEnabled }: { key: string; isEnabled: boolean }) =>
      aiApi.toggleCase(key, isEnabled),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-cases'] }),
    onError: (e: any) => setError(e.response?.data?.error ?? 'Ошибка при сохранении'),
  })

  const isPaid = plan?.planType === 'paid'

  if (isLoading) return <div className="text-sm text-gray-400">Загрузка...</div>

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-gray-900">AI-кейсы</h3>
        <p className="text-sm text-gray-500 mt-0.5">
          {isPaid
            ? 'Управляйте доступностью AI-функций для пользователей организации.'
            : 'Управление AI-кейсами доступно на платном тарифе.'}
        </p>
      </div>

      {error && <Alert>{error}</Alert>}

      <div className="space-y-3">
        {cases.map(c => (
          <div key={c.promptKey} className="flex items-start gap-4 rounded-lg border border-gray-200 bg-white px-4 py-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900">{c.label}</p>
              <p className="text-xs text-gray-500 mt-0.5">{c.description}</p>
            </div>
            <button
              disabled={!isPaid || toggleMutation.isPending}
              onClick={() => {
                setError('')
                toggleMutation.mutate({ key: c.promptKey, isEnabled: !c.isEnabled })
              }}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none ${
                !isPaid ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
              } ${c.isEnabled ? 'bg-blue-600' : 'bg-gray-200'}`}
              title={isPaid ? (c.isEnabled ? 'Отключить' : 'Включить') : 'Недоступно на бесплатном тарифе'}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  c.isEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Prompt Editor Section ────────────────────────────────────────────────────

function PromptEditor({
  prompt,
  onSaved,
}: {
  prompt: AiPromptInfo
  onSaved: () => void
}) {
  const [text, setText] = useState(prompt.promptText)
  const [saving, setSaving] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const isDirty = text !== prompt.promptText
  const isDefault = !prompt.isCustom && text === prompt.promptText

  const insertVariable = (variable: string) => {
    const el = textareaRef.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const newText = text.slice(0, start) + variable + text.slice(end)
    setText(newText)
    setTimeout(() => {
      el.selectionStart = el.selectionEnd = start + variable.length
      el.focus()
    }, 0)
  }

  const handleSave = async () => {
    if (text.trim().length < 10) { setError('Промт слишком короткий (минимум 10 символов)'); return }
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      await aiApi.updatePrompt(prompt.promptKey, text.trim())
      setSuccess('Промт сохранён')
      onSaved()
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'Ошибка при сохранении')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    if (!confirm('Сбросить кастомный промт и вернуться к стандартному?')) return
    setResetting(true)
    setError('')
    setSuccess('')
    try {
      await aiApi.resetPrompt(prompt.promptKey)
      onSaved()
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'Ошибка при сбросе')
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="space-y-3">
      {error && <Alert>{error}</Alert>}
      {success && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-2 text-sm text-green-700">
          {success}
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-sm font-medium text-gray-700">Текст промта</label>
          {prompt.isCustom && (
            <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">
              Кастомный
            </span>
          )}
        </div>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={e => { setText(e.target.value); setSuccess('') }}
          rows={6}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
          placeholder="Введите текст промта..."
        />
      </div>

      <div>
        <p className="text-xs text-gray-500 mb-1.5">Переменные — кликните чтобы вставить в позицию курсора:</p>
        <div className="flex flex-wrap gap-2">
          {prompt.variables.map(v => (
            <button
              key={v}
              onClick={() => insertVariable(v)}
              className="px-2.5 py-1 text-xs font-mono bg-gray-100 hover:bg-blue-50 hover:text-blue-700 border border-gray-200 hover:border-blue-300 rounded-md transition-colors"
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between pt-1">
        <div>
          {prompt.isCustom && (
            <Button variant="secondary" size="sm" loading={resetting} onClick={handleReset}>
              Сбросить к стандартному
            </Button>
          )}
        </div>
        <Button
          size="sm"
          loading={saving}
          disabled={!isDirty && !isDefault}
          onClick={handleSave}
        >
          Сохранить
        </Button>
      </div>
    </div>
  )
}

function AiPromptsSection() {
  const qc = useQueryClient()
  const { data: plan } = useQuery({ queryKey: ['ai-plan'], queryFn: aiApi.getPlanInfo })
  const { data: prompts = [], isLoading } = useQuery({ queryKey: ['ai-prompts'], queryFn: aiApi.listPrompts })
  const [expandedKey, setExpandedKey] = useState<string | null>(null)

  const isPaid = plan?.planType === 'paid'

  if (isLoading) return <div className="text-sm text-gray-400">Загрузка...</div>

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-gray-900">Тексты AI-промтов</h3>
        <p className="text-sm text-gray-500 mt-0.5">
          {isPaid
            ? 'Адаптируйте промты под специфику вашей компании. Кастомный промт перекрывает стандартный только для вашей организации.'
            : 'Редактирование промтов доступно на платном тарифе.'}
        </p>
      </div>

      <div className="space-y-3">
        {prompts.map(p => (
          <div key={p.promptKey} className="rounded-lg border border-gray-200 bg-white overflow-hidden">
            <button
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50"
              onClick={() => setExpandedKey(expandedKey === p.promptKey ? null : p.promptKey)}
              disabled={!isPaid}
            >
              <svg
                className={`h-4 w-4 text-gray-400 shrink-0 transition-transform ${expandedKey === p.promptKey ? 'rotate-90' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <span className="flex-1 text-sm font-medium text-gray-900">{p.label}</span>
              {p.isCustom && (
                <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium shrink-0">
                  Кастомный
                </span>
              )}
              {!isPaid && (
                <span className="text-xs text-gray-400 shrink-0">Платный тариф</span>
              )}
            </button>
            {expandedKey === p.promptKey && isPaid && (
              <div className="px-4 pb-4 border-t border-gray-100 pt-4">
                <PromptEditor
                  prompt={p}
                  onSaved={() => qc.invalidateQueries({ queryKey: ['ai-prompts'] })}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = 'logo' | 'statuses' | 'clients' | 'ai'

export function OrgSettingsPage() {
  const [tab, setTab] = useState<Tab>('logo')

  const tabs: { key: Tab; label: string }[] = [
    { key: 'logo', label: 'Логотип' },
    { key: 'statuses', label: 'Статусы проектов' },
    { key: 'clients', label: 'Клиенты' },
    { key: 'ai', label: 'Тариф и AI' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Настройки организации</h2>
        <p className="text-sm text-gray-500 mt-0.5">Логотип, статусы проектов, клиенты, AI-настройки</p>
      </div>

      <div className="flex border-b border-gray-200 gap-1">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'ai' ? (
        <div className="space-y-6">
          <Card><PlanSection /></Card>
          <Card><AiCasesSection /></Card>
          <Card><AiPromptsSection /></Card>
        </div>
      ) : (
        <Card>
          {tab === 'logo' && <LogoSection />}
          {tab === 'statuses' && <ProjectStatusesSection />}
          {tab === 'clients' && <ClientsSection />}
        </Card>
      )}
    </div>
  )
}
