import { api } from './client'

export interface Badge {
  slug: string
  label: string
  color: string          // RGB-триплет "R,G,B"
  icon: string
  description: string | null
}

export interface User {
  id: string
  username: string
  nickname: string
  avatarUrl: string | null
  coverUrl: string | null
  bio: string | null
  role: string
  email: string | null
  emailVerified: boolean
  birthdate: string | null
  timezone: string | null
  aiSuggestReplies: boolean
  notifyPopup: boolean
  notifySound: boolean
  notifyVibrate: boolean
  interests: string[]
  badges: Badge[]
  createdAt: string
  lastSeenAt: string
}

// Публичный профиль другого пользователя (личные данные скрыты).
export interface PublicProfile {
  id: string
  username: string
  nickname: string
  avatarUrl: string | null
  coverUrl: string | null
  bio: string | null
  role: string
  interests: string[]
  badges: Badge[]
  createdAt: string
  lastSeenAt: string
}

export interface ProfileStats {
  contacts: number
  chats: number
  groups: number
  devices: number
}

export interface AuthResponse {
  user: User
  accessToken: string
  refreshToken: string
  sessionId: string
}

export interface Session {
  id: string
  deviceName: string | null
  userAgent: string | null
  ip: string | null
  createdAt: string
  lastActiveAt: string
  isCurrent: boolean
}

export const authApi = {
  register: (body: {
    username: string
    nickname: string
    password: string
    email?: string
    birthdate?: string
  }) => api.post<{ data: AuthResponse }>('/auth/register', body),

  login: (body: { username: string; password: string }) =>
    api.post<{ data: AuthResponse }>('/auth/login', body),

  logout: () => api.post('/auth/logout'),

  // Самостоятельная смена пароля по ссылке от админа
  validateResetToken: (token: string) =>
    api.get<{ data: { valid: boolean; user: { username: string; nickname: string } | null } }>(
      `/auth/reset-password/${encodeURIComponent(token)}`),

  resetPassword: (body: { token: string; password: string }) =>
    api.post('/auth/reset-password', body),

  // Смена пароля из настроек (нужен текущий пароль). Текущая сессия сохраняется,
  // остальные устройства разлогиниваются.
  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    api.post('/auth/change-password', body),
}

export interface UserSearchResult {
  id: string
  username: string
  nickname: string
  avatarUrl: string | null
}

export const profileApi = {
  getMe: () => api.get<{ data: User }>('/profile/me'),

  getStats: () => api.get<{ data: ProfileStats }>('/profile/me/stats'),

  getByUsername: (username: string) =>
    api.get<{ data: PublicProfile }>(`/profile/${username}`),

  searchUsers: (q: string) =>
    api.get<{ data: UserSearchResult[] }>('/profile/search', { params: { q } }),

  updateMe: (body: { nickname?: string; birthdate?: string | null; bio?: string | null; interests?: string[]; timezone?: string | null; aiSuggestReplies?: boolean; notifyPopup?: boolean; notifySound?: boolean; notifyVibrate?: boolean }) =>
    api.patch<{ data: User }>('/profile/me', body),

  // Доступна ли отправка писем на сервере (настроен ли smtp.bz).
  emailStatus: () => api.get<{ data: { mailEnabled: boolean } }>('/profile/me/email-status'),

  // Привязка почты: запросить код, затем подтвердить.
  requestEmail: (email: string) =>
    api.post<{ data: { email: string } }>('/profile/me/email', { email }),

  confirmEmail: (code: string) =>
    api.post<{ data: User }>('/profile/me/email/confirm', { code }),

  // Смена username: нужна подтверждённая почта. Ответ 204 — сервер отозвал
  // все сессии, клиент должен перелогиниться.
  changeUsername: (username: string) =>
    api.post('/profile/me/username', { username }),

  uploadAvatar: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api.post<{ data: { avatarUrl: string } }>('/profile/me/avatar', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  uploadCover: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api.post<{ data: { coverUrl: string } }>('/profile/me/cover', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
}

export const sessionsApi = {
  list: () => api.get<{ data: Session[] }>('/sessions'),

  revoke: (id: string) => api.delete(`/sessions/${id}`),

  logoutAll: (exceptCurrent = true) =>
    api.post<{ data: { revokedCount: number } }>('/sessions/logout-all', { exceptCurrent }),
}
