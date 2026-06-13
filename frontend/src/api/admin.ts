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
