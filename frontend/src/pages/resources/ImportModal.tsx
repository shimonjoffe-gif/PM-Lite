import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { resourcesApi } from '@/api/resources'
import type { ImportResult } from '@/types/resource'

const ACCEPT = '.xml,.xlsx,.xls,.csv'

const FORMAT_DESCRIPTIONS = [
  { ext: '.xml', label: 'MS Project XML (.xml)', desc: 'Экспорт из Microsoft Project: Файл → Сохранить как → XML' },
  { ext: '.xml', label: 'Primavera P6 XML (.xml)', desc: 'Экспорт из Oracle Primavera P6: Файл → Экспорт → XML' },
  { ext: '.xlsx', label: 'Excel (.xlsx / .xls)', desc: 'Таблица с колонками: Название, Тип, Исполнитель, Дата начала, Дата окончания, Трудоёмкость (ч)' },
  { ext: '.csv', label: 'CSV (.csv)', desc: 'CSV с теми же заголовками, кодировка UTF-8' },
]

interface Props {
  onClose: () => void
}

export function ImportModal({ onClose }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const qc = useQueryClient()

  const importMutation = useMutation({
    mutationFn: (f: File) => resourcesApi.importFile(f),
    onSuccess: (data) => {
      setResult(data)
      qc.invalidateQueries({ queryKey: ['projects'] })
      qc.invalidateQueries({ queryKey: ['timeline'] })
    },
    onError: (err: any) => {
      setError(err.response?.data?.message ?? 'Ошибка импорта')
    },
  })

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const dropped = e.dataTransfer.files[0]
    if (dropped) setFile(dropped)
  }

  const handleSubmit = () => {
    if (!file) return
    setError(null)
    setResult(null)
    importMutation.mutate(file)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Импорт проекта</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Result */}
          {result ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-green-50 rounded-lg border border-green-100">
                <svg className="h-5 w-5 text-green-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <div className="text-sm text-green-800">
                  <p className="font-medium">Импорт завершён</p>
                  <p>Проектов: {result.projectsCreated} · Задач: {result.tasksCreated} · Связей: {result.dependenciesCreated}</p>
                </div>
              </div>
              {result.warnings.length > 0 && (
                <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-100">
                  <p className="text-xs font-medium text-yellow-800 mb-1">Предупреждения ({result.warnings.length}):</p>
                  <ul className="text-xs text-yellow-700 space-y-0.5 max-h-24 overflow-y-auto">
                    {result.warnings.map((w, i) => <li key={i}>• {w}</li>)}
                  </ul>
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => { setResult(null); setFile(null) }}
                  className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  Импортировать ещё
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Готово
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Drop zone */}
              <div
                onDrop={handleDrop}
                onDragOver={e => e.preventDefault()}
                onClick={() => inputRef.current?.click()}
                className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-blue-300 hover:bg-blue-50/30 transition-colors"
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept={ACCEPT}
                  className="hidden"
                  onChange={e => setFile(e.target.files?.[0] ?? null)}
                />
                {file ? (
                  <div className="flex flex-col items-center gap-2">
                    <svg className="h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p className="text-sm font-medium text-gray-800">{file.name}</p>
                    <p className="text-xs text-gray-400">{(file.size / 1024).toFixed(0)} KB · Нажмите для замены</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <svg className="h-10 w-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <p className="text-sm text-gray-600">Перетащите файл или <span className="text-blue-600">выберите</span></p>
                    <p className="text-xs text-gray-400">.xml, .xlsx, .xls, .csv до 50 МБ</p>
                  </div>
                )}
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 rounded-lg border border-red-100 text-sm text-red-700">
                  <svg className="h-4 w-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {error}
                </div>
              )}

              {/* Supported formats */}
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">Поддерживаемые форматы:</p>
                <div className="space-y-2">
                  {FORMAT_DESCRIPTIONS.map(f => (
                    <div key={f.label} className="flex gap-2 text-xs">
                      <span className="font-mono text-gray-400 w-10">{f.ext}</span>
                      <div>
                        <p className="font-medium text-gray-700">{f.label}</p>
                        <p className="text-gray-400">{f.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  Отмена
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!file || importMutation.isPending}
                  className="flex-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {importMutation.isPending && (
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  )}
                  {importMutation.isPending ? 'Импорт...' : 'Импортировать'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
