import { api } from './client'
import type { Chat, Message } from '@/store/chat'
import type { UploadResult } from './media'

type MediaMessageType = 'IMAGE' | 'VIDEO' | 'AUDIO' | 'CIRCLE_VIDEO' | 'FILE'

function toAttachment(upload: UploadResult) {
  return {
    storageKey:   upload.storageKey,
    fileName:     upload.fileName,
    thumbnailKey: upload.thumbnailKey,
    mimeType:     upload.mimeType,
    sizeBytes:    upload.sizeBytes,
    width:        upload.width,
    height:       upload.height,
    durationMs:   upload.durationMs,
    waveform:     upload.waveform,
  }
}

export interface MessageSearchResult {
  messageId: string
  chatId: string
  content: string | null
  createdAt: string
  isOwn: boolean
  partner: { id: string; username: string; nickname: string; avatarUrl: string | null } | null
}

export const chatApi = {
  listChats: () => api.get<{ data: Chat[] }>('/chats'),

  searchMessages: (q: string) =>
    api.get<{ data: MessageSearchResult[] }>('/chats/search', { params: { q } }),

  createChat: (partnerId: string) =>
    api.post<{ data: Chat }>('/chats', { partnerId }),

  getOrCreateChat: (partnerId: string) =>
    api.get<{ data: Chat }>(`/chats/partner/${partnerId}`),

  getChat: (chatId: string) =>
    api.get<{ data: Chat }>(`/chats/${chatId}/info`),

  deleteChat: (chatId: string) =>
    api.delete(`/chats/${chatId}`),

  getMessages: (chatId: string, cursor?: string, limit = 50) =>
    api.get<{ data: { messages: Message[]; nextCursor: string | null } }>(
      `/chats/${chatId}/messages`,
      { params: { cursor, limit } },
    ),

  // Forward-sync: сообщения строго новее `after` (залечивание разрыва после
  // оффлайна/реконнекта). hasMoreForward=true → есть ещё, дочитываем по nextAfter.
  getMessagesAfter: (chatId: string, after: string, limit = 50) =>
    api.get<{ data: { messages: Message[]; nextAfter: string | null; hasMoreForward: boolean } }>(
      `/chats/${chatId}/messages/after`,
      { params: { after, limit } },
    ),

  sendMessage: (chatId: string, content: string, replyToId?: string, clientMessageId?: string) =>
    api.post<{ data: Message }>(`/chats/${chatId}/messages`, {
      content, replyToId, ...(clientMessageId ? { clientMessageId } : {}),
    }),

  sendMedia: (chatId: string, type: MediaMessageType, upload: UploadResult, clientMessageId?: string) =>
    api.post<{ data: Message }>(`/chats/${chatId}/messages`, {
      type,
      attachment: toAttachment(upload),
      ...(clientMessageId ? { clientMessageId } : {}),
    }),

  // Альбом: несколько вложений (фото/видео/документы) в одном сообщении + общая подпись.
  // Если файл один — отправляем как обычное медиа-сообщение соответствующего типа.
  sendAlbum: (chatId: string, uploads: UploadResult[], content?: string, replyToId?: string, clientMessageId?: string) =>
    api.post<{ data: Message }>(`/chats/${chatId}/messages`, {
      ...(content ? { content } : {}),
      ...(replyToId ? { replyToId } : {}),
      ...(clientMessageId ? { clientMessageId } : {}),
      attachments: uploads.map(toAttachment),
    }),

  getChatMedia: (chatId: string, cursor?: string, limit = 30) =>
    api.get<{ data: { messages: Message[]; nextCursor: string | null } }>(
      `/chats/${chatId}/media`,
      { params: { cursor, limit } },
    ),

  editMessage: (messageId: string, content: string) =>
    api.patch<{ data: Message }>(`/chats/messages/${messageId}`, { content }),

  deleteMessage: (messageId: string) =>
    api.delete(`/chats/messages/${messageId}`),

  reactToMessage: (messageId: string, emoji: string) =>
    api.post<{ data: Message }>(`/chats/messages/${messageId}/react`, { emoji }),

  pinMessage: (messageId: string) =>
    api.post<{ data: Message }>(`/chats/messages/${messageId}/pin`),

  transcribe: (messageId: string) =>
    api.post<{ data: Message }>(`/chats/messages/${messageId}/transcribe`),

  listenVoice: (messageId: string) =>
    api.post<{ data: { chatId: string; messageId: string; listenedAt: string } }>(`/chats/messages/${messageId}/listen`),

  getPinned: (chatId: string) =>
    api.get<{ data: Message | null }>(`/chats/${chatId}/pinned`),
}
