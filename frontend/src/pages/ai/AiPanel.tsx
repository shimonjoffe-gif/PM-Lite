import { useEffect } from 'react'
import { useAiPanel } from '@/store/aiPanel'
import { aiApi } from '@/api/ai'
import { PROMPT_KEY_LABELS } from '@/types/ai'

export function AiPanel() {
  const { isOpen, mode, result, isLoading, close, setResult, setLoading } = useAiPanel()

  useEffect(() => {
    if (!isOpen || mode.type === 'idle') return
    setLoading(true)
    const run = async () => {
      try {
        let text = ''
        if (mode.type === 'project_status') {
          text = await aiApi.generateProjectStatus(mode.projectId)
        } else if (mode.type === 'task_summary') {
          text = await aiApi.generateTaskSummary(mode.taskId)
        }
        setResult(text)
      } catch (e: any) {
        setResult(`Ошибка: ${e.response?.data?.error ?? e.message}`)
      }
    }
    run()
  }, [isOpen, mode])

  const title =
    mode.type === 'project_status'
      ? `${PROMPT_KEY_LABELS.project_status}: ${mode.projectName}`
      : mode.type === 'task_summary'
      ? `${PROMPT_KEY_LABELS.task_summary}: ${mode.taskTitle}`
      : 'AI-ассистент'

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/10"
          onClick={close}
        />
      )}

      {/* Panel */}
      <aside
        className={`fixed right-0 top-0 z-50 h-full w-96 bg-white border-l border-gray-200 shadow-2xl flex flex-col transition-transform duration-300 ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100 gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-violet-100 flex items-center justify-center">
              <svg className="w-4 h-4 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-gray-900 truncate">{title}</p>
          </div>
          <button
            onClick={close}
            className="flex-shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-40 gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-600 border-t-transparent" />
              <p className="text-sm text-gray-400">Генерирую ответ...</p>
            </div>
          ) : result ? (
            <div className="space-y-4">
              <div className="bg-violet-50 rounded-xl p-4 text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
                {result}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => navigator.clipboard.writeText(result)}
                  className="flex items-center gap-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Скопировать
                </button>
                <button
                  onClick={() => {
                    setResult(null)
                    setLoading(true)
                    const run = async () => {
                      try {
                        let text = ''
                        if (mode.type === 'project_status') text = await aiApi.generateProjectStatus(mode.projectId)
                        else if (mode.type === 'task_summary') text = await aiApi.generateTaskSummary(mode.taskId)
                        setResult(text)
                      } catch (e: any) {
                        setResult(`Ошибка: ${e.response?.data?.error ?? e.message}`)
                      }
                    }
                    run()
                  }}
                  className="flex items-center gap-1.5 text-xs text-violet-600 border border-violet-200 rounded-lg px-3 py-1.5 hover:bg-violet-50"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Сгенерировать снова
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-40 gap-2 text-gray-400">
              <svg className="h-10 w-10 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              <p className="text-sm">Открой из карточки проекта или задачи</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100">
          <p className="text-[10px] text-gray-400 text-center">Powered by Claude · Результат носит рекомендательный характер</p>
        </div>
      </aside>
    </>
  )
}

// Global AI button for header/topbar
export function AiTriggerButton() {
  const { open } = useAiPanel()
  return (
    <button
      onClick={() => open({ type: 'idle' })}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 transition-colors"
      title="AI-ассистент"
    >
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
      AI
    </button>
  )
}
