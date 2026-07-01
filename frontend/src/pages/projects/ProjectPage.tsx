import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { projectsApi } from '@/api/projects'
import { Task, TaskNode } from '@/types/task'
import { PlannerPage } from '@/pages/planner/PlannerPage'
import { TaskDrawer } from '@/pages/tasks/TaskDrawer'
import { CreateTaskModal } from '@/pages/tasks/CreateTaskModal'
import { Button } from '@/components/ui/Button'
import { ProjectReportsTab } from '@/pages/reports/ReportsPage'
import { ProjectDocumentsTab } from '@/pages/documents/ProjectDocumentsTab'
import { useAiPanel } from '@/store/aiPanel'
import { EditProjectModal } from './EditProjectModal'

type Tab = 'passport' | 'planner' | 'reports' | 'documents'

const TABS: { id: Tab; label: string }[] = [
  { id: 'passport', label: 'Паспорт' },
  { id: 'planner', label: 'Планировщик' },
  { id: 'reports', label: 'Отчёты' },
  { id: 'documents', label: 'Документы' },
]

export function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [tab, setTab] = useState<Tab>('planner')
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [createParentId, setCreateParentId] = useState<string | null>(null)
  const [showEdit, setShowEdit] = useState(false)
  const [plannerDirty, setPlannerDirty] = useState(false)
  const openAiPanel = useAiPanel(s => s.open)

  const handleTabChange = (newTab: Tab) => {
    if (tab === 'planner' && plannerDirty && newTab !== 'planner') {
      if (!window.confirm('В плане есть несохранённые изменения. Перейти без сохранения?')) return
    }
    setTab(newTab)
  }

  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => projectsApi.get(projectId!),
    enabled: !!projectId,
  })

  const handleAddChild = (parentId: string) => {
    setCreateParentId(parentId)
    setShowCreate(true)
  }

  if (!projectId) return null

  return (
    <div className="flex flex-col h-full">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400 mb-3 flex-shrink-0 px-3 sm:px-4 lg:px-6 xl:px-8 pt-4">
        <Link to="/projects" className="hover:text-gray-600">Проекты</Link>
        <span>›</span>
        <span className="text-gray-700 font-medium truncate max-w-[200px] sm:max-w-none">{project?.name ?? '...'}</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-3 gap-3 flex-shrink-0 px-3 sm:px-4 lg:px-6 xl:px-8">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl font-bold text-gray-900 truncate">{project?.name ?? '...'}</h1>
          {project?.description && (
            <p className="text-sm text-gray-400 mt-0.5 line-clamp-1">{project.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {project && (
            <>
              <button
                onClick={() => setShowEdit(true)}
                className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 bg-white hover:bg-gray-50 border border-gray-200"
                title="Редактировать проект"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                <span className="hidden sm:inline">Изменить</span>
              </button>
              <button
                onClick={() => openAiPanel({ type: 'project_status', projectId: project.id, projectName: project.name })}
                className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-sm font-medium text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200"
                title="AI статус проекта"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                <span className="hidden sm:inline">AI статус</span>
              </button>
            </>
          )}
          <Button
            size="sm"
            onClick={() => { setCreateParentId(null); setShowCreate(true) }}
          >
            <svg className="h-4 w-4 sm:mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span className="hidden sm:inline">Задача</span>
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-0 border-b border-gray-200 overflow-x-auto scrollbar-none -mx-3 sm:-mx-4 lg:-mx-6 xl:-mx-8 px-3 sm:px-4 lg:px-6 xl:px-8 flex-shrink-0">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => handleTabChange(t.id)}
            className={`px-3 sm:px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex-shrink-0 ${
              tab === t.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">

        {/* Паспорт проекта */}
        {tab === 'passport' && (
          <div className="overflow-y-auto h-full px-3 sm:px-4 lg:px-6 xl:px-8 py-5">
            {project ? (
              <div className="max-w-3xl space-y-6">

                {/* KPI */}
                {project.kpi && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label: 'Всего задач', value: project.kpi.totalTasks },
                      { label: 'Выполнено', value: project.kpi.doneTasks },
                      { label: 'Прогресс', value: `${project.kpi.completionPct}%` },
                      { label: 'Просрочено', value: project.kpi.overdueTasks, red: project.kpi.overdueTasks > 0 },
                    ].map(stat => (
                      <div key={stat.label} className="bg-white rounded-xl border border-gray-200 px-4 py-3">
                        <p className="text-xs text-gray-400 mb-1">{stat.label}</p>
                        <p className={`text-2xl font-bold ${stat.red ? 'text-red-600' : 'text-gray-900'}`}>{stat.value}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Details card */}
                <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
                  {project.statusName && (
                    <div className="flex items-center gap-3 px-4 py-3">
                      <span className="text-sm text-gray-400 w-36 flex-shrink-0">Статус</span>
                      <span className="flex items-center gap-2 text-sm font-medium text-gray-800">
                        <span className="inline-block h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: project.statusColor ?? '#94a3b8' }} />
                        {project.statusName}
                      </span>
                    </div>
                  )}
                  {project.ownerName && (
                    <div className="flex items-center gap-3 px-4 py-3">
                      <span className="text-sm text-gray-400 w-36 flex-shrink-0">Руководитель</span>
                      <span className="text-sm font-medium text-gray-800">{project.ownerName}</span>
                    </div>
                  )}
                  {project.clientName && (
                    <div className="flex items-center gap-3 px-4 py-3">
                      <span className="text-sm text-gray-400 w-36 flex-shrink-0">Клиент</span>
                      <span className="text-sm font-medium text-gray-800">{project.clientName}</span>
                    </div>
                  )}
                  {(project.startDate || project.endDate) && (
                    <div className="flex items-center gap-3 px-4 py-3">
                      <span className="text-sm text-gray-400 w-36 flex-shrink-0">Сроки</span>
                      <span className="text-sm font-medium text-gray-800">
                        {project.startDate ? new Date(project.startDate).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'}
                        {' — '}
                        {project.endDate ? new Date(project.endDate).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'}
                      </span>
                    </div>
                  )}
                  {project.description && (
                    <div className="flex items-start gap-3 px-4 py-3">
                      <span className="text-sm text-gray-400 w-36 flex-shrink-0 mt-0.5">Описание</span>
                      <p className="text-sm text-gray-800 leading-relaxed">{project.description}</p>
                    </div>
                  )}
                </div>

              </div>
            ) : (
              <div className="flex justify-center py-16">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
              </div>
            )}
          </div>
        )}

        {/* Планировщик */}
        {tab === 'planner' && (
          <div className="h-full px-3 sm:px-4 lg:px-6 xl:px-8 py-4 flex flex-col">
            <PlannerPage onDirtyChange={setPlannerDirty} />
          </div>
        )}

        {/* Отчёты */}
        {tab === 'reports' && (
          <div className="overflow-y-auto h-full px-3 sm:px-4 lg:px-6 xl:px-8 py-4">
            <ProjectReportsTab projectId={projectId} />
          </div>
        )}

        {/* Документы */}
        {tab === 'documents' && (
          <div className="overflow-y-auto h-full px-3 sm:px-4 lg:px-6 xl:px-8 py-4">
            <ProjectDocumentsTab projectId={projectId} />
          </div>
        )}

      </div>

      {/* Task drawer */}
      <TaskDrawer
        taskId={selectedTaskId}
        projectId={projectId}
        onClose={() => setSelectedTaskId(null)}
        onAddChild={handleAddChild}
      />

      {/* Create modal */}
      {showCreate && (
        <CreateTaskModal
          projectId={projectId}
          defaultParentId={createParentId}
          onClose={() => { setShowCreate(false); setCreateParentId(null) }}
        />
      )}

      {/* Edit project modal */}
      {showEdit && project && (
        <EditProjectModal project={project} onClose={() => setShowEdit(false)} />
      )}
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function flattenTree(nodes: TaskNode[]): Task[] {
  const result: Task[] = []
  const walk = (ns: TaskNode[]) => ns.forEach(n => { result.push(n); walk(n.children) })
  walk(nodes)
  return result
}
