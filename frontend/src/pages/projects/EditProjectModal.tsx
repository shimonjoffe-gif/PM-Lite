import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Project } from '@/types/project'
import { projectsApi } from '@/api/projects'
import { api } from '@/api/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { FormField } from '@/components/ui/FormField'
import { Alert } from '@/components/ui/Alert'

interface Props {
  project: Project
  onClose: () => void
}

interface Form {
  name: string
  description: string
  startDate: string
  endDate: string
  statusId: string
  ownerId: string
  clientId: string
  newClientName: string
}

export function EditProjectModal({ project, onClose }: Props) {
  const qc = useQueryClient()
  const [error, setError] = useState('')
  const [showNewClient, setShowNewClient] = useState(false)

  const { register, handleSubmit, formState: { errors, isSubmitting }, setValue, reset } = useForm<Form>()

  useEffect(() => {
    reset({
      name: project.name,
      description: project.description ?? '',
      startDate: project.startDate ? project.startDate.substring(0, 10) : '',
      endDate: project.endDate ? project.endDate.substring(0, 10) : '',
      statusId: project.statusId ?? '',
      ownerId: project.ownerId ?? '',
      clientId: project.clientId ?? '',
      newClientName: '',
    })
  }, [project, reset])

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
    : (usersRaw as any)?.users ?? []

  const update = useMutation({
    mutationFn: (data: Parameters<typeof projectsApi.update>[1]) =>
      projectsApi.update(project.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', project.id] })
      qc.invalidateQueries({ queryKey: ['projects'] })
      onClose()
    },
    onError: (err: any) => {
      setError(err.response?.data?.error ?? 'Ошибка при сохранении')
    },
  })

  const onSubmit = (data: Form) => {
    setError('')
    const payload: Parameters<typeof projectsApi.update>[1] = {
      name: data.name,
      description: data.description || null,
      startDate: data.startDate || null,
      endDate: data.endDate || null,
      statusId: data.statusId || null,
      ownerId: data.ownerId || null,
    }
    if (showNewClient && data.newClientName) {
      payload.newClientName = data.newClientName
    } else if (!showNewClient) {
      payload.clientId = data.clientId || null
    }
    update.mutate(payload)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-base font-semibold text-gray-900">Редактировать проект</h2>
          <button onClick={onClose} className="p-1 rounded text-gray-400 hover:text-gray-600">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {error && <div className="mb-4"><Alert variant="error">{error}</Alert></div>}

          <form id="edit-project-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <FormField label="Название *" error={errors.name?.message}>
              <Input {...register('name', { required: 'Обязательное поле' })} autoFocus />
            </FormField>

            <FormField label="Описание">
              <textarea
                {...register('description')}
                rows={2}
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
              />
            </FormField>

            <div className="grid grid-cols-2 gap-3">
              <FormField label="Дата начала">
                <Input type="date" {...register('startDate')} />
              </FormField>
              <FormField label="Дата окончания">
                <Input type="date" {...register('endDate')} />
              </FormField>
            </div>

            <FormField label="Статус">
              <select
                {...register('statusId')}
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">— Не задан —</option>
                {statuses?.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </FormField>

            <FormField label="Ответственный (РП)">
              <select
                {...register('ownerId')}
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">— Не задан —</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.fullName}</option>
                ))}
              </select>
            </FormField>

            <FormField label="Клиент">
              <div className="space-y-2">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setShowNewClient(false); setValue('newClientName', '') }}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${!showNewClient ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                  >
                    Существующий
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowNewClient(true); setValue('clientId', '') }}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${showNewClient ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                  >
                    Создать нового
                  </button>
                </div>
                {showNewClient ? (
                  <Input {...register('newClientName')} placeholder="Название клиента" />
                ) : (
                  <select
                    {...register('clientId')}
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">— Без клиента —</option>
                    {clients?.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                )}
              </div>
            </FormField>
          </form>
        </div>

        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-100 flex-shrink-0">
          <Button variant="secondary" type="button" onClick={onClose}>Отмена</Button>
          <Button type="submit" form="edit-project-form" loading={isSubmitting || update.isPending}>
            Сохранить
          </Button>
        </div>
      </div>
    </div>
  )
}
