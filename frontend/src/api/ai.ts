import { api } from './client'

export const aiApi = {
  status: () =>
    api.get<{ data: { enabled: boolean } }>('/ai/status'),

  summary: (chatId: string) =>
    api.post<{ data: { summary: string; messageCount: number } }>(`/ai/chats/${chatId}/summary`),

  replies: (chatId: string) =>
    api.post<{ data: { replies: string[] } }>(`/ai/chats/${chatId}/replies`),
}
