import { api } from './client'
import type { SanctionType } from './admin'

export type ReportCategory =
  | 'SPAM' | 'HARASSMENT' | 'HATE' | 'VIOLENCE'
  | 'SEXUAL' | 'SCAM' | 'ILLEGAL' | 'OTHER'

export interface MySanction {
  id: string
  type: SanctionType
  reason: string
  createdAt: string
  expiresAt: string | null
}

export const reportsApi = {
  // Пожаловаться на пользователя
  create: (body: {
    targetId: string
    category: ReportCategory
    description: string
    chatId?: string
    messageId?: string
    evidenceKeys?: string[]
  }) => api.post<{ data: unknown }>('/reports', body),

  // Активные санкции текущего пользователя (предупреждение/мут — показать самому)
  mySanctions: () =>
    api.get<{ data: { sanctions: MySanction[] } }>('/reports/my-sanctions'),
}
