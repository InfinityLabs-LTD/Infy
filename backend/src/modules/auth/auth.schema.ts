import { z } from 'zod'

export const usernameSchema = z
  .string()
  .min(3)
  .max(32)
  .regex(/^[a-z0-9_]+$/, 'Username may only contain lowercase letters, numbers and underscores')

export const registerSchema = z.object({
  username: usernameSchema,
  nickname: z.string().min(1).max(64).trim(),
  password: z.string().min(8).max(128),
  email: z.string().email().optional(),
  birthdate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

export const loginSchema = z.object({
  username: z.string(),
  password: z.string(),
})

export const refreshSchema = z.object({
  refreshToken: z.string(),
})

export const logoutAllSchema = z.object({
  exceptCurrent: z.boolean().default(true),
})

export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type RefreshInput = z.infer<typeof refreshSchema>
export type LogoutAllInput = z.infer<typeof logoutAllSchema>
