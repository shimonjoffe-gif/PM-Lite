import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { documentsApi } from '@/api/documents'
import { DocumentList } from './DocumentList'
import { UploadDocumentModal } from './UploadDocumentModal'
import { Button } from '@/components/ui/Button'

interface Props {
  projectId: string
}

export function ProjectDocumentsTab({ projectId }: Props) {
  const user = useAuthStore(s => s.user)
  const [showUpload, setShowUpload] = useState(false)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [page, setPage] = useState(1)

  const { data: typesData } = useQuery({
    queryKey: ['document-types'],
    queryFn: () => documentsApi.listTypes(),
  })

  const { data, isLoading } = useQuery({
    queryKey: ['documents', 'project', projectId, { search, typeFilter, page }],
    queryFn: () => documentsApi.listForProject(projectId, {
      search: search || undefined,
      documentTypeId: typeFilter || undefined,
      page,
    }),
  })

  const totalPages = data ? Math.ceil(data.total / (data.limit || 20)) : 1

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          placeholder="Поиск по названию..."
          className="flex-1 min-w-40 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
        <Button size="sm" onClick={() => setShowUpload(true)}>
          + Загрузить
        </Button>
      </div>

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
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>{data?.total} документов</span>
          <div className="flex gap-1">
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
              className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
            >
              ←
            </button>
            <span className="px-3 py-1.5">{page} / {totalPages}</span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
              className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
            >
              →
            </button>
          </div>
        </div>
      )}

      {showUpload && (
        <UploadDocumentModal
          parentType="project"
          parentId={projectId}
          projectId={projectId}
          onClose={() => setShowUpload(false)}
        />
      )}
    </div>
  )
}
