import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { tasksApi } from '@/api/tasks'
import { api } from '@/api/client'
import { TaskPriority, TASK_STATUS_LABELS, TASK_PRIORITY_LABELS, ALL_TASK_STATUSES } from '@/types/task'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { FormField } from '@/components/ui/FormField'
import { aiApi } from '@/api/ai'

const schema = z.object({
  title: z.string().min(1, 'Обязательное поле').max(500),
  description: z.string().max(10000).optional(),
  parentId: z.string().optional(),
  assigneeId: z.string().optional(),
  status: z.enum(['todo', 'in_progress', 'review', 'done', 'cancelled']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  effortHours: z.preprocess(v => (v === '' || v === undefined ? undefined : Number(v)), z.number().positive().max(9999).optional()),
  startDate: z.string().optional(),
  dueDate: z.string().optional(),
})
type Form = z.infer<typeof schema>

interface CreateTaskModalProps {
  projectId: string
  defaultParentId?: string | null
  onClose: () => void
}

export function CreateTaskModal({ projectId, defaultParentId, onClose }: CreateTaskModalProps) {
  const qc = useQueryClient()
  const [aiLoading, setAiLoading] = useState(false)
  const [suggestedSubtasks, setSuggestedSubtasks] = useState<string[]>([])

  const { register, handleSubmit, formState: { errors, isSubmitting }, watch, setValue } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { parentId: defaultParentId ?? '', priority: 'medium', status: 'todo' },
  })

  const titleValue = watch('title')

  const handleAiSuggest = async () => {
    if (!titleValue?.trim()) return
    setAiLoading(true)
    try {
      const suggestion = await aiApi.suggestTaskFields(titleValue, projectId)
      if (suggestion.description) setValue('description', suggestion.description)
      if (suggestion.dueDate) setValue('dueDate', suggestion.dueDate)
      if (suggestion.priority) setValue('priority', suggestion.priority as TaskPriority)
      if (suggestion.subtasks?.length) setSuggestedSubtasks(suggestion.subtasks)
    } catch {
      // silently ignore
    } finally {
      setAiLoading(false)
    }
  }

  const { data: usersRaw } = useQuery({
    queryKey: ['org-users'],
    queryFn: async () => { const r = await api.get('/users'); return r.data },
  })
  const usersData: Array<{ id: string; fullName: string }> = Array.isArray(usersRaw)
    ? usersRaw
    : (usersRaw as any)?.users ?? []

  const create = useMutation({
    mutationFn: (data: Form) => tasksApi.create(projectId, {
      ...data,
      parentId: data.parentId || undefined,
      assigneeId: data.assigneeId || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks', projectId] })
      onClose()
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">
            {defaultParentId ? 'Создать подзадачу' : 'Создать задачу'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit(d => create.mutate(d))} className="p-5 space-y-4">
          <FormField label="Название *" error={errors.title?.message}>
            <div className="flex gap-2">
              <Input {...register('title')} placeholder="Название задачи" autoFocus className="flex-1" />
              <button
                type="button"
                onClick={handleAiSuggest}
                disabled={!titleValue?.trim() || aiLoading}
                title="AI авто-заполнение"
                className="flex-shrink-0 flex items-center gap-1 px-2.5 py-2 rounded-lg text-xs font-medium text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {aiLoading ? (
                  <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-violet-600 border-t-transparent" />
                ) : (
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                )}
                AI
              </button>
            </div>
          </FormField>
          {suggestedSubtasks.length > 0 && (
            <div className="bg-violet-50 rounded-lg p-3 border border-violet-100">
              <p className="text-xs font-medium text-violet-700 mb-2">AI предлагает подзадачи:</p>
              <ul className="space-y-1">
                {suggestedSubtasks.map((s, i) => (
                  <li key={i} className="text-xs text-gray-600 flex items-start gap-1.5">
                    <span className="text-violet-400 mt-0.5">•</span>
                    {s}
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => setSuggestedSubtasks([])} className="mt-2 text-xs text-gray-400 hover:text-gray-600">
                Скрыть
              </button>
            </div>
          )}

          <FormField label="Описание">
            <textarea
              {...register('description')}
              rows={2}
              placeholder="Описание задачи"
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
            />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Статус">
              <select {...register('status')}
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
                {ALL_TASK_STATUSES.map(s => <option key={s} value={s}>{TASK_STATUS_LABELS[s]}</option>)}
              </select>
            </FormField>
            <FormField label="Приоритет">
              <select {...register('priority')}
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
                {(['low', 'medium', 'high', 'critical'] as TaskPriority[]).map(p => (
                  <option key={p} value={p}>{TASK_PRIORITY_LABELS[p]}</option>
                ))}
              </select>
            </FormField>
          </div>

          <FormField label="Исполнитель">
            <select {...register('assigneeId')}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
              <option value="">— Не назначен —</option>
              {usersData?.map(u => <option key={u.id} value={u.id}>{u.fullName}</option>)}
            </select>
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Дата начала">
              <Input type="date" {...register('startDate')} />
            </FormField>
            <FormField label="Срок">
              <Input type="date" {...register('dueDate')} />
            </FormField>
          </div>

          <FormField label="Трудоёмкость (ч)" error={errors.effortHours?.message}>
            <Input type="number" min={0} step={0.5} placeholder="0" {...register('effortHours')} />
          </FormField>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>Отмена</Button>
            <Button type="submit" loading={isSubmitting || create.isPending}>Создать</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
