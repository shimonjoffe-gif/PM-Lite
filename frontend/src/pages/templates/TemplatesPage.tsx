import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { templatesApi } from '@/api/templates'
import type { ProjectTemplate } from '@/types/templates'

function CreateTemplateModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')

  const createMut = useMutation({
    mutationFn: templatesApi.create,
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ['templates'] })
      navigate(`/templates/${t.id}`)
    },
  })

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
        <h2 className="text-lg font-bold mb-4">Новый шаблон</h2>
        <form
          onSubmit={e => { e.preventDefault(); createMut.mutate({ name, description, category }) }}
          className="space-y-3"
        >
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Название</label>
            <input
              className="w-full border rounded-lg px-3 py-2 text-sm"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Категория</label>
            <input
              className="w-full border rounded-lg px-3 py-2 text-sm"
              placeholder="Строительство, ИТ, Инфраструктура..."
              value={category}
              onChange={e => setCategory(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Описание</label>
            <textarea
              className="w-full border rounded-lg px-3 py-2 text-sm"
              rows={3}
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600">
              Отмена
            </button>
            <button
              type="submit"
              disabled={createMut.isPending}
              className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              Создать
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function TemplateCard({ template, onDelete }: { template: ProjectTemplate; onDelete: () => void }) {
  return (
    <div className="bg-white border rounded-xl p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {template.category && (
              <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">
                {template.category}
              </span>
            )}
            {template.isPublished ? (
              <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full">Опубликован</span>
            ) : (
              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Черновик</span>
            )}
            <span className="text-xs text-gray-400">v{template.version}</span>
          </div>
          <Link to={`/templates/${template.id}`} className="font-semibold text-gray-900 hover:text-indigo-600 line-clamp-1">
            {template.name}
          </Link>
          {template.description && (
            <p className="text-sm text-gray-500 mt-1 line-clamp-2">{template.description}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-4 mt-3 pt-3 border-t text-xs text-gray-500">
        <span>{template._count?.tasks ?? 0} задач</span>
        <span>{template.usageCount} проектов</span>
        {template.creator && <span>Автор: {template.creator.fullName}</span>}
        <div className="ml-auto flex gap-2">
          <Link to={`/templates/${template.id}`} className="text-indigo-600 hover:underline">
            Открыть
          </Link>
          <button onClick={onDelete} className="text-red-400 hover:underline">
            Удалить
          </button>
        </div>
      </div>
    </div>
  )
}

export function TemplatesPage() {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [search, setSearch] = useState('')

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['templates'],
    queryFn: templatesApi.list,
  })

  const deleteMut = useMutation({
    mutationFn: templatesApi.delete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
  })

  const filtered = templates.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    (t.category?.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div>
      {showCreate && <CreateTemplateModal onClose={() => setShowCreate(false)} />}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Шаблоны проектов</h1>
          <p className="text-sm text-gray-500 mt-1">Структуры проектов с иерархией задач, зависимостями и нормированием</p>
        </div>
        <div className="flex gap-2">
          <Link
            to="/templates/norm-params"
            className="px-4 py-2 text-sm border rounded-lg text-gray-700 hover:bg-gray-50"
          >
            Параметры нормирования
          </Link>
          <Link
            to="/templates/assemble"
            className="px-4 py-2 text-sm border rounded-lg text-gray-700 hover:bg-gray-50"
          >
            Планирование по аналогам
          </Link>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            + Новый шаблон
          </button>
        </div>
      </div>

      <div className="mb-4">
        <input
          type="search"
          className="w-full max-w-xs border rounded-lg px-3 py-2 text-sm"
          placeholder="Поиск шаблонов..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="text-gray-400 text-center py-12">Загрузка...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-lg mb-2">Шаблонов нет</p>
          <p className="text-sm">Создайте первый шаблон проекта</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(t => (
            <TemplateCard
              key={t.id}
              template={t}
              onDelete={() => {
                if (confirm(`Удалить шаблон «${t.name}»?`)) deleteMut.mutate(t.id)
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
