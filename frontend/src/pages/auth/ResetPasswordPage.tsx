import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { authApi } from '@/api/auth'
import { useAuthStore } from '@/store/authStore'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { FormField } from '@/components/ui/FormField'
import { Alert } from '@/components/ui/Alert'

const schema = z
  .object({
    password: z.string().min(8, 'Минимум 8 символов'),
    confirm: z.string(),
  })
  .refine(d => d.password === d.confirm, {
    message: 'Пароли не совпадают',
    path: ['confirm'],
  })
type Form = z.infer<typeof schema>

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const navigate = useNavigate()
  const setAuth = useAuthStore(s => s.setAuth)
  const [error, setError] = useState('')

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: Form) => {
    try {
      setError('')
      const { token: jwt, user } = await authApi.resetPassword({ token, password: data.password })
      setAuth(user, jwt)
      navigate('/projects')
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'Ссылка недействительна или истекла. Запросите новую.')
    }
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <Card>
            <p className="text-gray-600">Неверная ссылка для сброса пароля.</p>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900">PM Lite</h1>
          <p className="mt-1 text-gray-500">Создание нового пароля</p>
        </div>

        <Card>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {error && <Alert>{error}</Alert>}

            <FormField label="Новый пароль" error={errors.password?.message} required>
              <Input
                {...register('password')}
                type="password"
                placeholder="Минимум 8 символов"
                autoComplete="new-password"
                error={!!errors.password}
              />
            </FormField>

            <FormField label="Повторите пароль" error={errors.confirm?.message} required>
              <Input
                {...register('confirm')}
                type="password"
                placeholder="Повторите пароль"
                autoComplete="new-password"
                error={!!errors.confirm}
              />
            </FormField>

            <Button type="submit" className="w-full" loading={isSubmitting}>
              Сохранить пароль и войти
            </Button>
          </form>
        </Card>
      </div>
    </div>
  )
}
