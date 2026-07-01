import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link } from 'react-router-dom'
import { authApi } from '@/api/auth'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { FormField } from '@/components/ui/FormField'
import { Alert } from '@/components/ui/Alert'

const schema = z.object({
  email: z.string().email('Некорректный e-mail'),
})
type Form = z.infer<typeof schema>

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: Form) => {
    try {
      setError('')
      await authApi.forgotPassword(data.email)
      setSent(true)
    } catch {
      setError('Не удалось отправить письмо. Попробуйте позже.')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900">PM Lite</h1>
          <p className="mt-1 text-gray-500">Восстановление пароля</p>
        </div>

        <Card>
          {sent ? (
            <div className="text-center space-y-4">
              <div className="text-green-600 text-4xl">✓</div>
              <p className="text-gray-700 font-medium">Письмо отправлено</p>
              <p className="text-sm text-gray-500">
                Если указанный e-mail зарегистрирован, вы получите ссылку для сброса пароля.
                Ссылка действительна 1 час.
              </p>
              <Link to="/login" className="block text-blue-600 hover:underline text-sm font-medium">
                Вернуться на страницу входа
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {error && <Alert>{error}</Alert>}
              <p className="text-sm text-gray-600">
                Введите e-mail, указанный при регистрации. Мы пришлём ссылку для создания нового пароля.
              </p>
              <FormField label="E-mail" error={errors.email?.message} required>
                <Input
                  {...register('email')}
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  error={!!errors.email}
                />
              </FormField>
              <Button type="submit" className="w-full" loading={isSubmitting}>
                Отправить ссылку
              </Button>
            </form>
          )}
        </Card>

        {!sent && (
          <p className="mt-6 text-center text-sm text-gray-500">
            <Link to="/login" className="text-blue-600 hover:underline font-medium">
              Вернуться на страницу входа
            </Link>
          </p>
        )}
      </div>
    </div>
  )
}
