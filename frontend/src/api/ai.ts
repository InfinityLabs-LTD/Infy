import { api } from './client'

export type SummaryPeriod = 'hour' | 'day' | 'week' | 'month' | 'year' | 'all'

export interface AiConvoMessage {
  id: string
  role: 'USER' | 'ASSISTANT'
  content: string
  meta?: { toolsUsed?: string[]; usedWebSearch?: boolean } | null
  createdAt: string
}

export const aiApi = {
  status: () =>
    api.get<{ data: { enabled: boolean } }>('/ai/status'),

  summary: (chatId: string, period: SummaryPeriod = 'all') =>
    api.post<{ data: { summary: string; messageCount: number; period: SummaryPeriod } }>(
      `/ai/chats/${chatId}/summary`, { period }),

  replies: (chatId: string) =>
    api.post<{ data: { replies: string[] } }>(`/ai/chats/${chatId}/replies`),

  // Приватный диалог с ассистентом (история видна только владельцу)
  getConversation: (chatId: string) =>
    api.get<{ data: { id: string; messages: AiConvoMessage[] } }>(`/ai/chats/${chatId}/conversation`),

  sendToAssistant: (chatId: string, message: string) =>
    api.post<{ data: { reply: string; toolsUsed: string[]; usedWebSearch: boolean; conversationId: string } }>(
      `/ai/chats/${chatId}/conversation`, { message }),

  clearConversation: (chatId: string) =>
    api.delete(`/ai/chats/${chatId}/conversation`),

  // Публичный вопрос ИИ в чате. Вопрос и ответ публикуются как сообщения
  // (видны обоим); ответ приходит асинхронно по сокету. Возвращает id сообщения-запроса.
  ask: (chatId: string, question: string) =>
    api.post<{ data: { queryMessageId: string } }>(
      `/ai/chats/${chatId}/ask`, { question }),
}
