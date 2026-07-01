import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { storageSettingsApi } from '@/api/storageSettings'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { FormField } from '@/components/ui/FormField'

function formatDate(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function StorageSettingsPage() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['storage-settings'],
    queryFn: () => storageSettingsApi.get(),
  })

  const [mode, setMode] = useState<'cloud' | 'external'>('cloud')
  const [pluginUrl, setPluginUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [verifyResult, setVerifyResult] = useState<{ ok: boolean; version?: string; error?: string } | null>(null)
  const [saved, setSaved] = useState(false)

  // Sync state from query
  const [synced, setSynced] = useState(false)
  if (data && !synced) {
    setMode(data.storageMode)
    setPluginUrl(data.pluginUrl ?? '')
    setSynced(true)
  }

  const update = useMutation({
    mutationFn: () => storageSettingsApi.update({
      storageMode: mode,
      pluginUrl: mode === 'external' ? pluginUrl : undefined,
      apiKey: mode === 'external' && apiKey ? apiKey : undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['storage-settings'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  const verify = useMutation({
    mutationFn: () => storageSettingsApi.verify(apiKey),
    onSuccess: (result) => {
      setVerifyResult(result)
      if (result.ok) qc.invalidateQueries({ queryKey: ['storage-settings'] })
    },
  })

  if (isLoading) return <p className="text-sm text-gray-400">Загрузка...</p>

  return (
    <div className="max-w-xl">
      <h1 className="text-xl font-bold text-gray-900 mb-6">Хранилище документов</h1>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
        {/* Mode selector */}
        <div>
          <p className="text-sm font-medium text-gray-700 mb-3">Режим хранения</p>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => { setMode('cloud'); setVerifyResult(null) }}
              className={`p-4 rounded-xl border-2 text-left transition-colors ${
                mode === 'cloud' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <svg className="h-5 w-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                </svg>
                <span className="text-sm font-semibold text-gray-900">Облако</span>
              </div>
              <p className="text-xs text-gray-500">Файлы хранятся на сервере PM Lite</p>
            </button>

            <button
              onClick={() => { setMode('external'); setVerifyResult(null) }}
              className={`p-4 rounded-xl border-2 text-left transition-colors ${
                mode === 'external' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <svg className="h-5 w-5 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
                </svg>
                <span className="text-sm font-semibold text-gray-900">Плагин</span>
              </div>
              <p className="text-xs text-gray-500">Файлы на вашем сервере через плагин</p>
            </button>
          </div>
        </div>

        {/* Plugin settings */}
        {mode === 'external' && (
          <div className="space-y-4 border-t border-gray-100 pt-4">
            <FormField label="URL плагина" error={undefined}>
              <Input
                value={pluginUrl}
                onChange={e => setPluginUrl(e.target.value)}
                placeholder="http://your-server:3001"
              />
            </FormField>

            <FormField label="API ключ">
              <div className="flex gap-2">
                <Input
                  type="password"
                  value={apiKey}
                  onChange={e => { setApiKey(e.target.value); setVerifyResult(null) }}
                  placeholder="Ключ для аутентификации плагина"
                  className="flex-1"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => verify.mutate()}
                  loading={verify.isPending}
                  disabled={!apiKey || !pluginUrl || verify.isPending}
                >
                  Проверить
                </Button>
              </div>
            </FormField>

            {verifyResult && (
              <div className={`rounded-lg px-4 py-3 text-sm ${verifyResult.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>
                {verifyResult.ok
                  ? `✓ Плагин доступен, версия ${verifyResult.version}`
                  : `✕ Ошибка: ${verifyResult.error}`
                }
              </div>
            )}

            {data?.storageMode === 'external' && data.pluginVerifiedAt && (
              <p className="text-xs text-gray-400">
                Последняя проверка: {formatDate(data.pluginVerifiedAt)}
                {data.pluginVersion && ` · v${data.pluginVersion}`}
              </p>
            )}

            <div className="bg-amber-50 rounded-xl p-4 text-xs text-amber-800 space-y-1">
              <p className="font-semibold">Как установить плагин:</p>
              <ol className="list-decimal list-inside space-y-0.5">
                <li>Скачайте <code className="font-mono bg-amber-100 px-1 rounded">plugin/</code> из репозитория PM Lite</li>
                <li>Скопируйте <code className="font-mono bg-amber-100 px-1 rounded">.env.example</code> в <code className="font-mono bg-amber-100 px-1 rounded">.env</code>, задайте <code className="font-mono bg-amber-100 px-1 rounded">API_KEY</code></li>
                <li>Запустите: <code className="font-mono bg-amber-100 px-1 rounded">npm install && npm run dev</code></li>
                <li>Введите тот же <code className="font-mono bg-amber-100 px-1 rounded">API_KEY</code> сюда и нажмите «Проверить»</li>
              </ol>
            </div>
          </div>
        )}

        <div className="pt-2 flex items-center gap-3">
          <Button onClick={() => update.mutate()} loading={update.isPending}>
            Сохранить
          </Button>
          {saved && <span className="text-sm text-green-600">Сохранено</span>}
        </div>
      </div>
    </div>
  )
}
