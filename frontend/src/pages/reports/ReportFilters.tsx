import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { ReportFilters, ReportType } from '@/types/report'
import { GRANULARITY_LABELS } from '@/types/report'
import { reportsApi } from '@/api/reports'
import { api } from '@/api/client'

interface FilterBarProps {
  filters: ReportFilters
  onChange: (f: ReportFilters) => void
  reportType: ReportType
  showGranularity?: boolean
  showProject?: boolean
  showUser?: boolean
  showStatus?: boolean
}

export function ReportFilterBar({
  filters, onChange, reportType,
  showGranularity, showProject, showUser, showStatus,
}: FilterBarProps) {
  const [saveName, setSaveName] = useState('')
  const [showSave, setShowSave] = useState(false)
  const qc = useQueryClient()

  const { data: projects = [] } = useQuery({
    queryKey: ['projects-list'],
    queryFn: () => api.get('/projects?pageSize=200').then(r => (r.data as any).items ?? r.data),
    enabled: showProject,
  })

  const { data: users = [] } = useQuery({
    queryKey: ['users-list'],
    queryFn: () => api.get('/users').then(r => (r.data as any).users ?? r.data),
    enabled: showUser,
  })

  const { data: savedReports = [] } = useQuery({
    queryKey: ['saved-reports'],
    queryFn: () => reportsApi.getSavedReports(),
  })

  const saveMutation = useMutation({
    mutationFn: () => reportsApi.saveReport(saveName, reportType, filters),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['saved-reports'] })
      setSaveName('')
      setShowSave(false)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => reportsApi.deleteSavedReport(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved-reports'] }),
  })

  const f = (key: keyof ReportFilters, val: string) =>
    onChange({ ...filters, [key]: val || undefined })

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* Date range */}
        <input
          type="date"
          value={filters.from ?? ''}
          onChange={e => f('from', e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <span className="text-gray-400 text-sm">—</span>
        <input
          type="date"
          value={filters.to ?? ''}
          onChange={e => f('to', e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        {/* Granularity */}
        {showGranularity && (
          <select
            value={filters.granularity ?? 'week'}
            onChange={e => f('granularity', e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {Object.entries(GRANULARITY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        )}

        {/* Project */}
        {showProject && (
          <select
            value={filters.projectId ?? ''}
            onChange={e => f('projectId', e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 max-w-48"
          >
            <option value="">Все проекты</option>
            {(projects as any[]).map((p: any) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}

        {/* User */}
        {showUser && (
          <select
            value={filters.userId ?? ''}
            onChange={e => f('userId', e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 max-w-40"
          >
            <option value="">Все сотрудники</option>
            {(users as any[]).map((u: any) => (
              <option key={u.id} value={u.id}>{u.fullName}</option>
            ))}
          </select>
        )}

        {/* Status */}
        {showStatus && (
          <select
            value={filters.status ?? ''}
            onChange={e => f('status', e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Все статусы</option>
            <option value="todo">К выполнению</option>
            <option value="in_progress">В работе</option>
            <option value="review">На проверке</option>
            <option value="done">Выполнено</option>
          </select>
        )}

        {/* Clear */}
        {Object.values(filters).some(Boolean) && (
          <button
            onClick={() => onChange({})}
            className="text-xs text-gray-400 hover:text-gray-600 underline"
          >
            Сбросить
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          {/* Save template */}
          <button
            onClick={() => setShowSave(v => !v)}
            className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
            Сохранить
          </button>

          {/* Export */}
          <button
            onClick={() => reportsApi.exportReport(reportType, 'xlsx', filters)}
            className="flex items-center gap-1 text-xs text-gray-600 border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-gray-50"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
            </svg>
            Excel
          </button>
          <button
            onClick={() => reportsApi.exportReport(reportType, 'pdf', filters)}
            className="flex items-center gap-1 text-xs text-gray-600 border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-gray-50"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            PDF
          </button>
        </div>
      </div>

      {/* Save form */}
      {showSave && (
        <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg border border-blue-100">
          <input
            type="text"
            value={saveName}
            onChange={e => setSaveName(e.target.value)}
            placeholder="Название шаблона..."
            className="flex-1 border border-blue-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={() => saveMutation.mutate()}
            disabled={!saveName.trim() || saveMutation.isPending}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saveMutation.isPending ? '...' : 'Сохранить'}
          </button>
          <button onClick={() => setShowSave(false)} className="text-gray-400 hover:text-gray-600 text-sm">
            Отмена
          </button>
        </div>
      )}

      {/* Saved templates */}
      {savedReports.filter(r => r.reportType === reportType).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <span className="text-xs text-gray-400">Шаблоны:</span>
          {savedReports.filter(r => r.reportType === reportType).map(r => (
            <div key={r.id} className="flex items-center gap-1 px-2 py-1 bg-gray-100 rounded-lg text-xs text-gray-700">
              <button onClick={() => onChange(r.filters)} className="hover:text-blue-600">{r.name}</button>
              <button
                onClick={() => deleteMutation.mutate(r.id)}
                className="text-gray-300 hover:text-red-500 ml-0.5"
              >×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
