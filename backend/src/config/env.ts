import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL: z.string(),
  JWT_SECRET: z.string().min(32),
  PORT: z.coerce.number().default(3000),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().default(1025),
  SMTP_SECURE: z.string().transform(v => v === 'true').default('false'),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().default('PM Lite <noreply@pm-lite.app>'),
  APP_URL: z.string().default('http://localhost:5173'),
  ANTHROPIC_API_KEY: z.string().optional(),
  UPLOADS_DIR: z.string().default('./uploads'),
})

export const env = envSchema.parse(process.env)
