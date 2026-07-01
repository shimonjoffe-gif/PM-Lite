import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { authApi } from '@/api/auth'
import { useAuthStore } from '@/store/authStore'
import { InvitationInfo } from '@/types/auth'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { FormField } from '@/components/ui/FormField'
import { Alert } from '@/components/ui/Alert'

const schema = z.object({
  fullName: z.string().min(2, 'Минимум 2 символа'),
  password: z.string().min(8, 'Минимум 8 символов'),
  passwordConfirm: z.string(),
}).refine(d => d.password === d.passwordConfirm, {
  message: 'Пароли не совпадают',
  path: ['passwordConfirm'],
})
type Form = z.infer<typeof schema>


export function AcceptInvitationPage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const setAuth = useAuthStore(s => s.setAuth)

  const [info, setInfo] = useState<InvitationInfo | null>(null)
  const [loadError, setLoadError] = useState('')
  const [submitError, setSubmitError] = useState('')

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
  })

  useEffect(() => {
    if (!token) return
    authApi.getInvitation(token)
      .then(setInfo)
      .catch(err => setLoadError(err.response?.data?.error ?? 'Приглашение не найдено или истекло'))
  }, [token])

  const onSubmit = async (data: Form) => {
    if (!token) return
    try {
      setSubmitError('')
      const { token: jwt, user } = await authApi.acceptInvitation(token, {
        fullName: data.fullName,
        password: data.password,
      })
      setAuth(user, jwt)
      navigate('/dashboard')
    } catch (e: any) {
      setSubmitError(e.response?.data?.error ?? 'Произошла ошибка')
    }
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
            <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Приглашение недействительно</h2>
          <p className="text-gray-500">{loadError}</p>
        </Card>
      </div>
    )
  }

  if (!info) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900">PM Lite</h1>
        </div>

        <Card>
          <div className="mb-6 rounded-lg bg-blue-50 p-4 border border-blue-100">
            <p className="text-sm text-blue-800">
              <strong>{info.inviterName}</strong> приглашает вас в организацию{' '}
              <strong>{info.orgName}</strong> с ролью{' '}
              <strong>{info.roleName ?? 'участник'}</strong>.
            </p>
            <p className="mt-1 text-xs text-blue-600">
              Приглашение для: {info.email}
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {submitError && <Alert>{submitError}</Alert>}

            <FormField label="Ваше имя" error={errors.fullName?.message} required>
              <Input {...register('fullName')} placeholder="Иван Иванов" error={!!errors.fullName} />
            </FormField>

            <FormField label="Пароль" error={errors.password?.message} required>
              <Input
                {...register('password')}
                type="password"
                placeholder="Минимум 8 символов"
                error={!!errors.password}
              />
            </FormField>

            <FormField label="Повторите пароль" error={errors.passwordConfirm?.message} required>
              <Input
                {...register('passwordConfirm')}
                type="password"
                placeholder="Повторите пароль"
                error={!!errors.passwordConfirm}
              />
            </FormField>

            <Button type="submit" className="w-full" loading={isSubmitting}>
              Присоединиться к {info.orgName}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  )
}
