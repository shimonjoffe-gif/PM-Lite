import { useState, useRef, useMemo, useCallback, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'

import type { GanttTask, VisibleRow, ZoomLevel } from '@/pages/gantt/ganttUtils'
import {
  flattenForDisplay, computeWbs, getProjectDateRange, DAY_PX, dateToX,
} from '@/pages/gantt/ganttUtils'
import type { ColumnKey } from '@/pages/gantt/GanttGrid'
import { GanttGrid } from '@/pages/gantt/GanttGrid'
import { GanttChart } from '@/pages/gantt/GanttChart'
import { GanttToolbar } from '@/pages/gantt/GanttToolbar'
import { TaskDrawer } from '@/pages/tasks/TaskDrawer'
import { KanbanBoard } from '@/pages/tasks/KanbanBoard'
import type { Task } from '@/types/task'

// ── View modes ─────────────────────────────────────────────────────────────────

type ViewMode = 'split' | 'table' | 'kanban'

const VIEW_LABELS: Record<ViewMode, string> = {
  split: 'WBS + Гант',
  table: 'Таблица',
  kanban: 'Канбан',
}

// ── API ────────────────────────────────────────────────────────────────────────

async function fetchGanttTasks(projectId: string): Promise<GanttTask[]> {
  const r = await api.get(`/projects/${projectId}/gantt`)
  return r.data
}

async function fetchProject(projectId: string) {
  const r = await api.get(`/projects/${projectId}`)
  return r.data as { id: string; name: string }
}

async function fetchMembers(projectId: string) {
  const r = await api.get(`/projects/${projectId}/members`)
  return r.data as { userId: string; fullName: string }[]
}

// ── PlannerPage ────────────────────────────────────────────────────────────────

interface PlannerPageProps {
  onDirtyChange?: (dirty: boolean) => void
}

export function PlannerPage({ onDirtyChange }: PlannerPageProps = {}) {
  const { projectId } = useParams<{ projectId: string }>()
  const qc = useQueryClient()

  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => fetchProject(projectId!),
    enabled: !!projectId,
  })

  const { data: remoteTasks = [], isLoading } = useQuery<GanttTask[]>({
    queryKey: ['gantt', projectId],
    queryFn: () => fetchGanttTasks(projectId!),
    enabled: !!projectId,
  })

  const { data: members = [] } = useQuery({
    queryKey: ['project-members', projectId],
    queryFn: () => fetchMembers(projectId!),
    enabled: !!projectId,
  })

  const [localTasks, setLocalTasks] = useState<GanttTask[]>([])
  const pendingChangesRef = useRef<Map<string, Partial<GanttTask>>>(new Map())
  useEffect(() => {
    // When server data arrives, re-apply any buffered edits on top (they haven't been saved yet)
    setLocalTasks(
      pendingChangesRef.current.size === 0
        ? remoteTasks
        : remoteTasks.map(t => {
            const pending = pendingChangesRef.current.get(t.id)
            return pending ? { ...t, ...pending } : t
          })
    )
  }, [remoteTasks])
  const tasks = localTasks.length > 0 ? localTasks : remoteTasks

  // ── UI state ────────────────────────────────────────────────────────────────

  const [viewMode, setViewMode] = useState<ViewMode>('split')
  const [splitPct, setSplitPct] = useState(60) // WBS width %
  const containerRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState<ZoomLevel>('month')
  const [rowHeights, setRowHeights] = useState<number[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [drawerTaskId, setDrawerTaskId] = useState<string | null>(null)
  const [drawerFocusField, setDrawerFocusField] = useState<string | undefined>()
  const [pendingChanges, setPendingChanges] = useState<Map<string, Partial<GanttTask>>>(new Map())
  useEffect(() => { pendingChangesRef.current = pendingChanges }, [pendingChanges])
  const [recalcHighlightIds, setRecalcHighlightIds] = useState<Set<string>>(new Set())
  const preActionSnapshotRef = useRef<Map<string, GanttTask> | null>(null)
  const [showBaseline, setShowBaseline] = useState(false)
  const [showCriticalPath, setShowCriticalPath] = useState(true)
  const [columns, setColumns] = useState<ColumnKey[]>(['seq', 'name', 'duration', 'start', 'finish', 'pct', 'status', 'predecessor', 'constraint'])

  useEffect(() => {
    if (tasks.length > 0 && expanded.size === 0) {
      const topLevel = tasks.filter(t => !t.parentId).map(t => t.id)
      setExpanded(new Set(topLevel))
    }
  }, [tasks])

  // ── Computed ────────────────────────────────────────────────────────────────

  const visibleRows: VisibleRow[] = useMemo(
    () => flattenForDisplay(tasks, expanded),
    [tasks, expanded],
  )
  const wbsMap = useMemo(() => computeWbs(visibleRows), [visibleRows])
  const { origin, totalDays } = useMemo(() => getProjectDateRange(tasks), [tasks])

  // ── Scroll sync ─────────────────────────────────────────────────────────────

  const gridScrollRef = useRef<HTMLDivElement | null>(null)
  const chartScrollRef = useRef<HTMLDivElement | null>(null)

  const handleGridScrollY = useCallback((y: number) => {
    const el = chartScrollRef.current
    if (!el || Math.abs(el.scrollTop - y) < 1) return
    el.scrollTop = y
  }, [])

  const handleChartScrollY = useCallback((y: number) => {
    const el = gridScrollRef.current
    if (!el || Math.abs(el.scrollTop - y) < 1) return
    el.scrollTop = y
  }, [])

  // ── Mutations ───────────────────────────────────────────────────────────────

  const invalidateTimer = useRef<ReturnType<typeof setTimeout>>()
  const invalidate = useCallback(() => {
    clearTimeout(invalidateTimer.current)
    invalidateTimer.current = setTimeout(() => {
      qc.invalidateQueries({ queryKey: ['gantt', projectId] })
    }, 80)
  }, [qc, projectId])

  const updateMut = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) =>
      api.patch(`/tasks/${id}`, patch),
    onSuccess: () => invalidate(),
  })

  const createMut = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.post(`/projects/${projectId}/tasks`, data),
    onSuccess: () => invalidate(),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/tasks/${id}`),
    onSuccess: () => invalidate(),
  })

  const baselineMut = useMutation({
    mutationFn: () => api.post(`/projects/${projectId}/set-baseline`, {}),
    onSuccess: () => invalidate(),
  })

  const recalcMut = useMutation({
    mutationFn: () => api.post(`/projects/${projectId}/recalculate`, {}),
    onSuccess: () => invalidate(),
  })

  const addDepMut = useMutation({
    mutationFn: ({ taskId, predecessorId, type, lagDays }: { taskId: string; predecessorId: string; type: string; lagDays: number }) =>
      api.post(`/tasks/${taskId}/dependencies`, { predecessorId, type, lagDays }),
    onSuccess: () => invalidate(),
  })

  const removeDepMut = useMutation({
    mutationFn: ({ depId }: { taskId: string; depId: string }) =>
      api.delete(`/tasks/dependencies/${depId}`),
    onSuccess: () => invalidate(),
  })

  const isDirty = pendingChanges.size > 0

  // Notify parent when dirty state changes
  useEffect(() => { onDirtyChange?.(isDirty) }, [isDirty]) // eslint-disable-line react-hooks/exhaustive-deps

  // Compute per-task changed columns (from pending edits only)
  const pendingEditIds = useMemo(() => new Set(pendingChanges.keys()), [pendingChanges])

  const changedColsMap = useMemo(() => {
    const m = new Map<string, Set<ColumnKey>>()
    for (const [taskId, patch] of pendingChanges) {
      const cols = new Set<ColumnKey>()
      if ('title' in patch)           cols.add('name')
      if ('startDate' in patch)        cols.add('start')
      if ('dueDate' in patch)          cols.add('finish')
      if ('duration' in patch)         cols.add('duration')
      if ('percentComplete' in patch)  cols.add('pct')
      if ('status' in patch)           cols.add('status')
      if ('assigneeId' in patch)       cols.add('assignee')
      if ('taskType' in patch)         cols.add('type')
      if ('constraintType' in patch)   cols.add('constraint')
      if (cols.size > 0) m.set(taskId, cols)
    }
    return m
  }, [pendingChanges])

  // After server re-fetch: detect which rows were recalculated (CPM effect)
  useEffect(() => {
    if (!preActionSnapshotRef.current || remoteTasks.length === 0) return
    const snap = preActionSnapshotRef.current
    const changed = new Set<string>()
    for (const task of remoteTasks) {
      const prev = snap.get(task.id)
      if (!prev) continue
      if (task.startDate !== prev.startDate ||
          task.dueDate !== prev.dueDate ||
          task.duration !== prev.duration) {
        changed.add(task.id)
      }
    }
    setRecalcHighlightIds(changed)
    preActionSnapshotRef.current = null
  }, [remoteTasks])

  // Save all pending changes to DB
  const savePlan = useCallback(async () => {
    if (pendingChanges.size === 0) return
    preActionSnapshotRef.current = new Map(remoteTasks.map(t => [t.id, { ...t }]))
    const entries = Array.from(pendingChanges.entries())
    await Promise.all(entries.map(([id, patch]) => api.patch(`/tasks/${id}`, patch)))
    setPendingChanges(new Map())
    invalidate()
  }, [pendingChanges, remoteTasks, invalidate])

  // Clear one task from pending (called when drawer saves it directly)
  const clearPending = useCallback((taskId: string) => {
    setPendingChanges(prev => {
      const next = new Map(prev)
      next.delete(taskId)
      return next
    })
  }, [])

  // Global hotkeys: Ctrl+S → save, Esc → close drawer / deselect
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 's') { e.preventDefault(); if (isDirty) savePlan(); return }
      if (e.key === 'Escape') {
        if (drawerTaskId) {
          setDrawerTaskId(null)
          setDrawerFocusField(undefined)
          return
        }
        const tag = (e.target as HTMLElement).tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
        setSelectedId(null)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isDirty, savePlan, drawerTaskId])

  // ── Task update with optimistic local state ─────────────────────────────────

  const handleTaskUpdate = useCallback((taskId: string, patch: Partial<GanttTask>) => {
    // Apply optimistically to local display
    setLocalTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...patch } : t))
    // Buffer for deferred save
    setPendingChanges(prev => {
      const next = new Map(prev)
      next.set(taskId, { ...(next.get(taskId) ?? {}), ...patch })
      return next
    })
  }, [])

  // ── Tree operations ─────────────────────────────────────────────────────────

  const handleToggleExpand = useCallback((id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])

  const handleAddTask = useCallback((afterId?: string) => {
    if (afterId) {
      const afterTask = tasks.find(t => t.id === afterId)
      createMut.mutate(
        { title: 'Новая задача', parentId: afterTask?.parentId ?? null, insertAfterId: afterId },
        { onSuccess: (res) => setSelectedId(res.data?.id ?? null) },
      )
    } else {
      const siblings = tasks.filter(t => t.parentId === null)
      const sortOrder = Math.max(...siblings.map(s => s.sortOrder), -1) + 1
      createMut.mutate(
        { title: 'Новая задача', parentId: null, sortOrder },
        { onSuccess: (res) => setSelectedId(res.data?.id ?? null) },
      )
    }
  }, [tasks, createMut])

  const handleDeleteTask = useCallback((id: string) => {
    if (!confirm('Удалить задачу?')) return
    deleteMut.mutate(id)
    setSelectedId(null)
  }, [deleteMut])

  const handleIndent = useCallback((id: string) => {
    const row = visibleRows.find(r => r.task.id === id)
    if (!row) return
    const rowIdx = visibleRows.indexOf(row)
    const prevSibling = visibleRows.slice(0, rowIdx).reverse().find(r => r.task.parentId === row.task.parentId)
    if (!prevSibling) return
    updateMut.mutate({ id, patch: { parentId: prevSibling.task.id, sortOrder: 9999 } })
    setExpanded(prev => new Set([...prev, prevSibling.task.id]))
  }, [visibleRows, updateMut])

  const handleOutdent = useCallback((id: string) => {
    const row = visibleRows.find(r => r.task.id === id)
    if (!row || !row.task.parentId) return
    const parent = tasks.find(t => t.id === row.task.parentId)
    if (!parent) return
    updateMut.mutate({ id, patch: { parentId: parent.parentId ?? null, sortOrder: parent.sortOrder + 1 } })
  }, [visibleRows, tasks, updateMut])

  const handleMoveUp = useCallback((id: string) => {
    const row = visibleRows.find(r => r.task.id === id)
    if (!row) return
    const rowIdx = visibleRows.indexOf(row)
    const prev = visibleRows.slice(0, rowIdx).reverse().find(r => r.task.parentId === row.task.parentId)
    if (!prev) return
    updateMut.mutate({ id, patch: { sortOrder: prev.task.sortOrder } })
    updateMut.mutate({ id: prev.task.id, patch: { sortOrder: row.task.sortOrder } })
  }, [visibleRows, updateMut])

  const handleAddDep = useCallback((taskId: string, predecessorId: string, type: string, lagDays: number) => {
    addDepMut.mutate({ taskId, predecessorId, type, lagDays })
    // Optimistic: add dep to local state
    setLocalTasks(prev => prev.map(t => t.id === taskId
      ? { ...t, dependencies: [...t.dependencies, { id: `tmp-${Date.now()}`, predecessorId, type, lagDays }] }
      : t
    ))
  }, [addDepMut])

  const handleRemoveDep = useCallback((taskId: string, depId: string) => {
    removeDepMut.mutate({ taskId, depId })
    setLocalTasks(prev => prev.map(t => t.id === taskId
      ? { ...t, dependencies: t.dependencies.filter(d => d.id !== depId) }
      : t
    ))
  }, [removeDepMut])

  const handleMoveTask = useCallback((dragId: string, targetId: string, pos: 'before' | 'into' | 'after') => {
    const target = tasks.find(t => t.id === targetId)
    if (!target) return
    if (pos === 'into') {
      const children = tasks.filter(t => t.parentId === targetId)
      const maxSort = children.length > 0 ? Math.max(...children.map(c => c.sortOrder)) : -1
      updateMut.mutate({ id: dragId, patch: { parentId: targetId, sortOrder: maxSort + 1 } })
      setExpanded(prev => new Set([...prev, targetId]))
    } else if (pos === 'before') {
      updateMut.mutate({ id: dragId, patch: { parentId: target.parentId ?? null, sortOrder: target.sortOrder - 0.5 } })
    } else {
      updateMut.mutate({ id: dragId, patch: { parentId: target.parentId ?? null, sortOrder: target.sortOrder + 0.5 } })
    }
  }, [tasks, updateMut, setExpanded])

  const handleMoveDown = useCallback((id: string) => {
    const row = visibleRows.find(r => r.task.id === id)
    if (!row) return
    const rowIdx = visibleRows.indexOf(row)
    const next = visibleRows.slice(rowIdx + 1).find(r => r.task.parentId === row.task.parentId)
    if (!next) return
    updateMut.mutate({ id, patch: { sortOrder: next.task.sortOrder } })
    updateMut.mutate({ id: next.task.id, patch: { sortOrder: row.task.sortOrder } })
  }, [visibleRows, updateMut])

  // ── Divider drag ────────────────────────────────────────────────────────────

  const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const container = containerRef.current
    if (!container) return
    const startX = e.clientX
    const startPct = splitPct

    const onMove = (ev: MouseEvent) => {
      const totalW = container.getBoundingClientRect().width
      const delta = ((ev.clientX - startX) / totalW) * 100
      setSplitPct(Math.min(85, Math.max(15, startPct + delta)))
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [splitPct])

  // ── Scroll to today ─────────────────────────────────────────────────────────

  const handleScrollToday = useCallback(() => {
    if (!chartScrollRef.current) return
    const dayWidth = DAY_PX[zoom]
    const todayX = dateToX(new Date(), origin, dayWidth)
    chartScrollRef.current.scrollLeft = Math.max(0, todayX - 300)
  }, [origin, zoom])

  useEffect(() => {
    const timer = setTimeout(handleScrollToday, 300)
    return () => clearTimeout(timer)
  }, [handleScrollToday, tasks.length])

  // ── Render ──────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">
      {/* Top bar — view mode switcher + recalculate */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-100 bg-gray-50 flex-shrink-0">
        <div className="flex items-center rounded-md border border-gray-200 overflow-hidden">
          {(['split', 'table', 'kanban'] as ViewMode[]).map(mode => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-3 py-1 text-xs font-medium transition-colors ${
                viewMode === mode
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {VIEW_LABELS[mode]}
            </button>
          ))}
        </div>

        {isDirty && (
          <button
            onClick={savePlan}
            className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium bg-amber-500 text-white rounded hover:bg-amber-600 transition-colors"
            title="Сохранить план (Ctrl+S)"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
            </svg>
            Сохранить план
            <span className="text-[10px] opacity-70">({pendingChanges.size})</span>
          </button>
        )}

        <button
          onClick={() => {
            preActionSnapshotRef.current = new Map(remoteTasks.map(t => [t.id, { ...t }]))
            recalcMut.mutate()
          }}
          disabled={recalcMut.isPending}
          title="Пересчитать расписание по CPM"
          className="ml-auto flex items-center gap-1.5 px-3 py-1 text-xs font-medium bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 transition-colors"
        >
          <svg className={`w-3.5 h-3.5 ${recalcMut.isPending ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {recalcMut.isPending ? 'Пересчёт...' : 'Пересчитать'}
        </button>
      </div>

      {/* Gantt toolbar row — hidden in kanban mode */}
      {viewMode !== 'kanban' && (
        <GanttToolbar
          zoom={zoom}
          onZoomChange={setZoom}
          columns={columns}
          onColumnsChange={setColumns}
          showBaseline={showBaseline}
          onBaselineToggle={() => setShowBaseline(v => !v)}
          showCriticalPath={showCriticalPath}
          onCriticalPathToggle={() => setShowCriticalPath(v => !v)}
          onSetBaseline={() => baselineMut.mutate()}
          onAddTask={() => handleAddTask(selectedId ?? undefined)}
          onScrollToday={handleScrollToday}
          projectName={project?.name ?? ''}
        />
      )}

      {/* Kanban view */}
      {viewMode === 'kanban' && projectId && (
        <div className="flex-1 overflow-hidden">
          <KanbanBoard
            projectId={projectId}
            onSelectTask={(t: Task) => setDrawerTaskId(t.id)}
          />
        </div>
      )}

      {/* Main content — WBS+Gantt or Table */}
      {viewMode !== 'kanban' && <div ref={containerRef} className="flex flex-1 overflow-hidden">
        {/* WBS grid */}
        <div
          className="flex-shrink-0 overflow-hidden flex flex-col"
          style={viewMode === 'split' ? { width: `${splitPct}%` } : { flex: 1 }}
        >
          <GanttGrid
            visibleRows={visibleRows}
            allTasks={tasks}
            wbsMap={wbsMap}
            columns={columns}
            selectedId={selectedId}
            scrollRef={gridScrollRef}
            onScrollY={handleGridScrollY}
            onSelectTask={setSelectedId}
            onOpenDrawer={(id, field) => { setDrawerTaskId(id); setDrawerFocusField(field) }}
            onToggleExpand={handleToggleExpand}
            onTaskUpdate={handleTaskUpdate}
            onAddBelow={handleAddTask}
            onDeleteTask={handleDeleteTask}
            onIndent={handleIndent}
            onOutdent={handleOutdent}
            onMoveUp={handleMoveUp}
            onMoveDown={handleMoveDown}
            onAddDep={handleAddDep}
            onRemoveDep={handleRemoveDep}
            onMoveTask={handleMoveTask}
            onRowHeightsChange={setRowHeights}
            fullWidth={false}
            pendingEditIds={pendingEditIds}
            recalcRowIds={recalcHighlightIds}
            changedColsMap={changedColsMap}
            isDrawerOpen={!!drawerTaskId}
            onDeselect={() => {
              if (drawerTaskId) { setDrawerTaskId(null); setDrawerFocusField(undefined) }
              else setSelectedId(null)
            }}
            members={members}
          />
        </div>

        {/* Draggable divider */}
        {viewMode === 'split' && (
          <div
            className="w-[5px] flex-shrink-0 bg-gray-200 hover:bg-blue-400 active:bg-blue-500 cursor-col-resize transition-colors z-10"
            onMouseDown={handleDividerMouseDown}
          />
        )}

        {/* Gantt chart */}
        {viewMode === 'split' && (
          <div className="flex-1 overflow-hidden min-w-0 flex flex-col h-full">
            <GanttChart
              visibleRows={visibleRows}
              tasks={tasks}
              origin={origin}
              totalDays={totalDays}
              zoom={zoom}
              showBaseline={showBaseline}
              showCriticalPath={showCriticalPath}
              scrollRef={chartScrollRef}
              onScrollY={handleChartScrollY}
              onTaskUpdate={handleTaskUpdate}
              onSelectTask={setSelectedId}
              onOpenDrawer={id => setDrawerTaskId(id)}
              selectedId={selectedId}
              rowHeights={rowHeights}
            />
          </div>
        )}
      </div>}

      {/* Keyboard hints — hidden in kanban mode */}
      {viewMode !== 'kanban' && <div className="flex-shrink-0 border-t border-gray-100 bg-gray-50 px-3 py-0.5 flex gap-4 text-[10px] text-gray-400 overflow-x-hidden whitespace-nowrap">
        <span><kbd className="bg-gray-200 px-1 rounded">Ins</kbd> добавить</span>
        <span><kbd className="bg-gray-200 px-1 rounded">Del</kbd> удалить</span>
        <span><kbd className="bg-gray-200 px-1 rounded">Ctrl+→←</kbd> уровень</span>
        <span><kbd className="bg-gray-200 px-1 rounded">Ctrl+↑↓</kbd> переместить</span>
        <span><kbd className="bg-gray-200 px-1 rounded">Esc</kbd> закрыть</span>
        <span className="ml-auto opacity-50">Предш.: 2ОН+3 (ОН НН ОО НО)</span>
      </div>}

      <TaskDrawer
        taskId={drawerTaskId}
        projectId={projectId ?? ''}
        focusField={drawerFocusField}
        pendingFromPlan={drawerTaskId ? (pendingChanges.get(drawerTaskId) as Record<string, any> | undefined) : undefined}
        onClearPlanPending={clearPending}
        onClose={() => { setDrawerTaskId(null); setDrawerFocusField(undefined) }}
      />
    </div>
  )
}
