import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { documentsApi } from '@/api/documents'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { FormField } from '@/components/ui/FormField'

interface Props {
  parentType: 'project' | 'task' | 'client'
  parentId: string
  projectId?: string
  onClose: () => void
}

export function UploadDocumentModal({ parentType, parentId, projectId, onClose }: Props) {
  const qc = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [documentTypeId, setDocumentTypeId] = useState('')
  const [description, setDescription] = useState('')
  const [versionComment, setVersionComment] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const { data: typesData } = useQuery({
    queryKey: ['document-types'],
    queryFn: () => documentsApi.listTypes(),
  })

  const upload = useMutation({
    mutationFn: () => documentsApi.upload({
      file: file!,
      title,
      documentTypeId,
      parentType,
      parentId,
      description: description || undefined,
      versionComment: versionComment || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents'] })
      onClose()
    },
    onError: (err: any) => {
      setErrors({ _: err.response?.data?.error ?? 'Ошибка загрузки' })
    },
  })

  const validate = () => {
    const e: Record<string, string> = {}
    if (!file) e.file = 'Выберите файл'
    if (!title.trim()) e.title = 'Обязательное поле'
    if (!documentTypeId) e.documentTypeId = 'Выберите тип'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (validate()) upload.mutate()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f) { setFile(f); if (!title) setTitle(f.name.replace(/\.[^.]+$/, '')) }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) { setFile(f); if (!title) setTitle(f.name.replace(/\.[^.]+$/, '')) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Загрузить документ</h2>
          <button onClick={onClose} className="p-1 rounded text-gray-400 hover:text-gray-600">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
              errors.file ? 'border-red-300 bg-red-50' : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/30'
            }`}
          >
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />
            {file ? (
              <>
                <svg className="mx-auto h-7 w-7 text-blue-500 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-sm font-medium text-gray-700">{file.name}</p>
                <p className="text-xs text-gray-400">{(file.size / 1024).toFixed(0)} KB</p>
              </>
            ) : (
              <>
                <svg className="mx-auto h-8 w-8 text-gray-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                <p className="text-sm text-gray-500">Перетащите файл или <span className="text-blue-600">выберите</span></p>
                <p className="text-xs text-gray-400 mt-0.5">До 50 МБ</p>
              </>
            )}
          </div>
          {errors.file && <p className="text-xs text-red-600">{errors.file}</p>}

          <FormField label="Название *" error={errors.title}>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Название документа" />
          </FormField>

          <FormField label="Тип документа *" error={errors.documentTypeId}>
            <select
              value={documentTypeId}
              onChange={e => setDocumentTypeId(e.target.value)}
              className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.documentTypeId ? 'border-red-300' : 'border-gray-200'
              }`}
            >
              <option value="">Выберите тип...</option>
              {typesData?.items.map(group => (
                <optgroup key={group.category.id} label={group.category.name}>
                  {group.types.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </FormField>

          <FormField label="Описание">
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              placeholder="Необязательное описание"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </FormField>

          <FormField label="Комментарий к версии">
            <Input value={versionComment} onChange={e => setVersionComment(e.target.value)} placeholder="Например: первая редакция" />
          </FormField>

          {errors._ && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{errors._}</p>}

          <div className="flex justify-end gap-3 pt-1">
            <Button variant="secondary" type="button" onClick={onClose}>Отмена</Button>
            <Button type="submit" loading={upload.isPending} disabled={upload.isPending}>
              Загрузить
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
