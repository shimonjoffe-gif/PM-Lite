import { Link } from 'react-router-dom'
import { Project, PROJECT_COLUMN_LABELS } from '@/types/project'
import { addToFavorites } from '@/components/layout/Sidebar'

interface Props {
  projects: Project[]
  columns: string[]
  onArchive: (id: string, archived: boolean) => void
}

function StatusBadge({ name, color }: { name: string; color: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-white"
      style={{ backgroundColor: color }}
    >
      {name}
    </span>
  )
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-gray-100">
        <div
          className="h-1.5 rounded-full bg-blue-500 transition-all"
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <span className="text-xs text-gray-500 w-8 text-right">{pct}%</span>
    </div>
  )
}

function CellValue({ project, col }: { project: Project; col: string }) {
  switch (col) {
    case 'name':
      return (
        <Link
          to={`/projects/${project.id}`}
          className="font-medium text-gray-900 hover:text-blue-600 transition-colors"
        >
          {project.name}
        </Link>
      )
    case 'status':
      return project.statusName ? (
        <StatusBadge name={project.statusName} color={project.statusColor ?? '#6B7280'} />
      ) : <span className="text-gray-400 text-xs">—</span>
    case 'client':
      return <span className="text-sm text-gray-600">{project.clientName ?? '—'}</span>
    case 'owner':
      return <span className="text-sm text-gray-600">{project.ownerName ?? '—'}</span>
    case 'startDate':
      return <span className="text-sm text-gray-600">{project.startDate ?? '—'}</span>
    case 'endDate':
      return project.endDate ? (
        <span className={`text-sm font-medium ${new Date(project.endDate) < new Date() && !project.isArchived ? 'text-red-600' : 'text-gray-600'}`}>
          {project.endDate}
        </span>
      ) : <span className="text-gray-400 text-sm">—</span>
    case 'totalTasks':
      return <span className="text-sm text-gray-700">{project.kpi.totalTasks}</span>
    case 'doneTasks':
      return <span className="text-sm text-gray-700">{project.kpi.doneTasks}</span>
    case 'overdueTasks':
      return project.kpi.overdueTasks > 0 ? (
        <span className="text-sm font-medium text-red-600">{project.kpi.overdueTasks}</span>
      ) : <span className="text-sm text-gray-400">0</span>
    case 'completionPct':
      return <ProgressBar pct={project.kpi.completionPct} />
    case 'totalEffortHours':
      return <span className="text-sm text-gray-700">{project.kpi.totalEffortHours > 0 ? `${project.kpi.totalEffortHours} ч` : '—'}</span>
    case 'membersCount':
      return <span className="text-sm text-gray-700">{project.kpi.membersCount}</span>
    default:
      return null
  }
}

export function ProjectTable({ projects, columns, onArchive }: Props) {
  const visibleCols = columns.includes('name') ? columns : ['name', ...columns]

  if (!projects.length) {
    return (
      <div className="py-16 text-center">
        <p className="text-gray-400 text-sm">Проекты не найдены</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-100 text-sm">
        <thead>
          <tr className="bg-gray-50">
            {visibleCols.map(col => (
              <th
                key={col}
                className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap"
              >
                {PROJECT_COLUMN_LABELS[col]}
              </th>
            ))}
            <th className="w-10 px-2 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {projects.map(project => (
            <tr key={project.id} className={`hover:bg-gray-50/50 transition-colors ${project.isArchived ? 'opacity-60' : ''}`}>
              {visibleCols.map(col => (
                <td key={col} className="px-4 py-3 whitespace-nowrap">
                  <CellValue project={project} col={col} />
                </td>
              ))}
              <td className="px-2 py-3">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => addToFavorites(project.name, `/projects/${project.id}`)}
                    title="В избранное"
                    className="p-1.5 rounded text-gray-300 hover:text-yellow-500 transition-colors"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => onArchive(project.id, project.isArchived)}
                    title={project.isArchived ? 'Разархивировать' : 'Архивировать'}
                    className="p-1.5 rounded text-gray-300 hover:text-gray-600 transition-colors"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                    </svg>
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
