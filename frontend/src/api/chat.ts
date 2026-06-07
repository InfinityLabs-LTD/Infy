import { api } from './client'
import type { Chat, Message } from '@/store/chat'
import type { UploadResult } from './media'

type MediaMessageType = 'IMAGE' | 'VIDEO' | 'AUDIO' | 'CIRCLE_VIDEO'

export const chatApi = {
  listChats: () => api.get<{ data: Chat[] }>('/chats'),

  createChat: (partnerId: string) =>
    api.post<{ data: Chat }>('/chats', { partnerId }),

  getOrCreateChat: (partnerId: string) =>
    api.get<{ data: Chat }>(`/chats/partner/${partnerId}`),

  getMessages: (chatId: string, cursor?: string, limit = 50) =>
    api.get<{ data: { messages: Message[]; nextCursor: string | null } }>(
      `/chats/${chatId}/messages`,
      { params: { cursor, limit } },
    ),

  sendMessage: (chatId: string, content: string) =>
    api.post<{ data: Message }>(`/chats/${chatId}/messages`, { content }),

  sendMedia: (chatId: string, type: MediaMessageType, upload: UploadResult) =>
    api.post<{ data: Message }>(`/chats/${chatId}/messages`, {
      type,
      attachment: {
        storageKey:   upload.storageKey,
        thumbnailKey: upload.thumbnailKey,
        mimeType:     upload.mimeType,
        sizeBytes:    upload.sizeBytes,
        width:        upload.width,
        height:       upload.height,
        durationMs:   upload.durationMs,
        waveform:     upload.waveform,
      },
    }),

  editMessage: (messageId: string, content: string) =>
    api.patch<{ data: Message }>(`/chats/messages/${messageId}`, { content }),

  deleteMessage: (messageId: string) =>
    api.delete(`/chats/messages/${messageId}`),
}
