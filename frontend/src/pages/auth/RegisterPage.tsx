import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useNavigate } from 'react-router-dom'
import { authApi } from '@/api/auth'
import { useAuthStore } from '@/store/authStore'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { FormField } from '@/components/ui/FormField'
import { Alert } from '@/components/ui/Alert'

type Tab = 'create' | 'join'

const createSchema = z.object({
  orgName: z.string().min(2, 'Минимум 2 символа'),
  fullName: z.string().min(2, 'Минимум 2 символа'),
  email: z.string().email('Некорректный e-mail'),
  password: z.string().min(8, 'Минимум 8 символов'),
})

const joinSchema = z.object({
  orgSlug: z.string().min(2, 'Введите код организации'),
  fullName: z.string().min(2, 'Минимум 2 символа'),
  email: z.string().email('Некорректный e-mail'),
  password: z.string().min(8, 'Минимум 8 символов'),
})

type CreateForm = z.infer<typeof createSchema>
type JoinForm = z.infer<typeof joinSchema>

function CreateOrgForm() {
  const navigate = useNavigate()
  const setAuth = useAuthStore(s => s.setAuth)
  const [error, setError] = useState('')

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
  })

  const onSubmit = async (data: CreateForm) => {
    try {
      setError('')
      const { token, user } = await authApi.register(data)
      setAuth(user, token)
      navigate('/dashboard')
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'Произошла ошибка')
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {error && <Alert>{error}</Alert>}

      <FormField label="Название организации" error={errors.orgName?.message} required>
        <Input {...register('orgName')} placeholder="ООО «Пример»" error={!!errors.orgName} />
      </FormField>

      <FormField label="Ваше имя" error={errors.fullName?.message} required>
        <Input {...register('fullName')} placeholder="Иван Иванов" error={!!errors.fullName} />
      </FormField>

      <FormField label="E-mail" error={errors.email?.message} required>
        <Input {...register('email')} type="email" placeholder="admin@example.com" error={!!errors.email} />
      </FormField>

      <FormField label="Пароль" error={errors.password?.message} required>
        <Input {...register('password')} type="password" placeholder="Минимум 8 символов" error={!!errors.password} />
      </FormField>

      <Button type="submit" className="w-full" loading={isSubmitting}>
        Создать организацию
      </Button>

      <p className="text-center text-xs text-gray-500">
        После регистрации вам придёт письмо для подтверждения e-mail.
      </p>
    </form>
  )
}

function JoinOrgForm() {
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<JoinForm>({
    resolver: zodResolver(joinSchema),
  })

  const onSubmit = async (data: JoinForm) => {
    try {
      setError('')
      await authApi.join(data)
      setDone(true)
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'Произошла ошибка')
    }
  }

  if (done) {
    return (
      <Alert variant="success">
        Запрос отправлен! Администратор организации получил уведомление и активирует ваш аккаунт.
      </Alert>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {error && <Alert>{error}</Alert>}

      <FormField label="Код организации" error={errors.orgSlug?.message} required>
        <Input
          {...register('orgSlug')}
          placeholder="my-company"
          error={!!errors.orgSlug}
        />
        <p className="text-xs text-gray-500 mt-1">
          Попросите администратора сообщить вам код (slug) организации.
        </p>
      </FormField>

      <FormField label="Ваше имя" error={errors.fullName?.message} required>
        <Input {...register('fullName')} placeholder="Иван Иванов" error={!!errors.fullName} />
      </FormField>

      <FormField label="E-mail" error={errors.email?.message} required>
        <Input {...register('email')} type="email" placeholder="ivan@example.com" error={!!errors.email} />
      </FormField>

      <FormField label="Пароль" error={errors.password?.message} required>
        <Input {...register('password')} type="password" placeholder="Минимум 8 символов" error={!!errors.password} />
      </FormField>

      <Button type="submit" className="w-full" loading={isSubmitting}>
        Отправить запрос
      </Button>
    </form>
  )
}

export function RegisterPage() {
  const [tab, setTab] = useState<Tab>('create')

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900">PM Lite</h1>
          <p className="mt-1 text-gray-500">Управление проектами без лишнего</p>
        </div>

        <Card>
          <div className="mb-6">
            <div className="flex rounded-lg border border-gray-200 p-1 bg-gray-50">
              <button
                type="button"
                onClick={() => setTab('create')}
                className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                  tab === 'create'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Создать организацию
              </button>
              <button
                type="button"
                onClick={() => setTab('join')}
                className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                  tab === 'join'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Вступить в организацию
              </button>
            </div>
          </div>

          {tab === 'create' ? <CreateOrgForm /> : <JoinOrgForm />}
        </Card>

        <p className="mt-6 text-center text-sm text-gray-500">
          Уже есть аккаунт?{' '}
          <Link to="/login" className="text-blue-600 hover:underline font-medium">
            Войти
          </Link>
        </p>
      </div>
    </div>
  )
}
