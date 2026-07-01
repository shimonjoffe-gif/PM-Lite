import { useState, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { templatesApi, normParamsApi } from '@/api/templates'
import type { TemplateTask, FormulaJson, FormulaMultiplier, FormulaAddend, NormParam } from '@/types/templates'

// ── Formula Builder ───────────────────────────────────────────────────────────

function FormulaBuilder({
  value,
  params,
  onChange,
}: {
  value: FormulaJson | null
  params: NormParam[]
  onChange: (f: FormulaJson | null) => void
}) {
  const formula: FormulaJson = value ?? { base: 1, multipliers: [], addends: [] }

  const setBase = (base: number) => onChange({ ...formula, base })

  const setMultipliers = (multipliers: FormulaMultiplier[]) => onChange({ ...formula, multipliers })
  const setAddends = (addends: FormulaAddend[]) => onChange({ ...formula, addends })

  const addMultiplier = () =>
    setMultipliers([...(formula.multipliers ?? []), { paramCode: params[0]?.code ?? '', exponent: 1 }])

  const addAddend = () =>
    setAddends([...(formula.addends ?? []), { paramCode: params[0]?.code ?? '', addDays: 1 }])

  if (!value) {
    return (
      <div className="text-center py-4">
        <p className="text-sm text-gray-500 mb-2">Формула не задана — используется базовая длительность</p>
        <button
          type="button"
          onClick={() => onChange({ base: 1, multipliers: [], addends: [] })}
          className="text-sm text-indigo-600 hover:underline"
        >
          Добавить формулу
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4 bg-gray-50 rounded-lg p-3 text-sm">
      <div className="flex items-center gap-2">
        <span className="text-gray-600">Базовая длительность:</span>
        <input
          type="number"
          min={0}
          step={0.5}
          className="w-20 border rounded px-2 py-1 text-sm"
          value={formula.base}
          onChange={e => setBase(Number(e.target.value))}
        />
        <span className="text-gray-500">дн.</span>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="ml-auto text-xs text-red-400 hover:underline"
        >
          Убрать формулу
        </button>
      </div>

      {/* Multipliers */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="font-medium text-gray-700">Умножители (×)</span>
          <button type="button" onClick={addMultiplier} className="text-xs text-indigo-600 hover:underline" disabled={!params.length}>
            + Добавить
          </button>
        </div>
        {(formula.multipliers ?? []).map((m, i) => (
          <div key={i} className="flex items-center gap-2 mb-1">
            <select
              className="flex-1 border rounded px-2 py-1 text-xs"
              value={m.paramCode}
              onChange={e => {
                const updated = [...(formula.multipliers ?? [])]
                updated[i] = { ...m, paramCode: e.target.value }
                setMultipliers(updated)
              }}
            >
              {params.filter(p => p.paramType === 'numeric').map(p => (
                <option key={p.code} value={p.code}>{p.name} ({p.code})</option>
              ))}
            </select>
            <span className="text-gray-500 text-xs">^</span>
            <input
              type="number"
              step={0.1}
              className="w-16 border rounded px-2 py-1 text-xs"
              value={m.exponent}
              onChange={e => {
                const updated = [...(formula.multipliers ?? [])]
                updated[i] = { ...m, exponent: Number(e.target.value) }
                setMultipliers(updated)
              }}
            />
            <button
              type="button"
              className="text-red-400 hover:text-red-600 text-xs"
              onClick={() => setMultipliers((formula.multipliers ?? []).filter((_, j) => j !== i))}
            >
              ✕
            </button>
          </div>
        ))}
        {(formula.multipliers ?? []).length === 0 && (
          <p className="text-xs text-gray-400">Нет умножителей</p>
        )}
      </div>

      {/* Addends */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="font-medium text-gray-700">Слагаемые (+)</span>
          <button type="button" onClick={addAddend} className="text-xs text-indigo-600 hover:underline" disabled={!params.length}>
            + Добавить
          </button>
        </div>
        {(formula.addends ?? []).map((a, i) => {
          const param = params.find(p => p.code === a.paramCode)
          const updateAddend = (updates: Partial<FormulaAddend>) => {
            const updated = [...(formula.addends ?? [])]
            updated[i] = { ...a, ...updates }
            setAddends(updated)
          }
          return (
            <div key={i} className="flex items-start gap-2 mb-2 p-2 bg-white rounded border">
              <div className="flex-1 space-y-1">
                <div className="flex gap-2">
                  <select
                    className="flex-1 border rounded px-2 py-1 text-xs"
                    value={a.paramCode}
                    onChange={e => updateAddend({ paramCode: e.target.value, matchValue: undefined, coefficient: undefined })}
                  >
                    {params.map(p => (
                      <option key={p.code} value={p.code}>{p.name} ({p.paramType})</option>
                    ))}
                  </select>
                </div>
                {param?.paramType === 'numeric' && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">× коэфф.</span>
                    <input
                      type="number"
                      step={0.001}
                      className="w-20 border rounded px-2 py-1 text-xs"
                      value={a.coefficient ?? 1}
                      onChange={e => updateAddend({ coefficient: Number(e.target.value), matchValue: undefined, addDays: undefined })}
                    />
                    <span className="text-xs text-gray-400">= доп. дни</span>
                  </div>
                )}
                {(param?.paramType === 'boolean' || param?.paramType === 'enum') && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">если =</span>
                    {param.paramType === 'enum' ? (
                      <select
                        className="flex-1 border rounded px-2 py-1 text-xs"
                        value={a.matchValue ?? ''}
                        onChange={e => updateAddend({ matchValue: e.target.value, coefficient: undefined })}
                      >
                        <option value="">выбрать...</option>
                        {(param.possibleValues ?? []).map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                    ) : (
                      <select
                        className="border rounded px-2 py-1 text-xs"
                        value={a.matchValue ?? 'true'}
                        onChange={e => updateAddend({ matchValue: e.target.value, coefficient: undefined })}
                      >
                        <option value="true">Да</option>
                        <option value="false">Нет</option>
                      </select>
                    )}
                    <span className="text-xs text-gray-500">→ +</span>
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      className="w-16 border rounded px-2 py-1 text-xs"
                      value={a.addDays ?? 0}
                      onChange={e => updateAddend({ addDays: Number(e.target.value) })}
                    />
                    <span className="text-xs text-gray-400">дн.</span>
                  </div>
                )}
              </div>
              <button
                type="button"
                className="text-red-400 hover:text-red-600 text-xs mt-1"
                onClick={() => setAddends((formula.addends ?? []).filter((_, j) => j !== i))}
              >
                ✕
              </button>
            </div>
          )
        })}
        {(formula.addends ?? []).length === 0 && (
          <p className="text-xs text-gray-400">Нет слагаемых</p>
        )}
      </div>

      {/* Preview */}
      <div className="text-xs text-gray-500 bg-white rounded border p-2 font-mono">
        T = {formula.base}
        {(formula.multipliers ?? []).map(m => ` × ${m.paramCode}^${m.exponent}`).join('')}
        {(formula.addends ?? []).map(a => {
          if (a.coefficient !== undefined) return ` + ${a.paramCode} × ${a.coefficient}`
          if (a.matchValue !== undefined) return ` + (${a.paramCode}=${a.matchValue} ? ${a.addDays} : 0)`
          return ''
        }).join('')}
      </div>
    </div>
  )
}

// ── Task Row ──────────────────────────────────────────────────────────────────

function TaskRow({
  task,
  depth,
  params,
  allTasks,
  onRefresh,
}: {
  task: TemplateTask
  depth: number
  params: NormParam[]
  templateId: string
  allTasks: TemplateTask[]
  onRefresh: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [showDeps, setShowDeps] = useState(false)
  const [depPredId, setDepPredId] = useState('')
  const [depType, setDepType] = useState<'FS' | 'SS' | 'FF' | 'SF'>('FS')

  const updateMut = useMutation({
    mutationFn: (data: any) => templatesApi.updateTask(task.id, data),
    onSuccess: onRefresh,
  })
  const deleteMut = useMutation({
    mutationFn: () => templatesApi.deleteTask(task.id),
    onSuccess: onRefresh,
  })
  const addDepMut = useMutation({
    mutationFn: () => templatesApi.createDependency(task.id, { predecessorId: depPredId, type: depType }),
    onSuccess: () => { setShowDeps(false); onRefresh() },
  })
  const delDepMut = useMutation({
    mutationFn: (depId: string) => templatesApi.deleteDependency(depId),
    onSuccess: onRefresh,
  })

  const [editData, setEditData] = useState({
    title: task.title,
    phase: task.phase ?? '',
    roleName: task.roleName ?? '',
    priority: task.priority,
    baseDuration: task.baseDuration,
    description: task.description ?? '',
  })
  const [formula, setFormula] = useState<FormulaJson | null>(task.formulaJson)

  const otherTasks = allTasks.filter(t => t.id !== task.id)

  if (editing) {
    return (
      <tr>
        <td colSpan={6} className="px-4 py-3">
          <div className="border rounded-lg p-4 bg-gray-50 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Название</label>
                <input
                  className="w-full border rounded px-2 py-1.5 text-sm"
                  value={editData.title}
                  onChange={e => setEditData(d => ({ ...d, title: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Фаза</label>
                <input
                  className="w-full border rounded px-2 py-1.5 text-sm"
                  placeholder="Проектирование, Строительство..."
                  value={editData.phase}
                  onChange={e => setEditData(d => ({ ...d, phase: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Роль</label>
                <input
                  className="w-full border rounded px-2 py-1.5 text-sm"
                  placeholder="Инженер-проектировщик..."
                  value={editData.roleName}
                  onChange={e => setEditData(d => ({ ...d, roleName: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Базовая длительность (дн.)</label>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  className="w-full border rounded px-2 py-1.5 text-sm"
                  value={editData.baseDuration}
                  onChange={e => setEditData(d => ({ ...d, baseDuration: Number(e.target.value) }))}
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Формула нормирования</label>
              <FormulaBuilder value={formula} params={params} onChange={setFormula} />
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <button type="button" onClick={() => setEditing(false)} className="px-3 py-1.5 text-sm text-gray-600">
                Отмена
              </button>
              <button
                type="button"
                onClick={() => {
                  updateMut.mutate({ ...editData, formulaJson: formula })
                  setEditing(false)
                }}
                className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded"
              >
                Сохранить
              </button>
            </div>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <>
      <tr className="hover:bg-gray-50 group">
        <td className="px-4 py-2">
          <div style={{ paddingLeft: `${depth * 20}px` }} className="flex items-center gap-1">
            <span className="text-gray-300">{'└'}</span>
            <span className="text-sm text-gray-900">{task.title}</span>
            {task.phase && (
              <span className="text-xs text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded ml-1">{task.phase}</span>
            )}
          </div>
        </td>
        <td className="px-2 py-2 text-xs text-gray-500">{task.roleName ?? '—'}</td>
        <td className="px-2 py-2 text-xs text-gray-700 text-center">{task.baseDuration} дн.</td>
        <td className="px-2 py-2 text-xs text-center">
          {task.formulaJson ? (
            <span className="text-green-600 text-xs">∫</span>
          ) : (
            <span className="text-gray-300">—</span>
          )}
        </td>
        <td className="px-2 py-2 text-xs text-gray-500">
          {task.dependencies?.length > 0 && (
            <span className="text-gray-600">{task.dependencies.map(d => d.type).join(', ')}</span>
          )}
        </td>
        <td className="px-2 py-2">
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => setEditing(true)} className="text-xs text-indigo-600 hover:underline px-1">
              Изм.
            </button>
            <button onClick={() => setShowDeps(!showDeps)} className="text-xs text-gray-500 hover:underline px-1">
              Зависим.
            </button>
            <button
              onClick={() => {
                if (confirm('Удалить задачу?')) deleteMut.mutate()
              }}
              className="text-xs text-red-400 hover:underline px-1"
            >
              Удал.
            </button>
          </div>
        </td>
      </tr>
      {showDeps && (
        <tr>
          <td colSpan={6} className="px-8 py-2 bg-blue-50">
            <div className="text-xs text-gray-700">
              <span className="font-medium">Зависимости:</span>{' '}
              {task.dependencies?.map(d => {
                const pred = allTasks.find(t => t.id === d.predecessorId)
                return (
                  <span key={d.id} className="inline-flex items-center gap-1 mr-2 bg-white border rounded px-1.5 py-0.5">
                    {pred?.title ?? d.predecessorId} ({d.type}{d.lagDays ? ` +${d.lagDays}д` : ''})
                    <button
                      onClick={() => delDepMut.mutate(d.id)}
                      className="text-red-400 hover:text-red-600 ml-0.5"
                    >
                      ✕
                    </button>
                  </span>
                )
              })}
              <div className="flex items-center gap-2 mt-2">
                <select
                  className="border rounded px-2 py-1 text-xs"
                  value={depPredId}
                  onChange={e => setDepPredId(e.target.value)}
                >
                  <option value="">Выберите предшественника...</option>
                  {otherTasks.map(t => (
                    <option key={t.id} value={t.id}>{t.title}</option>
                  ))}
                </select>
                <select
                  className="border rounded px-2 py-1 text-xs w-20"
                  value={depType}
                  onChange={e => setDepType(e.target.value as any)}
                >
                  <option value="FS">FS</option>
                  <option value="SS">SS</option>
                  <option value="FF">FF</option>
                  <option value="SF">SF</option>
                </select>
                <button
                  onClick={() => { if (depPredId) addDepMut.mutate() }}
                  disabled={!depPredId}
                  className="px-2 py-1 text-xs bg-blue-600 text-white rounded disabled:opacity-40"
                >
                  Добавить
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ── Add Task Form ─────────────────────────────────────────────────────────────

function AddTaskRow({
  templateId,
  parentId,
  onDone,
}: {
  templateId: string
  parentId?: string
  onDone: () => void
}) {
  const [title, setTitle] = useState('')
  const [phase, setPhase] = useState('')
  const [baseDuration, setBaseDuration] = useState(5)

  const mut = useMutation({
    mutationFn: () => templatesApi.createTask(templateId, { title, phase, baseDuration, parentId }),
    onSuccess: onDone,
  })

  return (
    <tr className="bg-indigo-50">
      <td className="px-4 py-2">
        <input
          className="w-full border rounded px-2 py-1 text-sm"
          placeholder="Название задачи"
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && title && mut.mutate()}
          autoFocus
        />
      </td>
      <td className="px-2 py-2" />
      <td className="px-2 py-2">
        <input
          type="number"
          min={0}
          step={0.5}
          className="w-20 border rounded px-2 py-1 text-sm"
          value={baseDuration}
          onChange={e => setBaseDuration(Number(e.target.value))}
        />
      </td>
      <td className="px-2 py-2">
        <input
          className="w-full border rounded px-2 py-1 text-xs"
          placeholder="Фаза"
          value={phase}
          onChange={e => setPhase(e.target.value)}
        />
      </td>
      <td colSpan={2} className="px-2 py-2">
        <div className="flex gap-2">
          <button
            onClick={() => title && mut.mutate()}
            disabled={!title || mut.isPending}
            className="px-2 py-1 text-xs bg-indigo-600 text-white rounded disabled:opacity-40"
          >
            Добавить
          </button>
          <button onClick={onDone} className="text-xs text-gray-500 hover:underline">
            Отмена
          </button>
        </div>
      </td>
    </tr>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

function flattenTasks(tasks: TemplateTask[], parentId: string | null = null, depth = 0): { task: TemplateTask; depth: number }[] {
  const result: { task: TemplateTask; depth: number }[] = []
  for (const t of tasks.filter(tt => tt.parentId === parentId)) {
    result.push({ task: t, depth })
    result.push(...flattenTasks(tasks, t.id, depth + 1))
  }
  return result
}

export function TemplateEditorPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [addingTask, setAddingTask] = useState(false)
  const [activeTab, setActiveTab] = useState<'tasks' | 'documents' | 'stats'>('tasks')

  const { data: template, isLoading } = useQuery({
    queryKey: ['template', id],
    queryFn: () => templatesApi.get(id!),
    enabled: !!id,
  })

  const { data: params = [] } = useQuery<NormParam[]>({
    queryKey: ['norm-params'],
    queryFn: normParamsApi.list,
  })

  const refresh = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['template', id] })
  }, [qc, id])

  const publishMut = useMutation({
    mutationFn: (isPublished: boolean) => templatesApi.update(id!, { isPublished }),
    onSuccess: refresh,
  })

  const deleteMut = useMutation({
    mutationFn: () => templatesApi.delete(id!),
    onSuccess: () => navigate('/templates'),
  })

  if (isLoading || !template) return <div className="p-6 text-gray-400">Загрузка...</div>

  const flatTasks = flattenTasks(template.tasks ?? [])
  const allTasks = template.tasks ?? []

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <Link to="/templates" className="text-gray-400 hover:text-gray-600 text-sm">← Шаблоны</Link>
      </div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-gray-900">{template.name}</h1>
            {template.isPublished ? (
              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Опубликован v{template.version}</span>
            ) : (
              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Черновик</span>
            )}
          </div>
          {template.category && <p className="text-sm text-gray-500">{template.category}</p>}
          {template.description && <p className="text-sm text-gray-400 mt-1">{template.description}</p>}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => publishMut.mutate(!template.isPublished)}
            className="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50"
          >
            {template.isPublished ? 'Снять с публикации' : 'Опубликовать'}
          </button>
          <Link
            to={`/templates/${id}/create-project`}
            className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            Создать проект
          </Link>
          <button
            onClick={() => { if (confirm('Удалить шаблон?')) deleteMut.mutate() }}
            className="px-3 py-1.5 text-sm text-red-500 hover:bg-red-50 border border-red-200 rounded-lg"
          >
            Удалить
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b mb-4">
        {(['tasks', 'documents', 'stats'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab === 'tasks' ? 'Задачи' : tab === 'documents' ? 'Документы' : 'Статистика'}
          </button>
        ))}
      </div>

      {/* Tasks Tab */}
      {activeTab === 'tasks' && (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
            <span className="text-sm font-medium text-gray-700">{flatTasks.length} задач</span>
            {!addingTask && (
              <button
                onClick={() => setAddingTask(true)}
                className="text-sm text-indigo-600 hover:underline"
              >
                + Добавить задачу
              </button>
            )}
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-gray-500 text-xs">Название</th>
                <th className="text-left px-2 py-2 font-medium text-gray-500 text-xs w-32">Роль</th>
                <th className="text-center px-2 py-2 font-medium text-gray-500 text-xs w-24">База (дн.)</th>
                <th className="text-center px-2 py-2 font-medium text-gray-500 text-xs w-16">Формула</th>
                <th className="text-left px-2 py-2 font-medium text-gray-500 text-xs w-24">Зависим.</th>
                <th className="w-24 px-2 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {flatTasks.map(({ task, depth }) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  depth={depth}
                  params={params}
                  templateId={template.id}
                  allTasks={allTasks}
                  onRefresh={refresh}
                />
              ))}
              {addingTask && (
                <AddTaskRow
                  templateId={template.id}
                  onDone={() => { setAddingTask(false); refresh() }}
                />
              )}
              {flatTasks.length === 0 && !addingTask && (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-gray-400">
                    Задач нет — нажмите «Добавить задачу»
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Documents Tab */}
      {activeTab === 'documents' && (
        <DocumentsTab templateId={template.id} documents={template.documents ?? []} onRefresh={refresh} />
      )}

      {/* Stats Tab */}
      {activeTab === 'stats' && (
        <StatsTab templateId={template.id} />
      )}
    </div>
  )
}

// ── Documents Tab ─────────────────────────────────────────────────────────────

function DocumentsTab({
  templateId,
  documents,
  onRefresh,
}: {
  templateId: string
  documents: any[]
  onRefresh: () => void
}) {
  const [name, setName] = useState('')
  const [isRequired, setIsRequired] = useState(false)

  const createMut = useMutation({
    mutationFn: () => templatesApi.createDocument(templateId, { name, isRequired }),
    onSuccess: () => { setName(''); setIsRequired(false); onRefresh() },
  })
  const deleteMut = useMutation({
    mutationFn: templatesApi.deleteDocument,
    onSuccess: onRefresh,
  })

  return (
    <div className="bg-white rounded-xl border shadow-sm">
      <div className="p-4 border-b">
        <div className="flex gap-2">
          <input
            className="flex-1 border rounded-lg px-3 py-1.5 text-sm"
            placeholder="Название документа или чеклиста..."
            value={name}
            onChange={e => setName(e.target.value)}
          />
          <label className="flex items-center gap-1.5 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={isRequired}
              onChange={e => setIsRequired(e.target.checked)}
              className="rounded"
            />
            Обязательный
          </label>
          <button
            onClick={() => name && createMut.mutate()}
            disabled={!name}
            className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg disabled:opacity-40"
          >
            Добавить
          </button>
        </div>
      </div>
      <ul className="divide-y">
        {documents.length === 0 && (
          <li className="text-center py-8 text-gray-400 text-sm">Документов нет</li>
        )}
        {documents.map((d: any) => (
          <li key={d.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-900">{d.name}</span>
              {d.isRequired && (
                <span className="text-xs bg-red-50 text-red-600 px-1.5 py-0.5 rounded">обязательный</span>
              )}
            </div>
            <button
              onClick={() => { if (confirm('Удалить?')) deleteMut.mutate(d.id) }}
              className="text-xs text-red-400 hover:underline"
            >
              Удалить
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ── Stats Tab ─────────────────────────────────────────────────────────────────

function StatsTab({ templateId }: { templateId: string }) {
  const qc = useQueryClient()
  const { data: stats, isLoading } = useQuery({
    queryKey: ['template-stats', templateId],
    queryFn: () => templatesApi.getStats(templateId),
  })

  const [selectedUpdates, setSelectedUpdates] = useState<Record<string, number>>({})

  const actualizeMut = useMutation({
    mutationFn: () =>
      templatesApi.actualize(
        templateId,
        Object.entries(selectedUpdates).map(([templateTaskId, newBaseDuration]) => ({ templateTaskId, newBaseDuration })),
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['template-stats', templateId] })
      qc.invalidateQueries({ queryKey: ['template', templateId] })
      setSelectedUpdates({})
    },
  })

  if (isLoading) return <div className="py-8 text-center text-gray-400">Загрузка...</div>
  if (!stats) return <div className="py-8 text-center text-gray-400">Нет данных</div>

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-indigo-600">{stats.template.usageCount}</p>
          <p className="text-sm text-gray-500 mt-1">Проектов создано</p>
        </div>
        <div className="bg-white border rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-gray-800">{stats.tasks.length}</p>
          <p className="text-sm text-gray-500 mt-1">Задач в шаблоне</p>
        </div>
        <div className="bg-white border rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-amber-600">{stats.actualizationSuggestions.length}</p>
          <p className="text-sm text-gray-500 mt-1">Задач для актуализации</p>
        </div>
      </div>

      {stats.actualizationSuggestions.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <h3 className="font-medium text-amber-900 mb-3">Предложения по актуализации</h3>
          <p className="text-xs text-amber-700 mb-3">
            Фактические данные по завершённым проектам показывают значительное отклонение от плановых значений.
            Отметьте задачи, которые нужно обновить.
          </p>
          <div className="space-y-2">
            {stats.actualizationSuggestions.map(s => (
              <label key={s.templateTaskId} className="flex items-center gap-3 p-2 bg-white rounded border">
                <input
                  type="checkbox"
                  checked={!!selectedUpdates[s.templateTaskId]}
                  onChange={e => {
                    if (e.target.checked) {
                      setSelectedUpdates(prev => ({ ...prev, [s.templateTaskId]: s.suggestedBase }))
                    } else {
                      setSelectedUpdates(prev => { const n = { ...prev }; delete n[s.templateTaskId]; return n })
                    }
                  }}
                  className="rounded"
                />
                <div className="flex-1">
                  <span className="text-sm font-medium text-gray-900">{s.title}</span>
                  <div className="text-xs text-gray-500 mt-0.5">
                    Текущая база: {s.currentBase} дн. → Факт среднее: {s.suggestedBase} дн.
                    <span className={`ml-2 font-medium ${s.deviationPct > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {s.deviationPct > 0 ? '+' : ''}{s.deviationPct}%
                    </span>
                  </div>
                </div>
              </label>
            ))}
          </div>
          <button
            onClick={() => actualizeMut.mutate()}
            disabled={Object.keys(selectedUpdates).length === 0 || actualizeMut.isPending}
            className="mt-3 px-4 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-40"
          >
            Применить актуализацию
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50">
          <span className="text-sm font-medium text-gray-700">Использование задач</span>
        </div>
        <table className="w-full text-sm">
          <thead className="border-b">
            <tr>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Задача</th>
              <th className="text-center px-4 py-2 text-xs font-medium text-gray-500">Использ.</th>
              <th className="text-center px-4 py-2 text-xs font-medium text-gray-500">Факт среднее</th>
              <th className="text-center px-4 py-2 text-xs font-medium text-gray-500">Отклонение</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {stats.tasks.map(t => (
              <tr key={t.id} className={t.needsUpdate ? 'bg-amber-50' : ''}>
                <td className="px-4 py-2 text-gray-900">
                  {t.title}
                  {t.phase && <span className="text-xs text-violet-600 ml-2">{t.phase}</span>}
                </td>
                <td className="px-4 py-2 text-center text-gray-600">{t.usageCount}</td>
                <td className="px-4 py-2 text-center text-gray-600">
                  {t.stat?.avgActualDays != null ? `${Number(t.stat.avgActualDays).toFixed(1)} дн.` : '—'}
                </td>
                <td className="px-4 py-2 text-center">
                  {t.stat?.avgDeviationPct != null ? (
                    <span className={Number(t.stat.avgDeviationPct) > 0 ? 'text-red-600' : 'text-green-600'}>
                      {Number(t.stat.avgDeviationPct) > 0 ? '+' : ''}
                      {Number(t.stat.avgDeviationPct).toFixed(0)}%
                    </span>
                  ) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
