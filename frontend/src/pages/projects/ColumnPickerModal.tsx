import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { userPrefsApi } from '@/api/userPrefs'
import { ALL_PROJECT_COLUMNS, PROJECT_COLUMN_LABELS } from '@/types/project'
import { Button } from '@/components/ui/Button'

interface Props {
  current: string[]
  onClose: () => void
}

export function ColumnPickerModal({ current, onClose }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set(current))
  const qc = useQueryClient()

  const save = useMutation({
    mutationFn: (cols: string[]) => userPrefsApi.setColumns('projects', cols),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['col-prefs', 'projects'] })
      onClose()
    },
  })

  const toggle = (col: string) => {
    if (col === 'name') return // name всегда
    setSelected(prev => {
      const next = new Set(prev)
      next.has(col) ? next.delete(col) : next.add(col)
      return next
    })
  }

  const ordered = ALL_PROJECT_COLUMNS.filter(c => selected.has(c))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900">Настройка колонок</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4 space-y-2 max-h-80 overflow-y-auto">
          {ALL_PROJECT_COLUMNS.map(col => (
            <label key={col} className="flex items-center gap-3 py-1 cursor-pointer group">
              <input
                type="checkbox"
                checked={selected.has(col)}
                disabled={col === 'name'}
                onChange={() => toggle(col)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
              />
              <span className={`text-sm ${col === 'name' ? 'text-gray-400' : 'text-gray-700 group-hover:text-gray-900'}`}>
                {PROJECT_COLUMN_LABELS[col]}
                {col === 'name' && <span className="ml-1 text-xs text-gray-300">(всегда)</span>}
              </span>
            </label>
          ))}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Отмена</Button>
          <Button
            size="sm"
            onClick={() => save.mutate(ordered)}
            loading={save.isPending}
            disabled={ordered.length === 0}
          >
            Сохранить
          </Button>
        </div>
      </div>
    </div>
  )
}
