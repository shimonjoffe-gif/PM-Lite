import { z } from 'zod'

export const UserListItemSchema = z.object({
  id: z.string(),
  email: z.string(),
  fullName: z.string(),
  role: z.string(),
  isActive: z.boolean(),
  emailVerifiedAt: z.string().nullable(),
  createdAt: z.string(),
})

export const UsersResponseSchema = z.object({
  users: z.array(UserListItemSchema),
  org: z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    planType: z.string(),
  }),
})
