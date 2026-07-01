import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { authApi } from '@/api/auth'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

type State = 'loading' | 'success' | 'error'

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const [state, setState] = useState<State>('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!token) {
      setState('error')
      setMessage('Ссылка некорректна. Запросите новое письмо.')
      return
    }

    authApi.verifyEmail(token)
      .then(res => {
        setState('success')
        setMessage(res.message)
      })
      .catch(err => {
        setState('error')
        setMessage(err.response?.data?.error ?? 'Ссылка недействительна или истекла.')
      })
  }, [token])

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900">PM Lite</h1>
        </div>

        <Card className="text-center">
          {state === 'loading' && (
            <>
              <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
              <p className="text-gray-600">Подтверждаем e-mail...</p>
            </>
          )}

          {state === 'success' && (
            <>
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-gray-900 mb-1">E-mail подтверждён</h2>
              <p className="text-gray-500 mb-6">{message}</p>
              <Link to="/dashboard">
                <Button className="w-full">Перейти в систему</Button>
              </Link>
            </>
          )}

          {state === 'error' && (
            <>
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Не удалось подтвердить</h2>
              <p className="text-gray-500 mb-6">{message}</p>
              <Link to="/login">
                <Button variant="secondary" className="w-full">Войти</Button>
              </Link>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}
