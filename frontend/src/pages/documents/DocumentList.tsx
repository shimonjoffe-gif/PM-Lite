import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Document } from '@/types/document'
import { documentsApi } from '@/api/documents'
import { DocumentVersionsModal } from './DocumentVersionsModal'
import { downloadFile } from '@/utils/downloadFile'

interface Props {
  documents: Document[]
  isLoading: boolean
  canUpload: boolean
  isAdmin: boolean
  userId: string
}

function formatBytes(n: number | null) {
  if (!n) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

function formatDate(s: string) {
  return new Date(s).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function mimeIcon(mime: string | null) {
  if (!mime) return '📄'
  if (mime.startsWith('image/')) return '🖼️'
  if (mime.includes('pdf')) return '📕'
  if (mime.includes('word') || mime.includes('document')) return '📝'
  if (mime.includes('sheet') || mime.includes('excel')) return '📊'
  if (mime.includes('presentation') || mime.includes('powerpoint')) return '📑'
  if (mime.includes('zip') || mime.includes('archive')) return '🗜️'
  return '📄'
}

export function DocumentList({ documents, isLoading, canUpload, isAdmin, userId }: Props) {
  const qc = useQueryClient()
  const [versionsDoc, setVersionsDoc] = useState<Document | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const remove = useMutation({
    mutationFn: (id: string) => documentsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents'] })
      setConfirmDelete(null)
    },
  })

  if (isLoading) {
    return (
      <div className="py-12 text-center">
        <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      </div>
    )
  }

  if (documents.length === 0) {
    return (
      <div className="py-16 text-center">
        <svg className="mx-auto h-10 w-10 text-gray-200 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className="text-sm text-gray-400">Документов нет</p>
      </div>
    )
  }

  return (
    <>
      <div className="divide-y divide-gray-100">
        {documents.map(doc => {
          const v = doc.latestVersion
          const canDelete = isAdmin || doc.createdBy === userId
          return (
            <div key={doc.id} className="flex items-center gap-3 py-3 group">
              <div className="w-9 h-9 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center text-base flex-shrink-0">
                {mimeIcon(v?.mimeType ?? null)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-gray-900 truncate">{doc.title}</p>
                  {v && (
                    <span className="flex-shrink-0 text-[10px] font-semibold text-gray-400 bg-gray-100 rounded px-1.5 py-0.5">
                      v{v.versionNumber}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400 truncate">
                  {doc.documentTypeCategoryName} · {doc.documentTypeName}
                  {v && <> · {formatBytes(v.fileSize)} · {formatDate(doc.updatedAt)}</>}
                </p>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                <button
                  onClick={() => setVersionsDoc(doc)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                  title="Версии"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </button>
                {v && (
                  <button
                    onClick={() => downloadFile(`/api/documents/${doc.id}/versions/${v.id}/download`, v.fileName)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                    title="Скачать"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  </button>
                )}
                {canDelete && (
                  <button
                    onClick={() => setConfirmDelete(doc.id)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"
                    title="Удалить"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Delete confirm */}
      {confirmDelete && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setConfirmDelete(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl p-6 max-w-xs w-full">
            <h3 className="text-base font-semibold text-gray-900 mb-2">Удалить документ?</h3>
            <p className="text-sm text-gray-500 mb-5">Все версии файла будут недоступны. Действие нельзя отменить.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 px-4 py-2 text-sm rounded-lg border border-gray-200 hover:bg-gray-50">
                Отмена
              </button>
              <button
                onClick={() => remove.mutate(confirmDelete)}
                disabled={remove.isPending}
                className="flex-1 px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >
                {remove.isPending ? 'Удаление...' : 'Удалить'}
              </button>
            </div>
          </div>
        </div>
      )}

      {versionsDoc && (
        <DocumentVersionsModal
          document={versionsDoc}
          canUpload={canUpload}
          onClose={() => setVersionsDoc(null)}
        />
      )}
    </>
  )
}
