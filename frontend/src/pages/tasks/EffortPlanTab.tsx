import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { effortApi } from '@/api/effort'
import type { TaskRoleEffort, DistributionRule } from '@/types/effort'
import { DISTRIBUTION_LABELS } from '@/types/effort'

// Org roles fetcher (reuse existing roles API)
import { api } from '@/api/client'

interface OrgRole { id: string; name: string }

function useOrgRoles() {
  return useQuery<OrgRole[]>({
    queryKey: ['org-roles-simple'],
    queryFn: async () => { const r = await api.get('/roles'); return r.data },
  })
}

// ── Distribution preview bar ──────────────────────────────────────────────────

function DistributionPreview({
  rule,
  n = 8,
}: {
  rule: DistributionRule
  n?: number
}) {
  const weights: number[] = (() => {
    switch (rule) {
      case 'uniform': return Array(n).fill(1)
      case 'front_loaded': return Array.from({ length: n }, (_, i) => n - i)
      case 'back_loaded': return Array.from({ length: n }, (_, i) => i + 1)
      case 's_curve': return Array.from({ length: n }, (_, i) => {
        const x = (i + 0.5) / n
        return Math.exp(-0.5 * Math.pow((x - 0.5) / 0.18, 2))
      })
      case 'manual': return Array(n).fill(1)
    }
  })()
  const max = Math.max(...weights)
  return (
    <div className="flex items-end gap-0.5 h-6">
      {weights.map((w, i) => (
        <div
          key={i}
          className="flex-1 bg-indigo-400 rounded-sm"
          style={{ height: `${Math.round((w / max) * 100)}%`, minHeight: 2 }}
        />
      ))}
    </div>
  )
}

// ── Role effort row (view + edit inline) ──────────────────────────────────────

function RoleEffortRow({
  effort,
  taskId,
  taskStartDate,
  taskDueDate,
  onRefresh,
}: {
  effort: TaskRoleEffort
  taskId: string
  taskStartDate: string | null
  taskDueDate: string | null
  onRefresh: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [hours, setHours] = useState(effort.plannedHours)
  const [rule, setRule] = useState<DistributionRule>(effort.distribution)
  const [note, setNote] = useState(effort.note ?? '')

  const saveMut = useMutation({
    mutationFn: () => effortApi.upsertRoleEffort(taskId, {
      roleId: effort.roleId,
      plannedHours: hours,
      distribution: rule,
      note: note || undefined,
    }),
    onSuccess: () => { setEditing(false); onRefresh() },
  })
  const deleteMut = useMutation({
    mutationFn: () => effortApi.deleteRoleEffort(effort.id),
    onSuccess: onRefresh,
  })

  // Group periods by month for display
  const periods = effort.periods
  const totalPeriods = periods.length
  const firstWeek = periods[0]?.weekStart
  const lastWeek = periods[periods.length - 1]?.weekStart

  if (editing) {
    return (
      <div className="border rounded-lg p-3 bg-gray-50 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-900 flex-1">{effort.role.name}</span>
          <button onClick={() => setEditing(false)} className="text-xs text-gray-400 hover:text-gray-600">Отмена</button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Плановые часы</label>
            <input
              type="number"
              min={0}
              step={0.5}
              className="w-full border rounded px-2 py-1.5 text-sm"
              value={hours}
              onChange={e => setHours(Number(e.target.value))}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Правило распределения</label>
            <select
              className="w-full border rounded px-2 py-1.5 text-sm"
              value={rule}
              onChange={e => setRule(e.target.value as DistributionRule)}
            >
              {(Object.entries(DISTRIBUTION_LABELS) as [DistributionRule, string][]).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-gray-500">Превью распределения</label>
          </div>
          <DistributionPreview rule={rule} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Примечание</label>
          <input
            className="w-full border rounded px-2 py-1.5 text-sm"
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Опционально..."
          />
        </div>
        <div className="flex gap-2 justify-end">
          <button
            onClick={() => { if (confirm('Удалить план по роли?')) deleteMut.mutate() }}
            className="text-xs text-red-500 hover:underline"
          >
            Удалить
          </button>
          <button
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending}
            className="px-3 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
          >
            Сохранить
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className="border rounded-lg p-3 hover:border-indigo-200 cursor-pointer transition-colors"
      onClick={() => setEditing(true)}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-gray-900">{effort.role.name}</p>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-lg font-bold text-indigo-600">{Number(effort.plannedHours)} ч</span>
            <span className="text-xs text-gray-400">{DISTRIBUTION_LABELS[effort.distribution]}</span>
            {totalPeriods > 0 && (
              <span className="text-xs text-gray-400">
                {firstWeek?.slice(0, 7)} — {lastWeek?.slice(0, 7)}
              </span>
            )}
          </div>
          {effort.note && <p className="text-xs text-gray-400 mt-0.5">{effort.note}</p>}
        </div>
        <div className="w-24 flex-shrink-0">
          <DistributionPreview rule={effort.distribution} />
        </div>
      </div>

      {/* Period mini-grid */}
      {periods.length > 0 && (
        <div className="mt-2 pt-2 border-t">
          <div className="flex gap-1 overflow-x-auto">
            {periods.map(p => (
              <div key={p.id} className="flex-shrink-0 text-center min-w-[36px]">
                <div className="text-[9px] text-gray-400">{p.weekStart.slice(5, 10)}</div>
                <div className="text-xs font-medium text-gray-700">{Number(p.plannedHours)}ч</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {periods.length === 0 && (!taskStartDate || !taskDueDate) && (
        <p className="text-xs text-amber-600 mt-1">⚠ Укажите даты задачи для разбивки по периодам</p>
      )}
    </div>
  )
}

// ── Add role effort form ──────────────────────────────────────────────────────

function AddRoleEffortForm({
  taskId,
  existingRoleIds,
  onDone,
}: {
  taskId: string
  existingRoleIds: string[]
  onDone: () => void
}) {
  const { data: roles = [] } = useOrgRoles()
  const available = roles.filter(r => !existingRoleIds.includes(r.id))

  const [roleId, setRoleId] = useState(available[0]?.id ?? '')
  const [hours, setHours] = useState(40)
  const [rule, setRule] = useState<DistributionRule>('uniform')

  const mut = useMutation({
    mutationFn: () => effortApi.upsertRoleEffort(taskId, { roleId, plannedHours: hours, distribution: rule }),
    onSuccess: onDone,
  })

  if (!available.length) {
    return <p className="text-xs text-gray-400 py-2">Все роли уже добавлены</p>
  }

  return (
    <div className="border border-indigo-200 rounded-lg p-3 bg-indigo-50 space-y-2">
      <p className="text-xs font-medium text-indigo-700">Добавить роль</p>
      <div className="flex gap-2">
        <select
          className="flex-1 border rounded px-2 py-1.5 text-sm"
          value={roleId}
          onChange={e => setRoleId(e.target.value)}
        >
          {available.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <input
          type="number"
          min={0}
          step={0.5}
          className="w-20 border rounded px-2 py-1.5 text-sm"
          value={hours}
          onChange={e => setHours(Number(e.target.value))}
          title="Часы"
        />
        <select
          className="w-28 border rounded px-2 py-1.5 text-sm"
          value={rule}
          onChange={e => setRule(e.target.value as DistributionRule)}
        >
          {(Object.entries(DISTRIBUTION_LABELS) as [DistributionRule, string][]).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={onDone} className="text-xs text-gray-500 hover:underline">Отмена</button>
        <button
          onClick={() => mut.mutate()}
          disabled={!roleId || mut.isPending}
          className="px-3 py-1 text-xs bg-indigo-600 text-white rounded disabled:opacity-40"
        >
          Добавить
        </button>
      </div>
    </div>
  )
}

// ── Main tab ──────────────────────────────────────────────────────────────────

export function EffortPlanTab({
  taskId,
  taskStartDate,
  taskDueDate,
}: {
  taskId: string
  taskStartDate: string | null
  taskDueDate: string | null
}) {
  const qc = useQueryClient()
  const [adding, setAdding] = useState(false)

  const { data: efforts = [], isLoading } = useQuery<TaskRoleEffort[]>({
    queryKey: ['task-effort', taskId],
    queryFn: () => effortApi.getTaskEffort(taskId),
  })

  const refresh = () => qc.invalidateQueries({ queryKey: ['task-effort', taskId] })

  const totalPlanned = efforts.reduce((s, e) => s + Number(e.plannedHours), 0)

  if (isLoading) return <div className="py-6 text-center text-gray-400 text-sm">Загрузка...</div>

  return (
    <div className="space-y-3">
      {/* Summary */}
      {efforts.length > 0 && (
        <div className="bg-indigo-50 rounded-lg px-4 py-3 flex items-center gap-4">
          <div>
            <p className="text-xs text-indigo-600">Итого план</p>
            <p className="text-2xl font-bold text-indigo-700">{totalPlanned} ч</p>
          </div>
          <div className="text-xs text-indigo-600">
            {efforts.length} {efforts.length === 1 ? 'роль' : 'роли'}
          </div>
          {(!taskStartDate || !taskDueDate) && (
            <div className="ml-auto text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1">
              Нет дат → периоды не рассчитаны
            </div>
          )}
        </div>
      )}

      {/* Role effort entries */}
      <div className="space-y-2">
        {efforts.map(e => (
          <RoleEffortRow
            key={e.id}
            effort={e}
            taskId={taskId}
            taskStartDate={taskStartDate}
            taskDueDate={taskDueDate}
            onRefresh={refresh}
          />
        ))}
      </div>

      {/* Add form */}
      {adding ? (
        <AddRoleEffortForm
          taskId={taskId}
          existingRoleIds={efforts.map(e => e.roleId)}
          onDone={() => { setAdding(false); refresh() }}
        />
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="w-full text-sm text-indigo-600 hover:text-indigo-800 border border-dashed border-indigo-300 rounded-lg py-2 hover:border-indigo-500 transition-colors"
        >
          + Добавить роль
        </button>
      )}
    </div>
  )
}
