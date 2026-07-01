import type { ZoomLevel } from './ganttUtils'
import type { ColumnKey } from './GanttGrid'

const ALL_COLUMNS: { key: ColumnKey; label: string }[] = [
  { key: 'seq',        label: 'Стр (№ строки)' },
  { key: 'wbs',        label: 'СДР (иерархия)' },
  { key: 'name',       label: 'Название' },
  { key: 'duration',   label: 'Длительность' },
  { key: 'start',      label: 'Начало' },
  { key: 'finish',     label: 'Конец' },
  { key: 'pct',        label: '% выполнения' },
  { key: 'assignee',   label: 'Исполнитель' },
  { key: 'type',       label: 'Тип задачи' },
  { key: 'predecessor',label: 'Предшественники' },
  { key: 'constraint', label: 'Ограничение' },
]

const ZOOM_LABELS: Record<ZoomLevel, string> = {
  day: 'День',
  week: 'Неделя',
  month: 'Месяц',
  quarter: 'Квартал',
}

interface Props {
  zoom: ZoomLevel
  onZoomChange: (z: ZoomLevel) => void
  columns: ColumnKey[]
  onColumnsChange: (cols: ColumnKey[]) => void
  showBaseline: boolean
  onBaselineToggle: () => void
  showCriticalPath: boolean
  onCriticalPathToggle: () => void
  onSetBaseline: () => void
  onAddTask: () => void
  onScrollToday: () => void
  projectName: string
}

export function GanttToolbar({
  zoom, onZoomChange, columns, onColumnsChange,
  showBaseline, onBaselineToggle,
  showCriticalPath, onCriticalPathToggle,
  onSetBaseline, onAddTask, onScrollToday, projectName,
}: Props) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 bg-white flex-shrink-0 flex-wrap">
      {/* Project name */}
      <span className="text-sm font-semibold text-gray-700 mr-2 truncate max-w-[200px]">{projectName}</span>

      {/* Add task */}
      <button
        onClick={onAddTask}
        className="flex items-center gap-1 px-2.5 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
        title="Добавить задачу (Enter на выделенной строке)"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Задача
      </button>

      <div className="h-5 w-px bg-gray-200" />

      {/* Zoom */}
      <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
        {(['day', 'week', 'month', 'quarter'] as ZoomLevel[]).map(z => (
          <button
            key={z}
            onClick={() => onZoomChange(z)}
            className={`px-2.5 py-1 ${zoom === z ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            {ZOOM_LABELS[z]}
          </button>
        ))}
      </div>

      {/* Today */}
      <button
        onClick={onScrollToday}
        className="px-2.5 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 text-gray-600"
      >
        Сегодня
      </button>

      <div className="h-5 w-px bg-gray-200" />

      {/* Toggles */}
      <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={showCriticalPath}
          onChange={onCriticalPathToggle}
          className="rounded"
        />
        Критический путь
      </label>

      <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={showBaseline}
          onChange={onBaselineToggle}
          className="rounded"
        />
        Базовый план
      </label>

      {/* Set baseline */}
      <button
        onClick={() => { if (confirm('Зафиксировать текущий план как базовый?')) onSetBaseline() }}
        className="px-2.5 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 text-gray-600"
        title="Скопировать текущие даты в базовый план"
      >
        📌 Зафиксировать базовый
      </button>

      <div className="h-5 w-px bg-gray-200" />

      {/* Column picker */}
      <div className="relative group">
        <button className="px-2.5 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 text-gray-600">
          Столбцы ▾
        </button>
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-2 z-50 hidden group-hover:block min-w-[160px]">
          {ALL_COLUMNS.map(c => (
            <label key={c.key} className="flex items-center gap-2 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 rounded cursor-pointer">
              <input
                type="checkbox"
                checked={columns.includes(c.key)}
                onChange={e => {
                  if (c.key === 'name') return // always visible
                  if (e.target.checked) onColumnsChange([...columns, c.key])
                  else onColumnsChange(columns.filter(k => k !== c.key))
                }}
                disabled={c.key === 'name'}
              />
              {c.label}
            </label>
          ))}
        </div>
      </div>

    </div>
  )
}
