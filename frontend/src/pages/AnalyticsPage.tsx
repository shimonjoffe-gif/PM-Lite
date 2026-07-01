import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchStats } from '@/api/analytics'

type Preset = '7d' | '30d' | '90d'

function getPresetDates(preset: Preset): { from: string; to: string } {
  const to = new Date()
  const from = new Date()
  const days = preset === '7d' ? 7 : preset === '30d' ? 30 : 90
  from.setDate(from.getDate() - days)
  return { from: from.toISOString(), to: to.toISOString() }
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-3xl font-bold text-gray-900">{value}</p>
    </div>
  )
}

export function AnalyticsPage() {
  const [preset, setPreset] = useState<Preset>('30d')

  const { from, to } = getPresetDates(preset)

  const { data, isLoading, error } = useQuery({
    queryKey: ['analytics-stats', preset],
    queryFn: () => fetchStats(from, to),
  })

  const presets: { key: Preset; label: string }[] = [
    { key: '7d', label: '7 дней' },
    { key: '30d', label: '30 дней' },
    { key: '90d', label: '90 дней' },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Аналитика использования</h2>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          {presets.map(p => (
            <button
              key={p.key}
              onClick={() => setPreset(p.key)}
              className={
                `px-4 py-1.5 text-sm font-medium transition-colors ` +
                (preset === p.key
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50')
              }
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
          Загрузка...
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Не удалось загрузить статистику. Попробуйте позже.
        </div>
      )}

      {data && (
        <div className="space-y-8">
          {/* Суммарные карточки */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard label="Проектов создано" value={data.totals.projectsCreated} />
            <StatCard label="Задач создано" value={data.totals.tasksCreated} />
            <StatCard label="Вызовов AI" value={data.totals.aiCalls} />
          </div>

          {/* Разбивка по пользователям */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">По пользователям</h3>
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Сотрудник</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600">Проекты</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600">Задачи</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600">AI-вызовы</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.byUser.map(u => (
                    <tr key={u.userId} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{u.fullName}</p>
                        <p className="text-xs text-gray-400">{u.email}</p>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700">{u.projectsCreated}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{u.tasksCreated}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{u.aiCalls}</td>
                    </tr>
                  ))}
                  {data.byUser.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                        Нет данных за выбранный период
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
