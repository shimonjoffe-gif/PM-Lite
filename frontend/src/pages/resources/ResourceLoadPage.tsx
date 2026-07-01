import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { effortApi } from '@/api/effort'
import type { ResourceLoadResult, RoleLoadRow, UserLoadRow } from '@/types/effort'
import { api } from '@/api/client'

interface Project { id: string; name: string }

function getMondayStr(offsetWeeks = 0): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  const dow = d.getDay()
  const diff = dow === 0 ? -6 : 1 - dow
  d.setDate(d.getDate() + diff + offsetWeeks * 7)
  return d.toISOString().split('T')[0]
}

function addWeeks(dateStr: string, n: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + n * 7)
  return d.toISOString().split('T')[0]
}

function fmtWeek(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('ru', { day: 'numeric', month: 'short' })
}

// ── Heatmap cell ─────────────────────────────────────────────────────────────

function PlanActualCell({ planned, actual }: { planned: number; actual: number }) {
  const utilPct = planned > 0 ? Math.round((actual / planned) * 100) : null
  const bg =
    actual === 0 && planned === 0 ? 'bg-gray-50 text-gray-300'
    : utilPct !== null && utilPct > 110 ? 'bg-red-100 text-red-700'
    : utilPct !== null && utilPct > 90 ? 'bg-green-100 text-green-700'
    : 'bg-blue-50 text-blue-700'

  return (
    <td className={`px-1.5 py-1 text-center text-xs border-r border-gray-100 ${bg} min-w-[52px]`}>
      {planned > 0 || actual > 0 ? (
        <div>
          <div className="font-medium">{actual}ч</div>
          <div className="text-[9px] opacity-70">/ {planned}ч</div>
        </div>
      ) : <span>—</span>}
    </td>
  )
}

function UserCapacityCell({ actual, capacity, overloaded }: { actual: number; capacity: number; overloaded: boolean }) {
  const bg =
    actual === 0 ? 'bg-gray-50 text-gray-300'
    : overloaded ? 'bg-red-100 text-red-700'
    : 'bg-blue-50 text-blue-700'
  return (
    <td className={`px-1.5 py-1 text-center text-xs border-r border-gray-100 ${bg} min-w-[52px]`}>
      {actual > 0 ? (
        <div>
          <div className="font-medium">{actual}ч</div>
          <div className="text-[9px] opacity-70">/ {capacity}ч</div>
        </div>
      ) : <span>—</span>}
    </td>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function ResourceLoadPage() {
  const [projectId, setProjectId] = useState<string>('')
  const [from, setFrom] = useState(getMondayStr(-1))
  const [weeksCount, setWeeksCount] = useState(8)
  const to = addWeeks(from, weeksCount - 1)
  const [view, setView] = useState<'roles' | 'users'>('roles')

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ['projects-short'],
    queryFn: async () => { const r = await api.get('/projects'); return r.data.items ?? r.data },
  })

  const { data, isLoading, error } = useQuery<ResourceLoadResult>({
    queryKey: ['resource-load', projectId, from, to],
    queryFn: () => effortApi.getResourceLoad({ projectId: projectId || undefined, from, to }),
  })

  const weeks = data?.weeks ?? []

  return (
    <div className="flex flex-col min-h-[calc(100vh-56px)] -mx-3 sm:-mx-4 lg:-mx-6 xl:-mx-8 -mt-4 sm:-mt-6">
      {/* Page header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-white flex-shrink-0">
        <h1 className="text-xl font-semibold text-gray-900">Загрузка ресурсов</h1>
      </div>

      {/* Filters */}
      <div className="px-4 sm:px-6 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-3 sm:gap-4 flex-shrink-0 flex-wrap overflow-x-auto">
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">Проект</label>
          <select
            className="border rounded px-2 py-1 text-sm"
            value={projectId}
            onChange={e => setProjectId(e.target.value)}
          >
            <option value="">Все проекты</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">С недели</label>
          <input
            type="date"
            className="border rounded px-2 py-1 text-sm"
            value={from}
            onChange={e => setFrom(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">Недель</label>
          <select
            className="border rounded px-2 py-1 text-sm"
            value={weeksCount}
            onChange={e => setWeeksCount(Number(e.target.value))}
          >
            {[4, 6, 8, 12, 16, 26].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>

        {/* View toggle */}
        <div className="ml-auto flex rounded-lg border border-gray-200 overflow-hidden text-xs">
          <button
            className={`px-3 py-1.5 ${view === 'roles' ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
            onClick={() => setView('roles')}
          >
            По ролям
          </button>
          <button
            className={`px-3 py-1.5 ${view === 'users' ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
            onClick={() => setView('users')}
          >
            По людям
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="px-6 py-2 flex items-center gap-4 text-xs text-gray-500 flex-shrink-0">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded bg-blue-100" /> Норм
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded bg-green-100" /> Высокая загрузка
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded bg-red-100" /> Перегрузка
        </span>
        {view === 'roles' && <span className="text-gray-400">Факт ч / план ч</span>}
        {view === 'users' && <span className="text-gray-400">Факт ч / ёмкость ч</span>}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-6 pb-6">
        {isLoading && (
          <div className="py-12 text-center text-gray-400">Загрузка...</div>
        )}
        {error && (
          <div className="py-8 text-center text-red-500 text-sm">Ошибка загрузки данных</div>
        )}
        {data && (
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 bg-white z-10">
              <tr>
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 border-b border-r border-gray-200 min-w-[160px]">
                  {view === 'roles' ? 'Роль' : 'Сотрудник'}
                </th>
                {weeks.map(w => (
                  <th key={w} className="px-1.5 py-2 text-center text-[10px] font-medium text-gray-500 border-b border-r border-gray-100 min-w-[52px]">
                    {fmtWeek(w)}
                  </th>
                ))}
                <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 border-b border-gray-200 min-w-[60px]">
                  Итого
                </th>
              </tr>
            </thead>
            <tbody>
              {view === 'roles' && (data.byRole as RoleLoadRow[]).map(row => (
                <tr key={row.roleId} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-3 py-1.5 text-sm font-medium text-gray-800 border-r border-gray-200">
                    {row.roleName}
                  </td>
                  {row.weeks.map(w => (
                    <PlanActualCell key={w.weekStart} planned={w.plannedHours} actual={w.actualHours} />
                  ))}
                  <td className="px-2 py-1.5 text-center text-xs font-medium text-gray-700">
                    <div>{row.totalActual}ч</div>
                    <div className="text-[9px] text-gray-400">/ {row.totalPlanned}ч</div>
                  </td>
                </tr>
              ))}
              {view === 'users' && (data.byUser as UserLoadRow[]).map(row => (
                <tr key={row.userId} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-3 py-1.5 border-r border-gray-200">
                    <div className="text-sm font-medium text-gray-800">{row.fullName}</div>
                    {row.roleName && <div className="text-[10px] text-gray-400">{row.roleName}</div>}
                  </td>
                  {row.weeks.map(w => (
                    <UserCapacityCell
                      key={w.weekStart}
                      actual={w.actualHours}
                      capacity={w.capacityHours}
                      overloaded={w.overloaded}
                    />
                  ))}
                  <td className="px-2 py-1.5 text-center text-xs font-medium text-gray-700">
                    {row.totalActual}ч
                  </td>
                </tr>
              ))}
              {view === 'roles' && data.byRole.length === 0 && (
                <tr><td colSpan={weeks.length + 2} className="py-10 text-center text-gray-400 text-sm">Нет данных по плановым трудозатратам</td></tr>
              )}
              {view === 'users' && data.byUser.length === 0 && (
                <tr><td colSpan={weeks.length + 2} className="py-10 text-center text-gray-400 text-sm">Нет данных по фактическим трудозатратам</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
