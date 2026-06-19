import { api } from './client'
import { apiBaseUrl } from '@/lib/origin'

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

// Бейдж, назначенный пользователю (вид для админ-карточки).
export interface AdminUserBadge {
  badgeId: string
  slug: string
  label: string
  color: string
  icon: string
  description: string | null
}

export interface AdminUserDetail extends AdminUser {
  birthdate: string | null
  _count: { messages: number; chatMemberships: number }
  badges: AdminUserBadge[]
}

// Запись каталога бейджей.
export interface AdminBadge {
  id: string
  slug: string
  label: string
  color: string
  icon: string
  description: string | null
  createdAt: string
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

// Полное вложение для админ-просмотра переписки (рендер любого контента).
export interface AdminAttachment {
  id: string
  storageKey: string
  thumbnailKey: string | null
  mimeType: string
  sizeBytes: number | null
  width: number | null
  height: number | null
  durationMs: number | null
  waveform: number[] | null
}

export interface AdminThreadMessage {
  id: string
  chatId: string
  content: string | null
  type: string
  createdAt: string
  editedAt: string | null
  sender: { id: string; username: string; nickname: string; avatarUrl: string | null }
  attachments: AdminAttachment[]
  replyTo: { id: string; content: string | null; type: string; sender: { id: string; nickname: string } } | null
}

export interface AdminChatParticipant {
  id: string
  username: string
  nickname: string
  avatarUrl: string | null
}

export interface AdminChatSummary {
  id: string
  type: string
  messageCount: number
  participants: AdminChatParticipant[]
  lastMessage: { id: string; content: string | null; type: string; createdAt: string; senderId: string } | null
}

export interface AdminThread {
  chat: { id: string; type: string; participants: AdminChatParticipant[] }
  messages: AdminThreadMessage[]
  nextCursor: string | null
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

export type ReportCategory =
  | 'SPAM' | 'HARASSMENT' | 'HATE' | 'VIOLENCE'
  | 'SEXUAL' | 'SCAM' | 'ILLEGAL' | 'OTHER'

export type ReportStatus = 'PENDING' | 'REVIEWING' | 'RESOLVED' | 'DISMISSED'

export interface ReportUser {
  id: string
  username: string
  nickname: string
  avatarUrl: string | null
}

export interface Report {
  id: string
  category: ReportCategory
  description: string
  chatId: string | null
  messageId: string | null
  evidenceKeys: string[]
  status: ReportStatus
  createdAt: string
  reviewedAt: string | null
  resolution: string | null
  reporter: ReportUser | null
  target: ReportUser | null
  reviewedBy: ReportUser | null
}

export interface ReportsResponse {
  reports: Report[]
  counts: { pending: number; reviewing: number }
}

export type AiProvider = 'ANTHROPIC' | 'OPENAI'

export interface AiSettings {
  enabled: boolean
  provider: AiProvider
  webSearch: boolean
  anthropic: { model: string; hasKey: boolean; baseUrl: string }
  openai: { model: string; hasKey: boolean; baseUrl: string }
}

export interface AiSettingsUpdate {
  enabled?: boolean
  provider?: AiProvider
  webSearch?: boolean
  anthropicModel?: string
  anthropicKey?: string
  anthropicBaseUrl?: string
  openaiModel?: string
  openaiKey?: string
  openaiBaseUrl?: string
}

export interface MailSettings {
  enabled: boolean
  host: string
  port: number
  secure: boolean
  user: string
  hasPass: boolean
  from: string
  fromName: string
}

export interface MailSettingsUpdate {
  enabled?: boolean
  host?: string
  port?: number
  secure?: boolean
  user?: string
  pass?: string
  from?: string
  fromName?: string
}

export const adminApi = {
  // AI settings
  getAiSettings: () =>
    api.get<{ data: AiSettings }>('/admin/ai/settings'),

  updateAiSettings: (body: AiSettingsUpdate) =>
    api.patch<{ data: AiSettings }>('/admin/ai/settings', body),

  // Mail (SMTP) settings
  getMailSettings: () =>
    api.get<{ data: MailSettings }>('/admin/mail/settings'),

  updateMailSettings: (body: MailSettingsUpdate) =>
    api.patch<{ data: MailSettings }>('/admin/mail/settings', body),

  sendTestEmail: (to: string) =>
    api.post<{ data: { ok: true } }>('/admin/mail/test', { to }),

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

  // Диалоги пользователя + чтение переписки по конкретному чату
  getUserChats: (id: string) =>
    api.get<{ data: { chats: AdminChatSummary[] } }>(`/admin/users/${id}/chats`),

  getChatThread: (chatId: string, params?: { cursor?: string; limit?: number }) =>
    api.get<{ data: AdminThread }>(`/admin/users/chats/${chatId}/messages`, { params }),

  // Управление паролем
  resetUserPassword: (id: string) =>
    api.post<{ data: { password: string } }>(`/admin/users/${id}/password`),

  createPasswordResetLink: (id: string) =>
    api.post<{ data: { url: string; token: string; expiresInHours: number } }>(
      `/admin/users/${id}/password-reset-link`),

  // Полное удаление аккаунта
  deleteUser: (id: string) =>
    api.delete(`/admin/users/${id}`),

  // Бейджи: каталог + выдача/снятие пользователю
  listBadges: () =>
    api.get<{ data: AdminBadge[] }>('/admin/badges'),

  createBadge: (body: { slug: string; label: string; color: string; icon: string; description?: string | null }) =>
    api.post<{ data: AdminBadge }>('/admin/badges', body),

  updateBadge: (id: string, body: { label?: string; color?: string; icon?: string; description?: string | null }) =>
    api.patch<{ data: AdminBadge }>(`/admin/badges/${id}`, body),

  deleteBadge: (id: string) =>
    api.delete(`/admin/badges/${id}`),

  grantBadge: (userId: string, badgeId: string) =>
    api.put(`/admin/users/${userId}/badges/${badgeId}`),

  revokeBadge: (userId: string, badgeId: string) =>
    api.delete(`/admin/users/${userId}/badges/${badgeId}`),

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

  // Reports (жалобы пользователей)
  listReports: (status: ReportStatus | 'all' = 'PENDING') =>
    api.get<{ data: ReportsResponse }>('/admin/moderation/reports', { params: { status } }),

  updateReport: (id: string, body: { status: ReportStatus; resolution?: string }) =>
    api.patch<{ data: Report }>(`/admin/moderation/reports/${id}`, body),

  // Containers
  listContainers: () =>
    api.get<{ data: Container[] }>('/admin/containers'),

  restartContainer: (id: string) =>
    api.post(`/admin/containers/${id}/restart`),

  // Logs SSE — returns EventSource URL (constructed by caller)
  logsUrl: (id: string, tail = 200) => {
    const base = apiBaseUrl()
    return `${base}/admin/containers/${id}/logs?tail=${tail}`
  },

  // ── Backups (резервные копии БД) ───────────────────────────
  getBackups: () =>
    api.get<{ data: { backups: BackupInfo[]; schedule: BackupSchedule } }>('/admin/backups'),

  createBackup: () =>
    api.post<{ data: BackupInfo }>('/admin/backups'),

  deleteBackup: (name: string) =>
    api.delete(`/admin/backups/${encodeURIComponent(name)}`),

  getBackupLink: (name: string) =>
    api.get<{ data: { url: string } }>(`/admin/backups/${encodeURIComponent(name)}/link`),

  restoreBackup: (name: string) =>
    api.post<{ data: { ok: true } }>(`/admin/backups/${encodeURIComponent(name)}/restore`, { confirm: true }),

  uploadBackup: (file: File, onProgress?: (pct: number) => void) => {
    const form = new FormData()
    form.append('file', file)
    return api.post<{ data: BackupInfo }>('/admin/backups/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e) => {
        if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100))
      },
    })
  },

  updateBackupSchedule: (body: BackupScheduleUpdate) =>
    api.patch<{ data: BackupSchedule }>('/admin/backups/schedule', body),

  // Прямая ссылка на скачивание (proxy-стрим через бэкенд).
  backupDownloadUrl: (name: string) =>
    `${apiBaseUrl()}/admin/backups/${encodeURIComponent(name)}/download`,
}

// ── Backup types ─────────────────────────────────────────────
export interface BackupInfo {
  name: string
  size: number
  createdAt: string
  trigger: 'manual' | 'scheduled' | 'upload'
}

export type BackupFrequency = 'daily' | 'weekly' | 'monthly'

export interface BackupSchedule {
  enabled: boolean
  frequency: BackupFrequency
  hour: number
  minute: number
  weekday: number
  day: number
  retention: number
  lastRunAt: string | null
}

export interface BackupScheduleUpdate {
  enabled?: boolean
  frequency?: BackupFrequency
  hour?: number
  minute?: number
  weekday?: number
  day?: number
  retention?: number
}
