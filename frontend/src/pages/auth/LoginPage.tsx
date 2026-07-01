import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { authApi } from '@/api/auth'
import { useAuthStore } from '@/store/authStore'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { FormField } from '@/components/ui/FormField'
import { Alert } from '@/components/ui/Alert'

const schema = z.object({
  email: z.string().email('Некорректный e-mail'),
  password: z.string().min(1, 'Введите пароль'),
})
type Form = z.infer<typeof schema>

export function LoginPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore(s => s.setAuth)
  const qc = useQueryClient()
  const [error, setError] = useState('')

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: Form) => {
    try {
      setError('')
      const { token, user } = await authApi.login(data)
      qc.clear()   // сбросить кэш старой сессии перед установкой нового токена
      setAuth(user, token)
      navigate('/projects')
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'Неверный e-mail или пароль')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900">PM Lite</h1>
          <p className="mt-1 text-gray-500">Войдите в свой аккаунт</p>
        </div>

        <Card>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {error && <Alert>{error}</Alert>}

            <FormField label="E-mail" error={errors.email?.message} required>
              <Input
                {...register('email')}
                type="email"
                placeholder="admin@example.com"
                autoComplete="email"
                error={!!errors.email}
              />
            </FormField>

            <FormField
              label="Пароль"
              error={errors.password?.message}
              required
              labelRight={
                <Link to="/forgot-password" className="text-xs text-blue-600 hover:underline">
                  Забыли пароль?
                </Link>
              }
            >
              <Input
                {...register('password')}
                type="password"
                placeholder="••••••••"
                autoComplete="current-password"
                error={!!errors.password}
              />
            </FormField>

            <Button type="submit" className="w-full" loading={isSubmitting}>
              Войти
            </Button>
          </form>
        </Card>

        <p className="mt-6 text-center text-sm text-gray-500">
          Нет аккаунта?{' '}
          <Link to="/register" className="text-blue-600 hover:underline font-medium">
            Зарегистрироваться
          </Link>
        </p>
      </div>
    </div>
  )
}
