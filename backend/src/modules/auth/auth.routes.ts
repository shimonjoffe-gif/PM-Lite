import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import {
  RegisterSchema,
  LoginSchema,
  VerifyEmailSchema,
  ResendVerificationSchema,
  AuthResponseSchema,
  JoinOrgSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
} from './auth.schemas'
import {
  registerOrganization,
  verifyEmail,
  resendVerification,
  login,
  joinOrganization,
  forgotPassword,
  resetPassword,
  formatUser,
} from './auth.service'
import { z } from 'zod'

export const authRoutes: FastifyPluginAsyncZod = async (app) => {
  // POST /api/auth/register — регистрация новой организации
  app.post(
    '/register',
    {
      schema: {
        body: RegisterSchema,
        response: { 201: AuthResponseSchema },
      },
    },
    async (request, reply) => {
      try {
        const { token, user } = await registerOrganization(app.prisma, app, request.body)
        return reply.status(201).send({ token, user: formatUser(user) })
      } catch (err: any) {
        return reply.status(err.statusCode ?? 500).send({ error: err.message })
      }
    },
  )

  // POST /api/auth/join — самостоятельная регистрация в существующей организации
  app.post(
    '/join',
    {
      schema: {
        body: JoinOrgSchema,
        response: { 202: z.object({ message: z.string() }) },
      },
    },
    async (request, reply) => {
      try {
        const result = await joinOrganization(app.prisma, request.body)
        return reply.status(202).send(result)
      } catch (err: any) {
        return reply.status(err.statusCode ?? 500).send({ error: err.message })
      }
    },
  )

  // POST /api/auth/login
  app.post(
    '/login',
    {
      schema: {
        body: LoginSchema,
        response: { 200: AuthResponseSchema },
      },
    },
    async (request, reply) => {
      try {
        const { token, user } = await login(app.prisma, app, request.body)
        return reply.send({ token, user })
      } catch (err: any) {
        return reply.status(err.statusCode ?? 500).send({ error: err.message })
      }
    },
  )

  // GET /api/auth/verify-email?token=...
  app.get(
    '/verify-email',
    {
      schema: {
        querystring: VerifyEmailSchema,
        response: { 200: z.object({ message: z.string() }) },
      },
    },
    async (request, reply) => {
      try {
        const result = await verifyEmail(app.prisma, request.query.token)
        return reply.send(result)
      } catch (err: any) {
        return reply.status(err.statusCode ?? 500).send({ error: err.message })
      }
    },
  )

  // POST /api/auth/resend-verification
  app.post(
    '/resend-verification',
    {
      schema: {
        body: ResendVerificationSchema,
        response: { 200: z.object({ message: z.string() }) },
      },
    },
    async (request, reply) => {
      await resendVerification(app.prisma, request.body.email)
      return reply.send({ message: 'Если e-mail существует, письмо отправлено' })
    },
  )

  // POST /api/auth/forgot-password
  app.post(
    '/forgot-password',
    {
      schema: {
        body: ForgotPasswordSchema,
        response: { 200: z.object({ message: z.string() }) },
      },
    },
    async (request, reply) => {
      await forgotPassword(app.prisma, request.body.email)
      return reply.send({ message: 'Если e-mail зарегистрирован, ссылка отправлена' })
    },
  )

  // POST /api/auth/reset-password
  app.post(
    '/reset-password',
    {
      schema: {
        body: ResetPasswordSchema,
        response: { 200: AuthResponseSchema },
      },
    },
    async (request, reply) => {
      try {
        const { token, user } = await resetPassword(app.prisma, app, request.body)
        return reply.send({ token, user })
      } catch (err: any) {
        return reply.status(err.statusCode ?? 500).send({ error: err.message })
      }
    },
  )
}
