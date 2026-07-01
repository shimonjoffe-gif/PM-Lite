import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { templatesApi } from '@/api/templates'
import type { AssemblePiece, NormParam } from '@/types/templates'

function PieceCard({
  piece,
  templateName,
  phaseName,
  onRemove,
  onScaleChange,
}: {
  piece: AssemblePiece
  templateName?: string
  phaseName?: string
  onRemove: () => void
  onScaleChange: (v: number) => void
}) {
  const typeLabel = {
    template_full: 'Шаблон целиком',
    template_phase: 'Фаза шаблона',
    project_phase: 'Фаза проекта',
  }[piece.type]

  const name = phaseName ?? templateName ?? piece.sourceId.substring(0, 8)

  return (
    <div className="flex items-center gap-3 bg-white border rounded-lg p-3">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="text-xs bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded">{typeLabel}</span>
          <span className="text-sm font-medium text-gray-900">{name}</span>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-gray-500">×</span>
        <input
          type="number"
          min={0.1}
          step={0.1}
          className="w-16 border rounded px-2 py-1 text-xs text-center"
          value={piece.scaleFactor}
          onChange={e => onScaleChange(Number(e.target.value))}
          title="Масштабный коэффициент"
        />
      </div>
      <button onClick={onRemove} className="text-red-400 hover:text-red-600 text-xs ml-1">✕</button>
    </div>
  )
}

type PieceWithMeta = AssemblePiece & { templateName?: string; phaseName?: string }

export function AssembleProjectPage() {
  const navigate = useNavigate()

  const { data: templates = [] } = useQuery({
    queryKey: ['templates'],
    queryFn: templatesApi.list,
  })

  const [pieces, setPieces] = useState<PieceWithMeta[]>([])
  const [projectName, setProjectName] = useState('')
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0])
  const [scalingParams, setScalingParams] = useState<Record<string, number | string | boolean>>({})

  // Picker state
  const [pickerType, setPickerType] = useState<AssemblePiece['type']>('template_full')
  const [pickerTemplateId, setPickerTemplateId] = useState('')
  const [pickerPhase, setPickerPhase] = useState('')

  const { data: templatePhases = [] } = useQuery({
    queryKey: ['template-phases', pickerTemplateId],
    queryFn: () => templatesApi.getPhases(pickerTemplateId),
    enabled: !!pickerTemplateId && pickerType === 'template_phase',
  })

  // Collect required params for all selected template pieces
  const templateIds = [...new Set(pieces
    .filter(p => p.type !== 'project_phase')
    .map(p => p.sourceId)
  )]
  const { data: requiredParams = [] } = useQuery({
    queryKey: ['required-params', ...templateIds],
    queryFn: () => templatesApi.collectParams(templateIds),
    enabled: templateIds.length > 0,
  })

  const addPiece = () => {
    if (!pickerTemplateId) return
    const template = templates.find(t => t.id === pickerTemplateId)
    const piece: PieceWithMeta = {
      type: pickerType,
      sourceId: pickerTemplateId,
      scaleFactor: 1,
      templateName: template?.name,
      ...(pickerType === 'template_phase' && pickerPhase ? { phaseLabel: pickerPhase, phaseName: pickerPhase } : {}),
    }
    setPieces(prev => [...prev, piece])
    setPickerPhase('')
  }

  const removePiece = (i: number) => setPieces(prev => prev.filter((_, j) => j !== i))
  const updateScale = (i: number, v: number) => setPieces(prev => {
    const next = [...prev]
    next[i] = { ...next[i], scaleFactor: v }
    return next
  })

  const assembleMut = useMutation({
    mutationFn: () => templatesApi.assembleProject({
      projectName,
      startDate,
      pieces: pieces.map(p => ({
        type: p.type,
        sourceId: p.sourceId,
        phaseLabel: p.phaseLabel,
        parentTaskId: p.parentTaskId,
        scaleFactor: p.scaleFactor,
      })),
      scalingParams,
    }),
    onSuccess: (project) => navigate(`/projects/${project.id}`),
  })

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Планирование по аналогам</h1>
      <p className="text-sm text-gray-500 mb-6">
        Соберите план из фаз существующих шаблонов или проектов
      </p>

      {/* Project info */}
      <div className="bg-white rounded-xl border shadow-sm p-5 mb-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Название проекта</label>
            <input
              className="w-full border rounded-lg px-3 py-2 text-sm"
              value={projectName}
              onChange={e => setProjectName(e.target.value)}
              placeholder="Новый проект"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Дата начала</label>
            <input
              type="date"
              className="w-full border rounded-lg px-3 py-2 text-sm"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Piece picker */}
      <div className="bg-white rounded-xl border shadow-sm p-5 mb-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Добавить фрагмент</h3>
        <div className="flex gap-2 flex-wrap">
          <select
            className="border rounded-lg px-3 py-2 text-sm"
            value={pickerType}
            onChange={e => setPickerType(e.target.value as any)}
          >
            <option value="template_full">Шаблон целиком</option>
            <option value="template_phase">Фаза шаблона</option>
          </select>
          <select
            className="flex-1 min-w-40 border rounded-lg px-3 py-2 text-sm"
            value={pickerTemplateId}
            onChange={e => setPickerTemplateId(e.target.value)}
          >
            <option value="">Выберите шаблон...</option>
            {templates.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          {pickerType === 'template_phase' && pickerTemplateId && (
            <select
              className="flex-1 min-w-32 border rounded-lg px-3 py-2 text-sm"
              value={pickerPhase}
              onChange={e => setPickerPhase(e.target.value)}
            >
              <option value="">Все фазы</option>
              {templatePhases.map(p => (
                <option key={p.phase} value={p.phase}>{p.phase} ({p.taskCount} задач)</option>
              ))}
            </select>
          )}
          <button
            onClick={addPiece}
            disabled={!pickerTemplateId}
            className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40"
          >
            Добавить
          </button>
        </div>
      </div>

      {/* Selected pieces */}
      {pieces.length > 0 && (
        <div className="bg-white rounded-xl border shadow-sm p-5 mb-4 space-y-2">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-900">Состав плана ({pieces.length})</h3>
            <span className="text-xs text-gray-400">× — масштабный коэффициент длительностей</span>
          </div>
          {pieces.map((piece, i) => (
            <PieceCard
              key={i}
              piece={piece}
              templateName={piece.templateName}
              phaseName={piece.phaseName}
              onRemove={() => removePiece(i)}
              onScaleChange={v => updateScale(i, v)}
            />
          ))}
        </div>
      )}

      {/* Norm params */}
      {requiredParams.length > 0 && (
        <div className="bg-white rounded-xl border shadow-sm p-5 mb-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Параметры нормирования</h3>
          <div className="grid grid-cols-2 gap-3">
            {requiredParams.map((p: NormParam) => (
              <div key={p.code}>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {p.name}{p.unit ? ` (${p.unit})` : ''}
                </label>
                {p.paramType === 'boolean' ? (
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={!!scalingParams[p.code]}
                      onChange={e => setScalingParams(prev => ({ ...prev, [p.code]: e.target.checked }))}
                      className="rounded"
                    />
                    <span className="text-sm">Да</span>
                  </label>
                ) : p.paramType === 'enum' ? (
                  <select
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    value={String(scalingParams[p.code] ?? '')}
                    onChange={e => setScalingParams(prev => ({ ...prev, [p.code]: e.target.value }))}
                  >
                    <option value="">Выберите...</option>
                    {(p.possibleValues ?? []).map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                ) : (
                  <input
                    type="number"
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    value={Number(scalingParams[p.code]) || ''}
                    onChange={e => setScalingParams(prev => ({ ...prev, [p.code]: Number(e.target.value) }))}
                    placeholder="0"
                    min={0}
                    step={0.1}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-3 justify-end">
        <button onClick={() => navigate('/templates')} className="px-4 py-2 text-sm text-gray-600">
          Отмена
        </button>
        <button
          onClick={() => assembleMut.mutate()}
          disabled={!projectName || pieces.length === 0 || assembleMut.isPending}
          className="px-5 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
        >
          {assembleMut.isPending ? 'Создание...' : 'Создать проект'}
        </button>
      </div>

      {assembleMut.isError && (
        <p className="mt-2 text-sm text-red-600">
          {(assembleMut.error as any)?.response?.data?.message ?? 'Ошибка при создании'}
        </p>
      )}
    </div>
  )
}
