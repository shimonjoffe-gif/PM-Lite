import { useRef, useCallback } from 'react'
import type { GanttTask, VisibleRow, ZoomLevel } from './ganttUtils'
import {
  DAY_PX, ROW_H,
  parseDate, dateToX, xToDate, addDays, toDateStr,
  getTimelineSegments, buildDepArrows, computeCriticalPath,
} from './ganttUtils'

interface DragState {
  taskId: string
  mode: 'move' | 'resize'
  startMouseX: number
  origStart: Date | null
  origEnd: Date | null
}

interface Props {
  visibleRows: VisibleRow[]
  tasks: GanttTask[]
  origin: Date
  totalDays: number
  zoom: ZoomLevel
  showBaseline: boolean
  showCriticalPath: boolean
  scrollRef: React.RefObject<HTMLDivElement | null>
  onScrollY: (y: number) => void
  onTaskUpdate: (taskId: string, patch: Partial<Pick<GanttTask, 'startDate' | 'dueDate'>>) => void
  onSelectTask: (id: string) => void
  onOpenDrawer: (id: string) => void
  selectedId: string | null
  rowHeights?: number[]
}

const TODAY_STR = new Date().toISOString().slice(0, 10)

export function GanttChart({
  visibleRows, tasks, origin, totalDays, zoom,
  showBaseline, showCriticalPath, scrollRef, onScrollY, onTaskUpdate, onSelectTask, onOpenDrawer, selectedId,
  rowHeights,
}: Props) {
  const dayWidth = DAY_PX[zoom]
  const totalWidth = totalDays * dayWidth

  // Helpers for variable row heights (synced from WBS grid)
  const rowY = (i: number): number => {
    if (!rowHeights || rowHeights.length === 0) return i * ROW_H
    let y = 0
    for (let j = 0; j < i; j++) y += rowHeights[j] ?? ROW_H
    return y
  }
  const rowH = (i: number): number => rowHeights?.[i] ?? ROW_H
  const totalHeight = rowHeights && rowHeights.length > 0
    ? rowHeights.reduce((s, h) => s + h, 0)
    : visibleRows.length * ROW_H

  const dragRef = useRef<DragState | null>(null)

  const criticalIds = showCriticalPath ? computeCriticalPath(tasks) : new Set<string>()
  const arrows = buildDepArrows(visibleRows, origin, dayWidth, criticalIds, rowY, rowH)

  const { major, minor } = getTimelineSegments(origin, totalDays, zoom, dayWidth)

  const todayX = dateToX(TODAY_STR, origin, dayWidth)

  // ── Bar computations ────────────────────────────────────────────────────────

  function getBarCoords(task: GanttTask, rowIdx: number) {
    const s = parseDate(task.startDate)
    const e = parseDate(task.dueDate)
    if (!s || !e) return null
    const x = dateToX(s, origin, dayWidth)
    const width = Math.max(dateToX(addDays(e, 1), origin, dayWidth) - x, 4)
    const rh = rowH(rowIdx)
    const barH = Math.min(rh - 8, ROW_H - 8)
    const y = rowY(rowIdx) + Math.round((rh - barH) / 2)
    return { x, width, y, h: barH }
  }

  // ── Drag handlers ───────────────────────────────────────────────────────────

  const onBarMouseDown = useCallback((e: React.MouseEvent, taskId: string, mode: 'move' | 'resize') => {
    e.stopPropagation()
    e.preventDefault()
    const task = tasks.find(t => t.id === taskId)!
    dragRef.current = {
      taskId,
      mode,
      startMouseX: e.clientX,
      origStart: parseDate(task.startDate),
      origEnd: parseDate(task.dueDate),
    }
  }, [tasks])

  const onMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const drag = dragRef.current
    if (!drag) return
    const dx = e.clientX - drag.startMouseX
    const deltaDays = Math.round(dx / dayWidth)
    if (deltaDays === 0) return

    const task = tasks.find(t => t.id === drag.taskId)!
    if (drag.mode === 'move' && drag.origStart && drag.origEnd) {
      const newStart = addDays(drag.origStart, deltaDays)
      const newEnd = addDays(drag.origEnd, deltaDays)
      onTaskUpdate(drag.taskId, { startDate: toDateStr(newStart), dueDate: toDateStr(newEnd) })
      dragRef.current = { ...drag, origStart: newStart, origEnd: newEnd, startMouseX: e.clientX }
    } else if (drag.mode === 'resize' && drag.origEnd) {
      const newEnd = addDays(drag.origEnd, deltaDays)
      if (drag.origStart && newEnd <= drag.origStart) return
      onTaskUpdate(drag.taskId, { dueDate: toDateStr(newEnd) })
      dragRef.current = { ...drag, origEnd: newEnd, startMouseX: e.clientX }
    }
    void task
  }, [tasks, dayWidth, onTaskUpdate])

  const onMouseUp = useCallback(() => {
    dragRef.current = null
  }, [])

  // ── Scroll sync ─────────────────────────────────────────────────────────────

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    onScrollY((e.target as HTMLDivElement).scrollTop)
  }, [onScrollY])

  const isWeekend = (idx: number): boolean => {
    const d = addDays(origin, idx)
    return d.getDay() === 0 || d.getDay() === 6
  }

  return (
    <div
      ref={scrollRef as React.RefObject<HTMLDivElement>}
      className="flex-1 overflow-auto"
      onScroll={handleScroll}
    >
      {/* Timeline header */}
      <div
        className="sticky top-0 z-20 bg-white border-b border-gray-200"
        style={{ width: totalWidth, minWidth: '100%' }}
      >
        {/* Major row */}
        <div className="flex border-b border-gray-100" style={{ height: 30, position: 'relative', width: totalWidth }}>
          {major.map((seg, i) => (
            <div
              key={i}
              className="absolute flex items-center px-1 text-xs font-semibold text-gray-600 overflow-hidden whitespace-nowrap border-r border-gray-200"
              style={{ left: seg.x, width: seg.width, height: 30 }}
            >
              {seg.label}
            </div>
          ))}
        </div>
        {/* Minor row */}
        <div className="relative" style={{ height: 30, width: totalWidth }}>
          {minor.map((seg, i) => {
            const d = xToDate(seg.x + 1, origin, dayWidth)
            const isWknd = zoom === 'week' && (d.getDay() === 0 || d.getDay() === 6)
            return (
              <div
                key={i}
                className={`absolute flex items-center justify-center text-[10px] overflow-hidden whitespace-nowrap border-r border-gray-100 select-none ${isWknd ? 'text-gray-300 bg-gray-50' : 'text-gray-500'}`}
                style={{ left: seg.x, width: seg.width, height: 30 }}
              >
                {seg.label}
              </div>
            )
          })}
        </div>
      </div>

      {/* SVG body */}
      <svg
        width={totalWidth}
        height={Math.max(totalHeight, 400)}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        style={{ display: 'block', cursor: dragRef.current ? 'ew-resize' : 'default' }}
      >
        <defs>
          <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L0,6 L6,3 z" fill="#94a3b8" />
          </marker>
          <marker id="arrow-crit" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L0,6 L6,3 z" fill="#ef4444" />
          </marker>
        </defs>

        {/* Weekend shading */}
        {zoom !== 'quarter' && Array.from({ length: totalDays }, (_, i) => i).filter(i => isWeekend(i)).map(i => (
          <rect
            key={i}
            x={i * dayWidth}
            y={0}
            width={dayWidth}
            height={Math.max(totalHeight, 400)}
            fill="#f8fafc"
          />
        ))}

        {/* Row alternating backgrounds */}
        {visibleRows.map((_, i) => (
          <rect
            key={i}
            x={0} y={rowY(i)}
            width={totalWidth} height={rowH(i)}
            fill={i % 2 === 0 ? 'transparent' : '#f9fafb'}
            opacity={0.5}
          />
        ))}

        {/* Grid lines (minor) */}
        {minor.map((seg, i) => (
          <line
            key={i}
            x1={seg.x} y1={0}
            x2={seg.x} y2={Math.max(totalHeight, 400)}
            stroke="#e5e7eb"
            strokeWidth={0.5}
          />
        ))}

        {/* Row lines */}
        {visibleRows.map((_, i) => (
          <line key={i} x1={0} y1={rowY(i) + rowH(i)} x2={totalWidth} y2={rowY(i) + rowH(i)} stroke="#e5e7eb" strokeWidth={0.5} />
        ))}

        {/* Today line */}
        {todayX >= 0 && todayX <= totalWidth && (
          <g>
            <line x1={todayX} y1={0} x2={todayX} y2={Math.max(totalHeight, 400)} stroke="#3b82f6" strokeWidth={1.5} strokeDasharray="4,3" />
            <rect x={todayX - 14} y={0} width={28} height={14} rx={3} fill="#3b82f6" />
            <text x={todayX} y={10} textAnchor="middle" fill="white" fontSize={8} fontWeight={600}>Сег.</text>
          </g>
        )}

        {/* Dependency arrows */}
        {arrows.map(a => (
          <path
            key={a.key}
            d={a.d}
            fill="none"
            stroke={a.isCritical ? '#ef4444' : '#94a3b8'}
            strokeWidth={1.5}
            markerEnd={a.isCritical ? 'url(#arrow-crit)' : 'url(#arrow)'}
          />
        ))}

        {/* Task bars */}
        {visibleRows.map((row, rowIdx) => {
          const { task } = row
          const coords = getBarCoords(task, rowIdx)
          const isMilestone = task.taskType === 'milestone'
          const isCrit = criticalIds.has(task.id)
          const isSel = selectedId === task.id

          if (!coords) {
            // No dates — show dashed placeholder
            return (
              <g key={task.id} onClick={() => onSelectTask(task.id)}>
                <rect
                  x={dayWidth} y={rowY(rowIdx) + Math.round(rowH(rowIdx) / 2) - 10}
                  width={80} height={20}
                  fill="none" stroke="#d1d5db" strokeWidth={1} strokeDasharray="4,2"
                  rx={3}
                />
                <text x={dayWidth + 8} y={rowY(rowIdx) + Math.round(rowH(rowIdx) / 2) + 4} fill="#9ca3af" fontSize={10}>Нет дат</text>
              </g>
            )
          }

          const { x, width, y, h } = coords
          const barColor = isCrit ? '#ef4444' : (task.status === 'done' ? '#10b981' : '#3b82f6')

          if (isMilestone) {
            const cx = x + dayWidth / 2
            const cy = rowY(rowIdx) + Math.round(rowH(rowIdx) / 2)
            const size = 8
            return (
              <g key={task.id} onClick={() => onSelectTask(task.id)} onDoubleClick={() => onOpenDrawer(task.id)} style={{ cursor: 'pointer' }}>
                <polygon
                  points={`${cx},${cy - size} ${cx + size},${cy} ${cx},${cy + size} ${cx - size},${cy}`}
                  fill={barColor}
                  stroke={isSel ? '#1e40af' : 'transparent'}
                  strokeWidth={2}
                />
              </g>
            )
          }

          return (
            <g key={task.id} onClick={() => onSelectTask(task.id)} onDoubleClick={() => onOpenDrawer(task.id)} style={{ cursor: 'pointer' }}>
              {/* Baseline bar */}
              {showBaseline && task.baselineStart && task.baselineFinish && (() => {
                const bx = dateToX(task.baselineStart, origin, dayWidth)
                const bw = Math.max(dateToX(addDays(parseDate(task.baselineFinish)!, 1), origin, dayWidth) - bx, 4)
                return (
                  <rect
                    x={bx} y={y + h - 4}
                    width={bw} height={4}
                    fill="#9ca3af" opacity={0.5} rx={1}
                  />
                )
              })()}

              {/* Main bar */}
              <rect
                x={x} y={y}
                width={width} height={h}
                fill={barColor}
                opacity={task.status === 'cancelled' ? 0.4 : 0.85}
                rx={3}
                stroke={isSel ? '#1e3a5f' : 'transparent'}
                strokeWidth={2}
                onMouseDown={(e) => onBarMouseDown(e, task.id, 'move')}
              />

              {/* Progress fill */}
              {task.percentComplete > 0 && task.percentComplete < 100 && (
                <rect
                  x={x} y={y}
                  width={width * task.percentComplete / 100} height={h}
                  fill="white" opacity={0.25} rx={3}
                />
              )}

              {/* Progress % label inside bar */}
              {width > 30 && task.percentComplete > 0 && (
                <text
                  x={x + 4} y={y + h / 2 + 4}
                  fill="white" fontSize={10} fontWeight={600}
                  style={{ pointerEvents: 'none' }}
                >
                  {task.percentComplete}%
                </text>
              )}


              {/* Resize handle */}
              <rect
                x={x + width - 6} y={y}
                width={6} height={h}
                fill="white" opacity={0.3} rx={2}
                style={{ cursor: 'ew-resize' }}
                onMouseDown={(e) => onBarMouseDown(e, task.id, 'resize')}
              />
            </g>
          )
        })}
      </svg>
    </div>
  )
}
