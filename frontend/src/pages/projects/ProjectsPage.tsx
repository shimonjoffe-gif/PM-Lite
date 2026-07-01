import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { projectsApi, ListProjectsParams } from '@/api/projects'
import { userPrefsApi } from '@/api/userPrefs'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ProjectTable } from './ProjectTable'
import { ProjectCards } from './ProjectCards'
import { ColumnPickerModal } from './ColumnPickerModal'
import type { ProjectAggregates } from '@/types/project'

const DEFAULT_COLUMNS = ['name', 'status', 'owner', 'client', 'endDate', 'completionPct', 'overdueTasks']

function AggregatesBar({ data }: { data: ProjectAggregates }) {
  const t = data.totals
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
      {[
        { label: 'Проектов', value: t.projectCount },
        { label: 'Задач', value: t.totalTasks },
        { label: 'Выполнено', value: `${t.completionPct}%` },
        { label: 'Просрочено', value: t.overdueTasks, red: t.overdueTasks > 0 },
      ].map(stat => (
        <div key={stat.label} className="bg-white rounded-xl border border-gray-200 px-4 py-3">
          <p className="text-xs text-gray-400 mb-1">{stat.label}</p>
          <p className={`text-2xl font-bold ${stat.red ? 'text-red-600' : 'text-gray-900'}`}>{stat.value}</p>
        </div>
      ))}
    </div>
  )
}

function Pagination({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null
  return (
    <div className="flex items-center justify-center gap-2 mt-5">
      <button
        onClick={() => onPage(page - 1)}
        disabled={page <= 1}
        className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        ←
      </button>
      {Array.from({ length: pages }, (_, i) => i + 1).map(p => (
        <button
          key={p}
          onClick={() => onPage(p)}
          className={`px-3 py-1.5 text-sm rounded-lg border ${p === page ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
        >
          {p}
        </button>
      ))}
      <button
        onClick={() => onPage(page + 1)}
        disabled={page >= pages}
        className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        →
      </button>
    </div>
  )
}

export function ProjectsPage() {
  const qc = useQueryClient()
  const [view, setView] = useState<'table' | 'cards'>('table')
  const [showColumnPicker, setShowColumnPicker] = useState(false)
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState<ListProjectsParams>({ archived: false })
  const [search, setSearch] = useState('')

  const activeFilters = { ...filters, search: search || undefined, page }

  const { data: list, isLoading } = useQuery({
    queryKey: ['projects', activeFilters],
    queryFn: () => projectsApi.list(activeFilters),
  })

  const { data: aggregates } = useQuery({
    queryKey: ['projects-agg', { ...filters, search: search || undefined }],
    queryFn: () => projectsApi.aggregates({ ...filters, search: search || undefined }),
  })

  const { data: colPrefs } = useQuery({
    queryKey: ['col-prefs', 'projects'],
    queryFn: () => userPrefsApi.getColumns('projects'),
  })

  const columns = colPrefs?.columns ?? DEFAULT_COLUMNS

  const archive = useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      archived ? projectsApi.unarchive(id) : projectsApi.archive(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      qc.invalidateQueries({ queryKey: ['projects-agg'] })
    },
  })

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
  }

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Проекты</h1>
          {list && (
            <p className="text-sm text-gray-400 mt-0.5">Всего: {list.total}</p>
          )}
        </div>
        <Link to="/projects/new">
          <Button size="sm">
            <svg className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Новый проект
          </Button>
        </Link>
      </div>

      {/* Aggregates */}
      {aggregates && <AggregatesBar data={aggregates} />}

      {/* Filters bar */}
      <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 mb-4 flex flex-wrap items-center gap-3">
        <form onSubmit={handleSearch} className="flex items-center gap-2 flex-1 min-w-48">
          <Input
            placeholder="Поиск по названию..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            className="h-8 text-sm"
          />
        </form>

        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={!!filters.archived}
            onChange={e => { setFilters(f => ({ ...f, archived: e.target.checked })); setPage(1) }}
            className="h-4 w-4 rounded border-gray-300 text-blue-600"
          />
          Показать архив
        </label>

        <div className="flex items-center gap-1 ml-auto">
          {/* View toggle */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            <button
              onClick={() => setView('table')}
              className={`px-2.5 py-1.5 text-xs transition-colors ${view === 'table' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
              title="Таблица"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18M10 3v18" />
              </svg>
            </button>
            <button
              onClick={() => setView('cards')}
              className={`px-2.5 py-1.5 text-xs transition-colors ${view === 'cards' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
              title="Карточки"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
            </button>
          </div>

          {view === 'table' && (
            <Button variant="secondary" size="sm" onClick={() => setShowColumnPicker(true)}>
              <svg className="h-3.5 w-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
              Колонки
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="py-16 text-center">
          <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
        </div>
      ) : view === 'table' ? (
        <ProjectTable
          projects={list?.items ?? []}
          columns={columns}
          onArchive={(id, archived) => archive.mutate({ id, archived })}
        />
      ) : (
        <ProjectCards
          projects={list?.items ?? []}
          onArchive={(id, archived) => archive.mutate({ id, archived })}
        />
      )}

      {list && (
        <Pagination page={list.page} pages={list.pages} onPage={setPage} />
      )}

      {showColumnPicker && (
        <ColumnPickerModal
          current={columns}
          onClose={() => setShowColumnPicker(false)}
        />
      )}
    </div>
  )
}
