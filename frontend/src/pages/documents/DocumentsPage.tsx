import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { documentsApi } from '@/api/documents'
import { DocumentList } from './DocumentList'
import { UploadDocumentModal } from './UploadDocumentModal'

export function DocumentsPage() {
  const user = useAuthStore(s => s.user)
  const [showUpload, setShowUpload] = useState(false)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [parentType, setParentType] = useState('')
  const [page, setPage] = useState(1)

  const { data: typesData } = useQuery({
    queryKey: ['document-types'],
    queryFn: () => documentsApi.listTypes(),
  })

  const { data, isLoading } = useQuery({
    queryKey: ['documents', 'all', { search, typeFilter, parentType, page }],
    queryFn: () => documentsApi.list({
      search: search || undefined,
      documentTypeId: typeFilter || undefined,
      parentType: parentType || undefined,
      page,
    }),
  })

  const totalPages = data ? Math.ceil(data.total / (data.limit || 20)) : 1

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-gray-900">Библиотека документов</h1>
        <button
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          Загрузить
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 mb-4 flex flex-wrap gap-3">
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          placeholder="Поиск по названию..."
          className="flex-1 min-w-52 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={typeFilter}
          onChange={e => { setTypeFilter(e.target.value); setPage(1) }}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Все типы</option>
          {typesData?.items.map(group => (
            <optgroup key={group.category.id} label={group.category.name}>
              {group.types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </optgroup>
          ))}
        </select>
        <select
          value={parentType}
          onChange={e => { setParentType(e.target.value); setPage(1) }}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Все объекты</option>
          <option value="project">Проекты</option>
          <option value="task">Задачи</option>
          <option value="client">Клиенты</option>
        </select>
      </div>

      {/* Counters */}
      {data && (
        <p className="text-xs text-gray-400 mb-3">{data.total} документов</p>
      )}

      {/* List */}
      <div className="bg-white rounded-xl border border-gray-200 px-4">
        <DocumentList
          documents={data?.items ?? []}
          isLoading={isLoading}
          canUpload={true}
          isAdmin={user?.isAdmin ?? false}
          userId={user?.id ?? ''}
        />
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-1 text-sm">
          <button
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
            className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
          >
            ←
          </button>
          <span className="px-3 py-1.5 text-gray-500">{page} / {totalPages}</span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage(p => p + 1)}
            className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
          >
            →
          </button>
        </div>
      )}

      {showUpload && (
        <UploadDocumentModal
          parentType="project"
          parentId={''}
          onClose={() => setShowUpload(false)}
        />
      )}
    </div>
  )
}
