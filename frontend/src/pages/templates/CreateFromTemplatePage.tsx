import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { templatesApi } from '@/api/templates'
import type { NormParam } from '@/types/templates'

function ParamInput({
  param,
  value,
  onChange,
}: {
  param: NormParam
  value: string | number | boolean
  onChange: (v: string | number | boolean) => void
}) {
  if (param.paramType === 'boolean') {
    return (
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={value === true || value === 'true'}
          onChange={e => onChange(e.target.checked)}
          className="rounded"
        />
        <span className="text-sm text-gray-700">{param.name}</span>
      </label>
    )
  }
  if (param.paramType === 'enum') {
    return (
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          {param.name}
        </label>
        <select
          className="w-full border rounded-lg px-3 py-2 text-sm"
          value={String(value)}
          onChange={e => onChange(e.target.value)}
        >
          <option value="">Выберите...</option>
          {(param.possibleValues ?? []).map(v => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
      </div>
    )
  }
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">
        {param.name}{param.unit ? ` (${param.unit})` : ''}
      </label>
      <input
        type="number"
        className="w-full border rounded-lg px-3 py-2 text-sm"
        value={Number(value) || ''}
        onChange={e => onChange(Number(e.target.value))}
        placeholder="0"
        min={0}
        step={param.unit?.includes('км') || param.unit?.includes('м') ? 0.1 : 1}
      />
    </div>
  )
}

export function CreateFromTemplatePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data: template } = useQuery({
    queryKey: ['template', id],
    queryFn: () => templatesApi.get(id!),
    enabled: !!id,
  })

  // Collect params used in this template
  const { data: requiredParams = [] } = useQuery({
    queryKey: ['required-params', id],
    queryFn: () => templatesApi.collectParams([id!]),
    enabled: !!id,
  })

  const [projectName, setProjectName] = useState('')
  const [projectDescription, setProjectDescription] = useState('')
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0])
  const [scalingParams, setScalingParams] = useState<Record<string, number | string | boolean>>({})

  const setParam = (code: string, value: number | string | boolean) => {
    setScalingParams(prev => ({ ...prev, [code]: value }))
  }

  const createMut = useMutation({
    mutationFn: () => templatesApi.createProject({
      templateId: id!,
      projectName,
      projectDescription,
      startDate,
      scalingParams,
    }),
    onSuccess: (project) => navigate(`/projects/${project.id}`),
  })

  if (!template) return <div className="p-6 text-gray-400">Загрузка...</div>

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-4">
        <Link to={`/templates/${id}`} className="text-sm text-gray-400 hover:text-gray-600">
          ← {template.name}
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">Создать проект из шаблона</h1>

      <div className="bg-white rounded-xl border shadow-sm p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Название проекта</label>
          <input
            className="w-full border rounded-lg px-3 py-2"
            value={projectName}
            onChange={e => setProjectName(e.target.value)}
            placeholder={template.name}
            required
            autoFocus
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Описание</label>
          <textarea
            className="w-full border rounded-lg px-3 py-2 text-sm"
            rows={2}
            value={projectDescription}
            onChange={e => setProjectDescription(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Дата начала</label>
          <input
            type="date"
            className="border rounded-lg px-3 py-2 text-sm"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
          />
        </div>

        {requiredParams.length > 0 && (
          <div className="border-t pt-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">
              Параметры нормирования
              <span className="font-normal text-gray-500 ml-1">
                — используются для расчёта длительности задач
              </span>
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {requiredParams.map(param => (
                <ParamInput
                  key={param.code}
                  param={param}
                  value={scalingParams[param.code] ?? (param.paramType === 'boolean' ? false : param.paramType === 'enum' ? '' : 0)}
                  onChange={v => setParam(param.code, v)}
                />
              ))}
            </div>
          </div>
        )}

        <div className="border-t pt-4 bg-indigo-50 rounded-lg p-3">
          <p className="text-xs text-indigo-700">
            Будет создан проект с <strong>{template._count?.tasks ?? 0} задачами</strong>.
            Даты задач рассчитаются автоматически по формулам нормирования и зависимостям из шаблона.
          </p>
        </div>

        <div className="flex gap-3 justify-end pt-2">
          <Link to={`/templates/${id}`} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">
            Отмена
          </Link>
          <button
            onClick={() => createMut.mutate()}
            disabled={!projectName || createMut.isPending}
            className="px-5 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {createMut.isPending ? 'Создание...' : 'Создать проект'}
          </button>
        </div>

        {createMut.isError && (
          <p className="text-sm text-red-600">{(createMut.error as any)?.response?.data?.message ?? 'Ошибка'}</p>
        )}
      </div>
    </div>
  )
}
