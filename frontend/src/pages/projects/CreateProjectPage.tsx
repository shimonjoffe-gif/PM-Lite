import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { projectsApi } from '@/api/projects'
import { api } from '@/api/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { FormField } from '@/components/ui/FormField'
import { Alert } from '@/components/ui/Alert'

const schema = z.object({
  name: z.string().min(1, 'Обязательное поле').max(200),
  description: z.string().max(5000).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  clientId: z.string().optional(),
  newClientName: z.string().max(200).optional(),
  statusId: z.string().optional(),
  ownerId: z.string().optional(),
}).refine(d => !(d.clientId && d.newClientName), {
  message: 'Нельзя выбрать клиента и создать нового одновременно',
  path: ['newClientName'],
})

type Form = z.infer<typeof schema>

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
      {children}
    </div>
  )
}

export function CreateProjectPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [error, setError] = useState('')
  const [showNewClient, setShowNewClient] = useState(false)

  const { register, handleSubmit, formState: { errors, isSubmitting }, setValue } = useForm<Form>({
    resolver: zodResolver(schema),
  })

  // Справочники
  const { data: statuses } = useQuery({
    queryKey: ['org-statuses'],
    queryFn: async () => { const r = await api.get('/org/project-statuses'); return r.data as Array<{ id: string; name: string; color: string }> },
  })

  const { data: clients } = useQuery({
    queryKey: ['org-clients'],
    queryFn: async () => { const r = await api.get('/org/clients'); return r.data as Array<{ id: string; name: string }> },
  })

  const { data: usersRaw } = useQuery({
    queryKey: ['org-users'],
    queryFn: async () => { const r = await api.get('/users'); return r.data },
  })
  const users: Array<{ id: string; fullName: string }> = Array.isArray(usersRaw)
    ? usersRaw
    : (usersRaw as any)?.users ?? (usersRaw as any)?.items ?? []

  const create = useMutation({
    mutationFn: projectsApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      navigate(`/projects`)
    },
    onError: (err: any) => {
      setError(err.response?.data?.error ?? 'Ошибка при создании проекта')
    },
  })

  const onSubmit = (data: Form) => {
    setError('')
    const payload: Parameters<typeof projectsApi.create>[0] = {
      name: data.name,
      description: data.description || undefined,
      startDate: data.startDate || undefined,
      endDate: data.endDate || undefined,
      statusId: data.statusId || undefined,
      ownerId: data.ownerId || undefined,
    }
    if (showNewClient && data.newClientName) {
      payload.newClientName = data.newClientName
    } else if (!showNewClient && data.clientId) {
      payload.clientId = data.clientId
    }
    create.mutate(payload)
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400 mb-5">
        <Link to="/projects" className="hover:text-gray-600">Проекты</Link>
        <span>›</span>
        <span className="text-gray-600">Новый проект</span>
      </div>

      <h1 className="text-xl font-bold text-gray-900 mb-5">Создать проект</h1>

      {error && <div className="mb-4"><Alert variant="error">{error}</Alert></div>}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Section title="Основное">
          <FormField label="Название *" error={errors.name?.message}>
            <Input {...register('name')} placeholder="Название проекта" autoFocus />
          </FormField>

          <FormField label="Описание" error={errors.description?.message}>
            <textarea
              {...register('description')}
              rows={3}
              placeholder="Краткое описание..."
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
            />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Дата начала" error={errors.startDate?.message}>
              <Input type="date" {...register('startDate')} />
            </FormField>
            <FormField label="Дата окончания" error={errors.endDate?.message}>
              <Input type="date" {...register('endDate')} />
            </FormField>
          </div>
        </Section>

        <Section title="Статус и ответственный">
          <FormField label="Статус" error={errors.statusId?.message}>
            <select
              {...register('statusId')}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">— По умолчанию «Новый» —</option>
              {statuses?.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </FormField>

          <FormField label="Ответственный (РП)" error={errors.ownerId?.message}>
            <select
              {...register('ownerId')}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">— Я —</option>
              {users?.map(u => (
                <option key={u.id} value={u.id}>{u.fullName}</option>
              ))}
            </select>
          </FormField>
        </Section>

        <Section title="Клиент">
          <div className="flex items-center gap-3 mb-3">
            <button
              type="button"
              onClick={() => { setShowNewClient(false); setValue('newClientName', '') }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${!showNewClient ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              Выбрать существующего
            </button>
            <button
              type="button"
              onClick={() => { setShowNewClient(true); setValue('clientId', '') }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${showNewClient ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              Создать нового
            </button>
          </div>

          {showNewClient ? (
            <FormField label="Название клиента" error={errors.newClientName?.message}>
              <Input {...register('newClientName')} placeholder="Название клиента" />
            </FormField>
          ) : (
            <FormField label="Клиент" error={errors.clientId?.message}>
              <select
                {...register('clientId')}
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">— Без клиента —</option>
                {clients?.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </FormField>
          )}
        </Section>

        <div className="flex items-center justify-end gap-3 pt-2">
          <Link to="/projects">
            <Button variant="secondary" type="button">Отмена</Button>
          </Link>
          <Button type="submit" loading={isSubmitting || create.isPending}>
            Создать проект
          </Button>
        </div>
      </form>
    </div>
  )
}
