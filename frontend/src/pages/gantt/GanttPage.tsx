import { useState, useRef, useMemo, useCallback, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'

import type { GanttTask, VisibleRow, ZoomLevel } from './ganttUtils'
import {
  flattenForDisplay, computeWbs, getProjectDateRange, DAY_PX,
  dateToX,
} from './ganttUtils'

import type { ColumnKey } from './GanttGrid'
import { GanttGrid } from './GanttGrid'
import { GanttChart } from './GanttChart'
import { GanttToolbar } from './GanttToolbar'
import { TaskDrawer } from '@/pages/tasks/TaskDrawer'

// ── API calls ─────────────────────────────────────────────────────────────────

async function fetchGanttTasks(projectId: string): Promise<GanttTask[]> {
  const r = await api.get(`/projects/${projectId}/gantt`)
  return r.data
}

async function fetchProject(projectId: string) {
  const r = await api.get(`/projects/${projectId}`)
  return r.data as { id: string; name: string }
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function GanttPage() {
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

  // Local optimistic copy for instant drag-and-drop feel
  const [localTasks, setLocalTasks] = useState<GanttTask[]>([])
  useEffect(() => { setLocalTasks(remoteTasks) }, [remoteTasks])
  const tasks = localTasks.length > 0 ? localTasks : remoteTasks

  // ── UI state ────────────────────────────────────────────────────────────────

  const [zoom, setZoom] = useState<ZoomLevel>('month')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [drawerTaskId, setDrawerTaskId] = useState<string | null>(null)
  const [showBaseline, setShowBaseline] = useState(false)
  const [showCriticalPath, setShowCriticalPath] = useState(true)
  const [columns, setColumns] = useState<ColumnKey[]>(['wbs', 'name', 'duration', 'start', 'finish', 'pct', 'assignee'])

  // Auto-expand all top-level tasks initially
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

  // Compare values instead of flags: if target already at y, skip → breaks infinite loop
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

  const updateMut = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) =>
      api.patch(`/tasks/${id}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gantt', projectId] }),
  })

  const createMut = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.post(`/projects/${projectId}/tasks`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gantt', projectId] }),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/tasks/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gantt', projectId] }),
  })

  const baselineMut = useMutation({
    mutationFn: () => api.post(`/projects/${projectId}/set-baseline`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gantt', projectId] }),
  })

  // ── Optimistic task update (for drag) ───────────────────────────────────────

  const handleTaskUpdate = useCallback((taskId: string, patch: Partial<GanttTask>) => {
    setLocalTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...patch } : t))
    updateMut.mutate({ id: taskId, patch })
  }, [updateMut])

  // ── Tree operations ─────────────────────────────────────────────────────────

  const handleToggleExpand = useCallback((id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleAddTask = useCallback((afterId?: string) => {
    const afterTask = afterId ? tasks.find(t => t.id === afterId) : null
    const siblings = tasks.filter(t => t.parentId === (afterTask?.parentId ?? null))
    const sortOrder = afterTask
      ? (afterTask.sortOrder + 1)
      : (Math.max(...siblings.map(s => s.sortOrder), -1) + 1)

    createMut.mutate({
      title: 'Новая задача',
      parentId: afterTask?.parentId ?? null,
      sortOrder,
    }, {
      onSuccess: (res) => {
        setSelectedId(res.data?.id ?? null)
      },
    })
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
    // Find previous sibling
    const prevSiblingRow = visibleRows.slice(0, rowIdx).reverse().find(r => r.task.parentId === row.task.parentId)
    if (!prevSiblingRow) return
    updateMut.mutate({ id, patch: { parentId: prevSiblingRow.task.id, sortOrder: 9999 } })
    setExpanded(prev => new Set([...prev, prevSiblingRow.task.id]))
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
    const prevRow = visibleRows.slice(0, rowIdx).reverse().find(r => r.task.parentId === row.task.parentId)
    if (!prevRow) return
    // Swap sortOrders
    updateMut.mutate({ id, patch: { sortOrder: prevRow.task.sortOrder } })
    updateMut.mutate({ id: prevRow.task.id, patch: { sortOrder: row.task.sortOrder } })
  }, [visibleRows, updateMut])

  const handleMoveDown = useCallback((id: string) => {
    const row = visibleRows.find(r => r.task.id === id)
    if (!row) return
    const rowIdx = visibleRows.indexOf(row)
    const nextRow = visibleRows.slice(rowIdx + 1).find(r => r.task.parentId === row.task.parentId)
    if (!nextRow) return
    updateMut.mutate({ id, patch: { sortOrder: nextRow.task.sortOrder } })
    updateMut.mutate({ id: nextRow.task.id, patch: { sortOrder: row.task.sortOrder } })
  }, [visibleRows, updateMut])

  // ── Scroll to today ─────────────────────────────────────────────────────────

  const handleScrollToday = useCallback(() => {
    if (!chartScrollRef.current) return
    const dayWidth = DAY_PX[zoom]
    const todayX = dateToX(new Date(), origin, dayWidth)
    chartScrollRef.current.scrollLeft = Math.max(0, todayX - 300)
  }, [origin, zoom])

  // Auto-scroll to today on mount
  useEffect(() => {
    const timer = setTimeout(handleScrollToday, 300)
    return () => clearTimeout(timer)
  }, [handleScrollToday, tasks.length])

  const handleOpenDrawer = useCallback((id: string) => {
    setDrawerTaskId(id)
  }, [])

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

      <div className="flex flex-1 overflow-hidden" style={{ marginTop: 0 }}>
        <GanttGrid
          visibleRows={visibleRows}
          wbsMap={wbsMap}
          columns={columns}
          selectedId={selectedId}
          scrollRef={gridScrollRef}
          onScrollY={handleGridScrollY}
          onSelectTask={setSelectedId}
          onOpenDrawer={handleOpenDrawer}
          onToggleExpand={handleToggleExpand}
          onTaskUpdate={handleTaskUpdate}
          onAddBelow={handleAddTask}
          onDeleteTask={handleDeleteTask}
          onIndent={handleIndent}
          onOutdent={handleOutdent}
          onMoveUp={handleMoveUp}
          onMoveDown={handleMoveDown}
        />

        {/* Resize divider (decorative) */}
        <div className="w-1 bg-gray-200 flex-shrink-0 cursor-col-resize hover:bg-blue-300 transition-colors" />

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
          onOpenDrawer={handleOpenDrawer}
          selectedId={selectedId}
        />
      </div>

      {/* Task detail drawer — opens on double-click */}
      <TaskDrawer
        taskId={drawerTaskId}
        projectId={projectId ?? ''}
        onClose={() => setDrawerTaskId(null)}
      />
    </div>
  )
}
