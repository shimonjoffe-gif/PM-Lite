import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Document } from '@/types/document'
import { documentsApi } from '@/api/documents'
import { Button } from '@/components/ui/Button'
import { downloadFile } from '@/utils/downloadFile'

interface Props {
  document: Document
  canUpload: boolean
  onClose: () => void
}

function formatBytes(n: number | null) {
  if (!n) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

function formatDate(s: string) {
  return new Date(s).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function DocumentVersionsModal({ document: doc, canUpload, onClose }: Props) {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [comment, setComment] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [showUpload, setShowUpload] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['document-versions', doc.id],
    queryFn: () => documentsApi.listVersions(doc.id),
  })

  const addVersion = useMutation({
    mutationFn: () => documentsApi.uploadVersion(doc.id, { file: file!, comment: comment || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['document-versions', doc.id] })
      qc.invalidateQueries({ queryKey: ['documents'] })
      setFile(null)
      setComment('')
      setShowUpload(false)
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="min-w-0 pr-2">
            <h2 className="text-base font-semibold text-gray-900 truncate">{doc.title}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{doc.documentTypeName}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded text-gray-400 hover:text-gray-600 flex-shrink-0">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Versions list */}
        <div className="flex-1 overflow-y-auto p-5 space-y-2">
          {isLoading && <p className="text-sm text-gray-400 text-center py-6">Загрузка...</p>}
          {data?.items.map(v => (
            <div key={v.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-gray-200 group">
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0 text-xs font-bold text-blue-600">
                v{v.versionNumber}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-800 truncate">{v.fileName}</p>
                <p className="text-xs text-gray-400">
                  {formatBytes(v.fileSize)} · {v.createdByName} · {formatDate(v.createdAt)}
                  {v.comment && <span className="ml-2 italic">"{v.comment}"</span>}
                </p>
              </div>
              <button
                onClick={() => downloadFile(`/api/documents/${doc.id}/versions/${v.id}/download`, v.fileName)}
                className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-all"
                title="Скачать"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </button>
            </div>
          ))}
          {data?.items.length === 0 && <p className="text-sm text-gray-400 text-center py-4">Версий нет</p>}
        </div>

        {/* Upload new version */}
        {canUpload && (
          <div className="border-t border-gray-100 px-5 py-4 flex-shrink-0">
            {!showUpload ? (
              <Button variant="secondary" size="sm" onClick={() => setShowUpload(true)} className="w-full">
                + Загрузить новую версию
              </Button>
            ) : (
              <div className="space-y-3">
                <div
                  onClick={() => fileRef.current?.click()}
                  className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center cursor-pointer hover:border-blue-300"
                >
                  <input ref={fileRef} type="file" className="hidden" onChange={e => setFile(e.target.files?.[0] ?? null)} />
                  {file
                    ? <p className="text-sm text-gray-700 font-medium">{file.name}</p>
                    : <p className="text-sm text-gray-400">Выберите файл</p>
                  }
                </div>
                <input
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  placeholder="Комментарий к версии (необязательно)"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => { setShowUpload(false); setFile(null) }}>
                    Отмена
                  </Button>
                  <Button
                    size="sm"
                    disabled={!file || addVersion.isPending}
                    loading={addVersion.isPending}
                    onClick={() => addVersion.mutate()}
                  >
                    Загрузить
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
