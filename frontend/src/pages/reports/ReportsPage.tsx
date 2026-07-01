import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { ReportType, ReportFilters } from '@/types/report'
import { reportsApi } from '@/api/reports'
import { ReportFilterBar } from './ReportFilters'
import { BarChart, BurndownChart, ChartLegend } from './Charts'

const TABS: { id: ReportType; label: string }[] = [
  { id: 'projects_summary', label: 'Сводка по проектам' },
  { id: 'team_load', label: 'Загрузка команды' },
  { id: 'tasks_completion', label: 'Выполнение задач' },
  { id: 'billable_stages', label: 'Актируемые этапы' },
]

// ── Status badge ──────────────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  todo: 'bg-gray-100 text-gray-600',
  in_progress: 'bg-blue-100 text-blue-700',
  review: 'bg-purple-100 text-purple-700',
  done: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-50 text-red-500',
}
const STATUS_LABELS: Record<string, string> = {
  todo: 'К выполнению',
  in_progress: 'В работе',
  review: 'На проверке',
  done: 'Выполнено',
  cancelled: 'Отменено',
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}

// ── Projects Summary ──────────────────────────────────────────────────────────
function ProjectsSummaryTab({ filters, onChange }: { filters: ReportFilters; onChange: (f: ReportFilters) => void }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ['report-projects', filters],
    queryFn: () => reportsApi.getProjectsSummary(filters),
    staleTime: 30_000,
  })

  return (
    <div className="space-y-4">
      <ReportFilterBar
        filters={filters}
        onChange={onChange}
        reportType="projects_summary"
        showProject
      />
      {isLoading ? <Loading /> : !data.length ? <Empty /> : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Проект', 'Владелец', 'Статус', '% выполнения', 'Выполнено', 'Просрочено', 'Трудоёмкость', 'Бюджет', 'Даты'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.map(r => (
                <tr key={r.projectId} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-medium text-gray-900">{r.projectName}</td>
                  <td className="px-4 py-2.5 text-gray-600">{r.ownerName ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    {r.statusName ? (
                      <span className="inline-flex items-center gap-1 text-xs">
                        <span className="w-2 h-2 rounded-full" style={{ background: r.statusColor ?? '#6b7280' }} />
                        {r.statusName}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-20 bg-gray-200 rounded-full h-1.5">
                        <div
                          className="bg-blue-500 h-1.5 rounded-full"
                          style={{ width: `${r.completionPct}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-600">{r.completionPct}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-center text-gray-600">{r.doneTasks}/{r.totalTasks}</td>
                  <td className="px-4 py-2.5 text-center">
                    {r.overdueTasks > 0
                      ? <span className="text-red-600 font-semibold">{r.overdueTasks}</span>
                      : <span className="text-gray-400">0</span>}
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">{r.effortHours}ч</td>
                  <td className="px-4 py-2.5 text-gray-600">{r.budget !== null ? `${r.budget.toLocaleString('ru')} ₽` : '—'}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                    {r.startDate ?? '?'} — {r.endDate ?? '?'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Team Load ─────────────────────────────────────────────────────────────────
function TeamLoadTab({ filters, onChange }: { filters: ReportFilters; onChange: (f: ReportFilters) => void }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ['report-team-load', filters],
    queryFn: () => reportsApi.getTeamLoad(filters),
    staleTime: 30_000,
  })

  return (
    <div className="space-y-4">
      <ReportFilterBar filters={filters} onChange={onChange} reportType="team_load" showUser />
      {isLoading ? <Loading /> : !data.length ? <Empty /> : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Сотрудник', 'Ёмкость (ч)', 'Назначено (ч)', '% загрузки', 'Всего задач', 'Выполнено'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.map(r => (
                <tr key={r.userId} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-medium text-gray-900">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center flex-shrink-0">
                        {r.fullName.charAt(0)}
                      </div>
                      {r.fullName}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">{r.capacityHours}</td>
                  <td className="px-4 py-2.5 text-gray-600">{r.assignedHours}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-20 bg-gray-200 rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full ${r.loadPct > 100 ? 'bg-red-500' : r.loadPct > 80 ? 'bg-yellow-400' : 'bg-green-500'}`}
                          style={{ width: `${Math.min(100, r.loadPct)}%` }}
                        />
                      </div>
                      <span className={`text-xs font-medium ${r.loadPct > 100 ? 'text-red-600' : r.loadPct > 80 ? 'text-yellow-600' : 'text-gray-600'}`}>
                        {r.loadPct}%
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">{r.taskCount}</td>
                  <td className="px-4 py-2.5 text-gray-600">{r.doneTasks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Tasks Completion ──────────────────────────────────────────────────────────
function TasksCompletionTab({ filters, onChange, projectId }: {
  filters: ReportFilters
  onChange: (f: ReportFilters) => void
  projectId?: string
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['report-tasks', filters, projectId],
    queryFn: () => projectId
      ? reportsApi.getProjectTasksCompletion(projectId, filters)
      : reportsApi.getTasksCompletion(filters),
    staleTime: 30_000,
  })

  const BAR_SERIES = [
    { key: 'done', label: 'Выполнено', color: '#22c55e' },
    { key: 'created', label: 'Всего', color: '#93c5fd' },
    { key: 'overdue', label: 'Просрочено', color: '#ef4444' },
  ]

  return (
    <div className="space-y-5">
      <ReportFilterBar
        filters={filters}
        onChange={onChange}
        reportType="tasks_completion"
        showGranularity
        showProject={!projectId}
        showUser
        showStatus
      />

      {isLoading ? <Loading /> : !data ? <Empty /> : (
        <>
          {/* Bar chart */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-800">Задачи по периодам</h3>
            </div>
            <ChartLegend series={BAR_SERIES} />
            <BarChart data={data.periods} xKey="period" series={BAR_SERIES} />
          </div>

          {/* Burndown */}
          {(data.burndown?.length ?? 0) > 1 && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-3">Диаграмма сгорания</h3>
              <BurndownChart data={data.burndown} />
            </div>
          )}

          {/* Task table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800">Задачи ({data.tasks.length})</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {['Задача', 'Проект', 'Статус', 'Приоритет', 'Исполнитель', 'Срок'].map(h => (
                      <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.tasks.slice(0, 100).map(t => (
                    <tr key={t.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 text-gray-900 max-w-xs truncate">{t.title}</td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs">{t.projectName ?? '—'}</td>
                      <td className="px-4 py-2.5"><StatusBadge status={t.status} /></td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs capitalize">{t.priority}</td>
                      <td className="px-4 py-2.5 text-gray-600">{t.assigneeName ?? '—'}</td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">
                        {t.dueDate
                          ? <span className={t.dueDate < new Date().toISOString().slice(0, 10) && t.status !== 'done' ? 'text-red-600' : ''}>{t.dueDate}</span>
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Billable Stages ───────────────────────────────────────────────────────────
function BillableStagesTab({ filters, onChange, projectId }: {
  filters: ReportFilters
  onChange: (f: ReportFilters) => void
  projectId?: string
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['report-billable', filters, projectId],
    queryFn: () => projectId
      ? reportsApi.getProjectBillableStages(projectId, filters)
      : reportsApi.getBillableStages(filters),
    staleTime: 30_000,
  })

  return (
    <div className="space-y-4">
      <ReportFilterBar
        filters={filters}
        onChange={onChange}
        reportType="billable_stages"
        showProject={!projectId}
        showStatus
      />

      {isLoading ? <Loading /> : !data ? <Empty /> : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Всего этапов', value: data.summary.total },
              { label: 'Выполнено', value: data.summary.done },
              { label: 'Трудоёмкость', value: `${data.summary.totalEffortHours}ч` },
              { label: 'Сумма', value: data.summary.totalAmount ? `${data.summary.totalAmount.toLocaleString('ru')} ₽` : '—' },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs text-gray-500 mb-1">{label}</p>
                <p className="text-xl font-bold text-gray-900">{value}</p>
              </div>
            ))}
          </div>

          {/* Stages table */}
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-sm border-collapse">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Этап', 'Проект', 'Статус', 'Исполнитель', 'Начало', 'Срок', 'Трудоёмкость (ч)', 'Сумма'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.stages.map(s => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-medium text-gray-900 max-w-xs truncate">{s.title}</td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">{s.projectName ?? '—'}</td>
                    <td className="px-4 py-2.5"><StatusBadge status={s.status} /></td>
                    <td className="px-4 py-2.5 text-gray-600">{s.assigneeName ?? '—'}</td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">{s.startDate ?? '—'}</td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">
                      {s.dueDate
                        ? <span className={s.dueDate < new Date().toISOString().slice(0, 10) && s.status !== 'done' ? 'text-red-600' : ''}>{s.dueDate}</span>
                        : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">{s.effortHours ?? '—'}</td>
                    <td className="px-4 py-2.5 text-gray-800 font-medium">
                      {s.amount !== null ? `${s.amount.toLocaleString('ru')} ₽` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              {data.stages.length > 0 && (
                <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                  <tr>
                    <td colSpan={6} className="px-4 py-2 text-xs font-semibold text-gray-600">Итого</td>
                    <td className="px-4 py-2 font-bold text-gray-900">{data.summary.totalEffortHours}ч</td>
                    <td className="px-4 py-2 font-bold text-gray-900">
                      {data.summary.totalAmount ? `${data.summary.totalAmount.toLocaleString('ru')} ₽` : '—'}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </>
      )}
    </div>
  )
}

// ── Shared helpers ────────────────────────────────────────────────────────────
function Loading() {
  return <div className="flex items-center justify-center h-40 text-sm text-gray-400">Загрузка...</div>
}
function Empty() {
  return <div className="flex items-center justify-center h-32 text-sm text-gray-400">Нет данных</div>
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function ReportsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = (searchParams.get('tab') as ReportType) ?? 'projects_summary'

  const [filters, setFilters] = useState<ReportFilters>({})

  const setTab = (tab: ReportType) => {
    setSearchParams({ tab })
    setFilters({})
  }

  const updateFilters = (f: ReportFilters) => {
    setFilters(f)
    const p: Record<string, string> = { tab: activeTab }
    Object.entries(f).forEach(([k, v]) => { if (v) p[k] = String(v) })
    setSearchParams(p)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-white flex-shrink-0">
        <h1 className="text-lg font-bold text-gray-900">Отчёты</h1>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 bg-white px-6 flex-shrink-0">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setTab(tab.id)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-6 py-5">
        {activeTab === 'projects_summary' && (
          <ProjectsSummaryTab filters={filters} onChange={updateFilters} />
        )}
        {activeTab === 'team_load' && (
          <TeamLoadTab filters={filters} onChange={updateFilters} />
        )}
        {activeTab === 'tasks_completion' && (
          <TasksCompletionTab filters={filters} onChange={updateFilters} />
        )}
        {activeTab === 'billable_stages' && (
          <BillableStagesTab filters={filters} onChange={updateFilters} />
        )}
      </div>
    </div>
  )
}

// ── Project-embedded report tab ───────────────────────────────────────────────
export function ProjectReportsTab({ projectId }: { projectId: string }) {
  const [activeTab, setActiveTab] = useState<'tasks_completion' | 'billable_stages'>('tasks_completion')
  const [filters, setFilters] = useState<ReportFilters>({})

  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b border-gray-200">
        {[
          { id: 'tasks_completion', label: 'Выполнение задач' },
          { id: 'billable_stages', label: 'Актируемые этапы' },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => { setActiveTab(t.id as any); setFilters({}) }}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'tasks_completion' && (
        <TasksCompletionTab filters={filters} onChange={setFilters} projectId={projectId} />
      )}
      {activeTab === 'billable_stages' && (
        <BillableStagesTab filters={filters} onChange={setFilters} projectId={projectId} />
      )}
    </div>
  )
}
