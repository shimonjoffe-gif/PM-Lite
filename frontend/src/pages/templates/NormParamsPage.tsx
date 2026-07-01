import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { normParamsApi } from '@/api/templates'
import type { NormParam, NormParamType } from '@/types/templates'

const TYPE_LABELS: Record<NormParamType, string> = {
  numeric: 'Числовой',
  boolean: 'Логический',
  enum: 'Перечисление',
}

function ParamForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Partial<NormParam>
  onSave: (data: any) => void
  onCancel: () => void
}) {
  const [code, setCode] = useState(initial?.code ?? '')
  const [name, setName] = useState(initial?.name ?? '')
  const [paramType, setParamType] = useState<NormParamType>(initial?.paramType ?? 'numeric')
  const [unit, setUnit] = useState(initial?.unit ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [enumValues, setEnumValues] = useState((initial?.possibleValues ?? []).join(', '))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave({
      code: code.toLowerCase().replace(/\s+/g, '_'),
      name,
      paramType,
      unit: unit || undefined,
      description: description || undefined,
      possibleValues: paramType === 'enum' ? enumValues.split(',').map(v => v.trim()).filter(Boolean) : undefined,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {!initial?.id && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Код параметра</label>
          <input
            className="w-full border rounded-lg px-3 py-2 text-sm font-mono"
            placeholder="pipeline_km"
            value={code}
            onChange={e => setCode(e.target.value)}
            required
          />
          <p className="text-xs text-gray-400 mt-1">Только строчные буквы, цифры и _</p>
        </div>
      )}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Название</label>
        <input
          className="w-full border rounded-lg px-3 py-2 text-sm"
          value={name}
          onChange={e => setName(e.target.value)}
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Тип</label>
        <select
          className="w-full border rounded-lg px-3 py-2 text-sm"
          value={paramType}
          onChange={e => setParamType(e.target.value as NormParamType)}
          disabled={!!initial?.id}
        >
          <option value="numeric">Числовой</option>
          <option value="boolean">Логический (да/нет)</option>
          <option value="enum">Перечисление</option>
        </select>
      </div>
      {paramType === 'numeric' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Единица измерения</label>
          <input
            className="w-full border rounded-lg px-3 py-2 text-sm"
            placeholder="км, м², этаж..."
            value={unit}
            onChange={e => setUnit(e.target.value)}
          />
        </div>
      )}
      {paramType === 'enum' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Возможные значения (через запятую)</label>
          <input
            className="w-full border rounded-lg px-3 py-2 text-sm"
            placeholder="EPC, EPCM, PMC"
            value={enumValues}
            onChange={e => setEnumValues(e.target.value)}
          />
        </div>
      )}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Описание</label>
        <textarea
          className="w-full border rounded-lg px-3 py-2 text-sm"
          rows={2}
          value={description}
          onChange={e => setDescription(e.target.value)}
        />
      </div>
      <div className="flex gap-2 justify-end pt-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">
          Отмена
        </button>
        <button type="submit" className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
          Сохранить
        </button>
      </div>
    </form>
  )
}

export function NormParamsPage() {
  const qc = useQueryClient()
  const { data: params = [], isLoading } = useQuery<NormParam[]>({
    queryKey: ['norm-params'],
    queryFn: normParamsApi.list,
  })

  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)

  const createMut = useMutation({
    mutationFn: normParamsApi.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['norm-params'] }); setCreating(false) },
  })
  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => normParamsApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['norm-params'] }); setEditing(null) },
  })
  const deleteMut = useMutation({
    mutationFn: normParamsApi.delete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['norm-params'] }),
  })

  if (isLoading) return <div className="p-6 text-gray-500">Загрузка...</div>

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Параметры нормирования</h1>
          <p className="text-sm text-gray-500 mt-1">Каталог параметров для формул расчёта длительности задач</p>
        </div>
        {!creating && (
          <button
            onClick={() => setCreating(true)}
            className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700"
          >
            + Добавить параметр
          </button>
        )}
      </div>

      {creating && (
        <div className="bg-white border rounded-xl p-4 mb-4 shadow-sm">
          <h3 className="font-medium text-gray-900 mb-3">Новый параметр</h3>
          <ParamForm
            onSave={data => createMut.mutate(data)}
            onCancel={() => setCreating(false)}
          />
        </div>
      )}

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        {params.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            <p className="text-lg mb-2">Параметров нет</p>
            <p className="text-sm">Добавьте параметры нормирования для использования в формулах шаблонов</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Код</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Название</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Тип</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Ед. изм.</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Значения</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {params.map(p => (
                <tr key={p.id} className="hover:bg-gray-50">
                  {editing === p.id ? (
                    <td colSpan={6} className="px-4 py-3">
                      <ParamForm
                        initial={p}
                        onSave={data => updateMut.mutate({ id: p.id, data })}
                        onCancel={() => setEditing(null)}
                      />
                    </td>
                  ) : (
                    <>
                      <td className="px-4 py-3 font-mono text-xs text-indigo-700 bg-indigo-50 w-40">{p.code}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {p.name}
                        {p.description && <p className="text-xs text-gray-400 mt-0.5">{p.description}</p>}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{TYPE_LABELS[p.paramType]}</td>
                      <td className="px-4 py-3 text-gray-500">{p.unit ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-500">
                        {p.paramType === 'enum' && p.possibleValues?.length
                          ? p.possibleValues.join(', ')
                          : p.paramType === 'boolean' ? 'true / false' : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => setEditing(p.id)}
                            className="text-xs text-indigo-600 hover:underline"
                          >
                            Изменить
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`Удалить параметр «${p.name}»?`)) deleteMut.mutate(p.id)
                            }}
                            className="text-xs text-red-500 hover:underline"
                          >
                            Удалить
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
