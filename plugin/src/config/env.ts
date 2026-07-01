import 'dotenv/config'
import { z } from 'zod'

const schema = z.object({
  PORT: z.coerce.number().default(3001),
  API_KEY: z.string().min(16),
  STORAGE_DIR: z.string().default('./storage'),
})

export const env = schema.parse(process.env)
