import { api } from './client'

export interface AdminUser {
  id: string
  username: string
  nickname: string
  email: string | null
  role: string
  avatarUrl: string | null
  createdAt: string
  lastSeenAt: string
  emailVerifiedAt: string | null
}

export interface AdminUserDetail extends AdminUser {
  birthdate: string | null
  _count: { messages: number; chatMemberships: number }
}

export interface AdminMessage {
  id: string
  chatId: string
  content: string | null
  type: string
  createdAt: string
  sender: { id: string; username: string; nickname: string; avatarUrl: string | null }
  chat: { id: string; type: string }
  attachments: Array<{ id: string; mimeType: string; sizeBytes: number | null }>
}

export interface Container {
  id: string
  names: string[]
  image: string
  status: string
  state: string
  created: number
}

export interface Paginated<T> {
  items: T[]
  total: number
  page: number
  pages: number
}

export interface AdminStats {
  totalUsers: number
  onlineNow: number
  newUsers7d: number
  totalMessages: number
  messages24h: number
  totalChats: number
  activeSessions: number
  byDay: Array<{ date: string; messages: number; users: number }>
}

export interface AdminAnalytics {
  dauToday: number
  mau30: number
  byDay: Array<{ date: string; dau: number; registrations: number }>
  cohorts: Array<{ week: string; size: number; retention: number[] }>
}

export type SanctionType = 'WARN' | 'MUTE' | 'BAN'

export interface SanctionUser {
  id: string
  username: string
  nickname: string
  avatarUrl: string | null
}

export interface Sanction {
  id: string
  type: SanctionType
  reason: string
  createdAt: string
  expiresAt: string | null
  revokedAt: string | null
  user: SanctionUser
  issuedBy: SanctionUser
}

export interface SanctionsResponse {
  sanctions: Sanction[]
  activeByType: Record<SanctionType, number>
}

export const adminApi = {
  // Users
  listUsers: (params?: { page?: number; limit?: number; search?: string }) =>
    api.get<{ data: { users: AdminUser[]; total: number; page: number; pages: number } }>(
      '/admin/users', { params }),

  getUser: (id: string) =>
    api.get<{ data: AdminUserDetail }>(`/admin/users/${id}`),

  updateUser: (id: string, body: { nickname?: string; role?: 'USER' | 'ADMIN'; email?: string | null }) =>
    api.patch<{ data: AdminUser }>(`/admin/users/${id}`, body),

  getUserMessages: (id: string, params?: { page?: number; limit?: number }) =>
    api.get<{ data: { messages: AdminMessage[]; total: number; page: number; pages: number } }>(
      `/admin/users/${id}/messages`, { params }),

  // Stats
  getStats: () =>
    api.get<{ data: AdminStats }>('/admin/stats'),

  getAnalytics: () =>
    api.get<{ data: AdminAnalytics }>('/admin/stats/analytics'),

  // Moderation (Infy Shield)
  listSanctions: (status: 'active' | 'all' = 'active') =>
    api.get<{ data: SanctionsResponse }>('/admin/moderation/sanctions', { params: { status } }),

  createSanction: (body: { userId: string; type: SanctionType; reason: string; durationHours?: number | null }) =>
    api.post<{ data: Sanction }>('/admin/moderation/sanctions', body),

  revokeSanction: (id: string) =>
    api.delete<{ data: Sanction }>(`/admin/moderation/sanctions/${id}`),

  // Containers
  listContainers: () =>
    api.get<{ data: Container[] }>('/admin/containers'),

  restartContainer: (id: string) =>
    api.post(`/admin/containers/${id}/restart`),

  // Logs SSE — returns EventSource URL (constructed by caller)
  logsUrl: (id: string, tail = 200) => {
    const base = import.meta.env.VITE_API_URL ?? '/api'
    return `${base}/admin/containers/${id}/logs?tail=${tail}`
  },
}
