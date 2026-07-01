import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { aiApi } from '@/api/ai'
import type { AiCase, AiPromptInfo } from '@/types/ai'
import { PROMPT_KEY_LABELS } from '@/types/ai'

type Tab = 'cases' | 'prompts' | 'usage'

export function AiSettingsPage() {
  const [tab, setTab] = useState<Tab>('cases')

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Настройки AI</h1>
        <p className="text-sm text-gray-400 mt-0.5">Управляйте AI-функциями, промтами и ограничениями</p>
      </div>

      <div className="flex gap-0 mb-6 border-b border-gray-200">
        {([['cases', 'Функции'], ['prompts', 'Промты'], ['usage', 'Использование']] as [Tab, string][]).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === id ? 'border-violet-600 text-violet-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'cases' && <CasesTab />}
      {tab === 'prompts' && <PromptsTab />}
      {tab === 'usage' && <UsageTab />}
    </div>
  )
}

// ── Cases Tab ─────────────────────────────────────────────────────────────────

function CasesTab() {
  const qc = useQueryClient()
  const { data: cases = [] } = useQuery({ queryKey: ['ai-cases'], queryFn: aiApi.listCases })

  const toggleMutation = useMutation({
    mutationFn: ({ key, enabled }: { key: string; enabled: boolean }) => aiApi.toggleCase(key, enabled),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-cases'] }),
  })

  const limitsMutation = useMutation({
    mutationFn: (v: { key: string; daily: number | null; monthly: number | null }) =>
      aiApi.updateLimits(v.key, v.daily, v.monthly),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-cases'] }),
  })

  return (
    <div className="space-y-4">
      {cases.map(c => <CaseCard key={c.promptKey} aiCase={c} onToggle={v => toggleMutation.mutate({ key: c.promptKey, enabled: v })} onLimits={(daily, monthly) => limitsMutation.mutate({ key: c.promptKey, daily, monthly })} />)}
    </div>
  )
}

function CaseCard({ aiCase, onToggle, onLimits }: {
  aiCase: AiCase
  onToggle: (v: boolean) => void
  onLimits: (daily: number | null, monthly: number | null) => void
}) {
  const [showLimits, setShowLimits] = useState(false)
  const [daily, setDaily] = useState(aiCase.dailyCallLimit ? String(aiCase.dailyCallLimit) : '')
  const [monthly, setMonthly] = useState(aiCase.monthlyTokenLimit ? String(aiCase.monthlyTokenLimit) : '')

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-900">{aiCase.label}</h3>
            <span className="text-[10px] font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{aiCase.promptKey}</span>
          </div>
          <p className="text-xs text-gray-500 mt-1">{aiCase.description}</p>
          {(aiCase.dailyCallLimit || aiCase.monthlyTokenLimit) && (
            <div className="flex gap-3 mt-2">
              {aiCase.dailyCallLimit && <span className="text-xs text-gray-400">Лимит/день: <b>{aiCase.dailyCallLimit}</b> вызовов</span>}
              {aiCase.monthlyTokenLimit && <span className="text-xs text-gray-400">Лимит/мес: <b>{aiCase.monthlyTokenLimit}</b> токенов</span>}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          <button
            onClick={() => setShowLimits(v => !v)}
            className="text-xs text-gray-400 hover:text-gray-600 underline"
          >
            Лимиты
          </button>
          <button
            onClick={() => onToggle(!aiCase.isEnabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              aiCase.isEnabled ? 'bg-violet-600' : 'bg-gray-200'
            }`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              aiCase.isEnabled ? 'translate-x-6' : 'translate-x-1'
            }`} />
          </button>
        </div>
      </div>

      {showLimits && (
        <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Макс. вызовов в день</label>
            <input
              type="number" min="1" value={daily}
              onChange={e => setDaily(e.target.value)}
              placeholder="∞"
              className="w-28 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Макс. токенов в месяц</label>
            <input
              type="number" min="1" value={monthly}
              onChange={e => setMonthly(e.target.value)}
              placeholder="∞"
              className="w-36 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                onLimits(daily ? parseInt(daily) : null, monthly ? parseInt(monthly) : null)
                setShowLimits(false)
              }}
              className="px-3 py-1.5 text-sm bg-violet-600 text-white rounded-lg hover:bg-violet-700"
            >
              Сохранить
            </button>
            <button onClick={() => { onLimits(null, null); setDaily(''); setMonthly('') }} className="px-3 py-1.5 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50">
              Снять лимиты
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Prompts Tab ───────────────────────────────────────────────────────────────

function PromptsTab() {
  const qc = useQueryClient()
  const { data: prompts = [] } = useQuery({ queryKey: ['ai-prompts'], queryFn: aiApi.listPrompts })

  const updateMutation = useMutation({
    mutationFn: ({ key, text }: { key: string; text: string }) => aiApi.updatePrompt(key, text),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-prompts'] }),
  })
  const resetMutation = useMutation({
    mutationFn: (key: string) => aiApi.resetPrompt(key),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-prompts'] }),
  })

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
        Редактирование промтов доступно на платном тарифе. Используйте переменные в двойных фигурных скобках.
      </p>
      {prompts.map(p => <PromptEditor key={p.promptKey} prompt={p} onSave={text => updateMutation.mutate({ key: p.promptKey, text })} onReset={() => resetMutation.mutate(p.promptKey)} />)}
    </div>
  )
}

function PromptEditor({ prompt, onSave, onReset }: { prompt: AiPromptInfo; onSave: (t: string) => void; onReset: () => void }) {
  const [text, setText] = useState(prompt.promptText)
  const [editing, setEditing] = useState(false)

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{prompt.label}</h3>
          {prompt.isCustom && <span className="text-xs text-violet-600 font-medium">Кастомный промт</span>}
        </div>
        <div className="flex gap-2">
          {prompt.isCustom && (
            <button onClick={() => { onReset(); setText(prompt.promptText); setEditing(false) }} className="text-xs text-gray-400 hover:text-red-500 underline">
              Сбросить
            </button>
          )}
          <button onClick={() => setEditing(v => !v)} className="text-xs text-violet-600 hover:underline">
            {editing ? 'Отмена' : 'Редактировать'}
          </button>
        </div>
      </div>

      {editing ? (
        <div className="space-y-3">
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            rows={8}
            className="w-full font-mono text-xs border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-y"
          />
          <div className="flex flex-wrap gap-1.5">
            {prompt.variables.map(v => (
              <button key={v} onClick={() => setText(t => t + v)} className="text-xs font-mono bg-violet-50 text-violet-700 border border-violet-200 rounded px-2 py-0.5 hover:bg-violet-100">
                {v}
              </button>
            ))}
          </div>
          <button
            onClick={() => { onSave(text); setEditing(false) }}
            className="px-4 py-1.5 text-sm bg-violet-600 text-white rounded-lg hover:bg-violet-700"
          >
            Сохранить промт
          </button>
        </div>
      ) : (
        <pre className="text-xs text-gray-600 bg-gray-50 rounded-lg p-3 whitespace-pre-wrap font-mono">{text}</pre>
      )}
    </div>
  )
}

// ── Usage Tab ─────────────────────────────────────────────────────────────────

function UsageTab() {
  const [days, setDays] = useState(30)
  const { data } = useQuery({ queryKey: ['ai-usage', days], queryFn: () => aiApi.getUsageLog(days) })

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-500">Период:</span>
        {[7, 30, 90].map(d => (
          <button key={d} onClick={() => setDays(d)} className={`px-3 py-1 rounded-lg text-sm border ${days === d ? 'bg-violet-600 text-white border-violet-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            {d} дн.
          </button>
        ))}
      </div>

      {data && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-400">Всего вызовов</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{data.totalCalls}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-400">Всего токенов</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{data.totalTokens.toLocaleString('ru')}</p>
            </div>
          </div>

          {/* By function */}
          {data.byKey.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">По функциям</h3>
              <div className="space-y-2">
                {data.byKey.map(k => (
                  <div key={k.promptKey} className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">{PROMPT_KEY_LABELS[k.promptKey as keyof typeof PROMPT_KEY_LABELS] ?? k.promptKey}</span>
                    <div className="flex gap-4 text-gray-400 text-xs">
                      <span>{k.calls} вызовов</span>
                      <span>{k.tokens.toLocaleString('ru')} токенов</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* By user */}
          {data.byUser.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">По пользователям</h3>
              <div className="divide-y divide-gray-100">
                {data.byUser.sort((a, b) => b.calls - a.calls).map(u => (
                  <div key={u.userId} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-gray-700">{u.fullName}</span>
                    <div className="flex gap-4 text-gray-400 text-xs">
                      <span>{u.calls} вызовов</span>
                      <span>{u.tokens.toLocaleString('ru')} токенов</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent log */}
          {data.recent.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Последние вызовы</h3>
              <div className="divide-y divide-gray-100">
                {data.recent.map(r => (
                  <div key={r.id} className="flex items-center justify-between py-2 text-xs">
                    <div className="flex items-center gap-3">
                      <span className="text-gray-400">{new Date(r.createdAt).toLocaleString('ru')}</span>
                      <span className="font-mono text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{r.promptKey}</span>
                      <span className="text-gray-600">{r.userName}</span>
                    </div>
                    <span className="text-gray-400">{r.tokensUsed ?? '—'} tok</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
