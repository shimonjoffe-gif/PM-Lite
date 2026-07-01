import { Link } from 'react-router-dom'
import { Project } from '@/types/project'
import { addToFavorites } from '@/components/layout/Sidebar'

interface Props {
  projects: Project[]
  onArchive: (id: string, archived: boolean) => void
}

function ProgressRing({ pct }: { pct: number }) {
  const r = 16, c = 2 * Math.PI * r
  const fill = (pct / 100) * c
  return (
    <svg className="h-10 w-10 -rotate-90" viewBox="0 0 40 40">
      <circle cx="20" cy="20" r={r} fill="none" stroke="#E5E7EB" strokeWidth="4" />
      <circle
        cx="20" cy="20" r={r} fill="none"
        stroke={pct >= 100 ? '#10B981' : pct > 0 ? '#3B82F6' : '#E5E7EB'}
        strokeWidth="4"
        strokeDasharray={`${fill} ${c - fill}`}
        strokeLinecap="round"
      />
    </svg>
  )
}

export function ProjectCards({ projects, onArchive }: Props) {
  if (!projects.length) {
    return (
      <div className="py-16 text-center">
        <p className="text-gray-400 text-sm">Проекты не найдены</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {projects.map(project => (
        <div
          key={project.id}
          className={`bg-white rounded-xl border border-gray-200 p-4 hover:border-blue-300 hover:shadow-sm transition-all flex flex-col gap-3 ${project.isArchived ? 'opacity-60' : ''}`}
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <Link
                to={`/projects/${project.id}`}
                className="font-semibold text-gray-900 hover:text-blue-600 transition-colors text-sm leading-snug line-clamp-2"
              >
                {project.name}
              </Link>
              {project.clientName && (
                <p className="text-xs text-gray-400 mt-0.5">{project.clientName}</p>
              )}
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={() => addToFavorites(project.name, `/projects/${project.id}`)}
                className="p-1 rounded text-gray-300 hover:text-yellow-500 transition-colors"
                title="В избранное"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                </svg>
              </button>
            </div>
          </div>

          {/* Status */}
          {project.statusName && (
            <span
              className="self-start inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-white"
              style={{ backgroundColor: project.statusColor ?? '#6B7280' }}
            >
              {project.statusName}
            </span>
          )}

          {/* KPI row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative flex items-center justify-center">
                <ProgressRing pct={project.kpi.completionPct} />
                <span className="absolute text-[10px] font-semibold text-gray-700">{project.kpi.completionPct}%</span>
              </div>
              <div className="text-xs text-gray-500 space-y-0.5">
                <p>{project.kpi.doneTasks}/{project.kpi.totalTasks} задач</p>
                {project.kpi.overdueTasks > 0 && (
                  <p className="text-red-500 font-medium">{project.kpi.overdueTasks} просрочено</p>
                )}
              </div>
            </div>
            {project.ownerName && (
              <div className="h-7 w-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0"
                title={project.ownerName}>
                {project.ownerName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-1 border-t border-gray-50">
            {project.endDate ? (
              <span className={`text-xs ${new Date(project.endDate) < new Date() && !project.isArchived ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                до {project.endDate}
              </span>
            ) : <span />}
            <button
              onClick={() => onArchive(project.id, project.isArchived)}
              title={project.isArchived ? 'Разархивировать' : 'Архивировать'}
              className="p-1 rounded text-gray-300 hover:text-gray-500 transition-colors"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
