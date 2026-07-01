import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { submitFeedback } from '@/api/analytics'
import { Button } from '@/components/ui/Button'

const schema = z.object({
  type: z.enum(['feedback', 'bug']),
  text: z.string().min(1, 'Введите текст').max(2000),
})

type FormData = z.infer<typeof schema>

export function FeedbackButton() {
  const [open, setOpen] = useState(false)
  const [success, setSuccess] = useState(false)
  const { pathname } = useLocation()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { type: 'feedback', text: '' },
  })

  function handleOpen() {
    reset({ type: 'feedback', text: '' })
    setSuccess(false)
    setOpen(true)
  }

  function handleClose() {
    setOpen(false)
  }

  async function onSubmit(data: FormData) {
    await submitFeedback({ ...data, screenContext: pathname })
    setSuccess(true)
  }

  return (
    <>
      <button
        onClick={handleOpen}
        className="text-sm text-gray-500 hover:text-gray-900 transition-colors px-2 py-1 rounded hover:bg-gray-100"
      >
        Обратная связь
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="w-full max-w-md bg-white rounded-xl shadow-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-900">Обратная связь</h2>
              <button
                onClick={handleClose}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="Закрыть"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {success ? (
              <div className="text-center py-6">
                <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                  <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-gray-900">Спасибо за обратную связь!</p>
                <p className="text-sm text-gray-500 mt-1">Мы обязательно рассмотрим ваше сообщение.</p>
                <Button className="mt-4" size="sm" onClick={handleClose}>Закрыть</Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Тип</label>
                  <div className="flex gap-3">
                    <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                      <input type="radio" value="feedback" {...register('type')} className="accent-blue-600" />
                      Отзыв
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                      <input type="radio" value="bug" {...register('type')} className="accent-blue-600" />
                      Баг-репорт
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Сообщение</label>
                  <textarea
                    {...register('text')}
                    rows={5}
                    placeholder="Опишите проблему или поделитесь мыслями..."
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  />
                  {errors.text && (
                    <p className="mt-1 text-xs text-red-600">{errors.text.message}</p>
                  )}
                </div>

                <p className="text-xs text-gray-400">
                  Экран: <span className="font-mono">{pathname}</span>
                </p>

                <div className="flex justify-end gap-2 pt-1">
                  <Button type="button" variant="ghost" size="sm" onClick={handleClose}>
                    Отмена
                  </Button>
                  <Button type="submit" size="sm" disabled={isSubmitting}>
                    {isSubmitting ? 'Отправка...' : 'Отправить'}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}
