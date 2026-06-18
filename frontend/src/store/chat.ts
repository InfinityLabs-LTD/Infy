import { create } from 'zustand'
import { useAuthStore } from '@/store/auth'

export interface ChatPartner {
  id: string
  username: string
  nickname: string
  avatarUrl: string | null
  lastSeenAt: string
}

export interface LastMessage {
  id: string
  content: string | null
  type: string
  createdAt: string
  isOwn: boolean
}

export interface Chat {
  id: string
  type: string
  partner: ChatPartner | null
  lastMessage: LastMessage | null
  unreadCount: number
  partnerLastReadMessageId: string | null
  partnerReadAt: string | null
  createdAt: string
}

export interface MessageSender {
  id: string
  username: string
  nickname: string
  avatarUrl: string | null
}

export interface MessageAttachment {
  id: string
  storageKey: string
  fileName?: string | null
  thumbnailKey: string | null
  mimeType: string
  sizeBytes: number | null
  width: number | null
  height: number | null
  durationMs: number | null
  waveform: number[] | null
  publicUrl?: string
  thumbnailUrl?: string
  // Распознанный текст голосового/кружка (заполняется по запросу).
  transcript?: string | null
}

export interface MessageReaction {
  emoji: string
  count: number
  userIds: string[]
}

export interface ReplyPreview {
  id: string
  content: string | null
  type: string
  deleted: boolean
  sender: { id: string; nickname: string }
}

export interface Message {
  id: string
  chatId: string
  content: string | null
  type: string
  createdAt: string
  editedAt: string | null
  pinnedAt?: string | null
  replyTo?: ReplyPreview | null
  sender: MessageSender
  attachments?: MessageAttachment[]
  reactions?: MessageReaction[]
  // Локальный статус отправки медиа (только клиент): сообщение уже видно
  // отправителю, но файл ещё грузится в фоне.
  pending?: boolean
  // Отправка не удалась — показываем значок ошибки и кнопку повтора.
  failed?: boolean
}

interface TypingState {
  [chatId: string]: Set<string>   // set of usernames typing
}

interface ChatState {
  chats: Chat[]
  messages: Record<string, Message[]>   // chatId → messages (ascending)
  nextCursor: Record<string, string | null>
  onlineUsers: Set<string>              // set of userIds
  lastSeenMap: Record<string, string>   // userId → ISO string
  typing: TypingState
  socketReady: boolean

  setChats: (chats: Chat[]) => void
  upsertChat: (chat: Chat) => void
  removeChat: (chatId: string) => void
  setSocketReady: (v: boolean) => void
  setMessages: (chatId: string, messages: Message[], nextCursor: string | null) => void
  prependMessages: (chatId: string, messages: Message[], nextCursor: string | null) => void
  addMessage: (msg: Message) => void
  updateMessage: (msg: Message) => void
  // Заменяет оптимистичное сообщение (tempId) на реальное (с сервера).
  replaceMessage: (chatId: string, tempId: string, msg: Message) => void
  // Помечает оптимистичное сообщение как ошибочное (отправка не удалась).
  setMessageFailed: (chatId: string, tempId: string, failed: boolean) => void
  // Меняет локальный статус отправки (для повтора: failed → pending).
  setMessageStatus: (chatId: string, tempId: string, status: { pending?: boolean; failed?: boolean }) => void
  removeMessage: (chatId: string, id: string) => void
  resetUnread: (chatId: string) => void
  updatePartnerRead: (chatId: string, messageId: string, readAt?: string) => void
  setUserOnline: (userId: string) => void
  setUserOffline: (userId: string, lastSeenAt: string) => void
  setTyping: (chatId: string, username: string, isTyping: boolean) => void
}

// Сортировка списка диалогов по убыванию времени последнего сообщения
// (свежие — сверху). Сравниваем по числовому времени, а не строкой: форматы
// дат из REST и сокета могут отличаться (миллисекунды/смещение), и lexicographic
// localeCompare тогда переставлял бы чаты неверно.
function sortChats(chats: Chat[]): Chat[] {
  const ts = (c: Chat) => new Date(c.lastMessage?.createdAt ?? c.createdAt).getTime()
  return [...chats].sort((a, b) => ts(b) - ts(a))
}

export const useChatStore = create<ChatState>((set) => ({
  chats: [],
  messages: {},
  nextCursor: {},
  onlineUsers: new Set(),
  lastSeenMap: {},
  typing: {},
  socketReady: false,

  setChats: (chats) => set({ chats: sortChats(chats) }),
  setSocketReady: (v) => set({ socketReady: v }),

  upsertChat: (chat) =>
    set((s) => {
      const existing = s.chats.findIndex((c) => c.id === chat.id)
      if (existing >= 0) {
        const updated = [...s.chats]
        updated[existing] = chat
        return { chats: sortChats(updated) }
      }
      return { chats: sortChats([chat, ...s.chats]) }
    }),

  removeChat: (chatId) =>
    set((s) => {
      const messages = { ...s.messages }
      const nextCursor = { ...s.nextCursor }
      const typing = { ...s.typing }
      delete messages[chatId]
      delete nextCursor[chatId]
      delete typing[chatId]
      return {
        chats: s.chats.filter((c) => c.id !== chatId),
        messages,
        nextCursor,
        typing,
      }
    }),

  setMessages: (chatId, messages, nextCursor) =>
    set((s) => ({
      messages: { ...s.messages, [chatId]: messages },
      nextCursor: { ...s.nextCursor, [chatId]: nextCursor },
    })),

  prependMessages: (chatId, messages, nextCursor) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [chatId]: [...messages, ...(s.messages[chatId] ?? [])],
      },
      nextCursor: { ...s.nextCursor, [chatId]: nextCursor },
    })),

  addMessage: (msg) =>
    set((s) => {
      const existing = s.messages[msg.chatId] ?? []
      if (existing.some((m) => m.id === msg.id)) return s

      const myId = useAuthStore.getState().user?.id
      const isOwn = msg.sender.id === myId

      // Реконсиляция оптимистичной отправки: своё сообщение приходит
      // и REST-ответом, и широковещанием по сокету — нужно заменить
      // pending-плейсхолдер реальным, а не добавить дубль.
      if (isOwn) {
        // Медиа: сопоставляем по storageKey вложения.
        const incomingKeys = (msg.attachments ?? []).map((a) => a.storageKey).filter(Boolean)
        if (incomingKeys.length > 0) {
          const idx = existing.findIndex((m) =>
            m.pending &&
            (m.attachments ?? []).some((a) => incomingKeys.includes(a.storageKey)),
          )
          if (idx >= 0) {
            const tempId = existing[idx].id
            const merged = [...existing]
            merged[idx] = msg
            const chats = s.chats.map((c) =>
              c.id === msg.chatId && (c.lastMessage?.id === tempId || c.lastMessage?.id === msg.id)
                ? { ...c, lastMessage: { id: msg.id, content: msg.content, type: msg.type, createdAt: msg.createdAt, isOwn } }
                : c,
            )
            return { messages: { ...s.messages, [msg.chatId]: merged }, chats: sortChats(chats) }
          }
        }

        // Текст: сопоставляем по содержимому — ищем последний pending-плейсхолдер
        // того же отправителя с тем же текстом (не старше 30 сек).
        if (msg.type === 'TEXT' && msg.content) {
          const cutoff = Date.now() - 30_000
          // findLastIndex недоступен в ES2020 — ищем с конца вручную
          let idx = -1
          for (let i = existing.length - 1; i >= 0; i--) {
            const m = existing[i]
            if (
              m.pending &&
              m.type === 'TEXT' &&
              m.sender.id === myId &&
              m.content === msg.content &&
              new Date(m.createdAt).getTime() > cutoff
            ) { idx = i; break }
          }
          if (idx >= 0) {
            const tempId = existing[idx].id
            const merged = [...existing]
            merged[idx] = msg
            const chats = s.chats.map((c) =>
              c.id === msg.chatId && (c.lastMessage?.id === tempId || c.lastMessage?.id === msg.id)
                ? { ...c, lastMessage: { id: msg.id, content: msg.content, type: msg.type, createdAt: msg.createdAt, isOwn } }
                : c,
            )
            return { messages: { ...s.messages, [msg.chatId]: merged }, chats: sortChats(chats) }
          }
        }
      }

      const updated = [...existing, msg]

      const chats = s.chats.map((c) => {
        if (c.id !== msg.chatId) return c
        return {
          ...c,
          lastMessage: {
            id: msg.id,
            content: msg.content,
            type: msg.type,
            createdAt: msg.createdAt,
            isOwn,
          },
          unreadCount: isOwn ? c.unreadCount : c.unreadCount + 1,
        }
      })
      return {
        messages: { ...s.messages, [msg.chatId]: updated },
        chats: sortChats(chats),
      }
    }),

  updateMessage: (msg) =>
    set((s) => {
      const existing = s.messages[msg.chatId] ?? []
      // Если обновлённое сообщение — последнее в списке чата (напр. ответ ИИ
      // заменил плейсхолдер «печатает…»), синхронизируем превью в сайдбаре.
      const myId = useAuthStore.getState().user?.id
      const chats = s.chats.map((c) => {
        if (c.id !== msg.chatId || c.lastMessage?.id !== msg.id) return c
        return {
          ...c,
          lastMessage: {
            id: msg.id,
            content: msg.content,
            type: msg.type,
            createdAt: msg.createdAt,
            isOwn: msg.sender.id === myId,
          },
        }
      })
      return {
        messages: {
          ...s.messages,
          [msg.chatId]: existing.map((m) => (m.id === msg.id ? msg : m)),
        },
        chats,
      }
    }),

  replaceMessage: (chatId, tempId, msg) =>
    set((s) => {
      const existing = s.messages[chatId] ?? []
      // Реальное сообщение могло уже прийти по сокету и заменить плейсхолдер —
      // тогда tempId отсутствует, а msg.id уже в списке: ничего не делаем.
      if (!existing.some((m) => m.id === tempId)) return s
      if (existing.some((m) => m.id === msg.id)) {
        return { messages: { ...s.messages, [chatId]: existing.filter((m) => m.id !== tempId) } }
      }
      const myId = useAuthStore.getState().user?.id
      const chats = s.chats.map((c) => {
        if (c.id !== chatId || c.lastMessage?.id !== tempId) return c
        return {
          ...c,
          lastMessage: {
            id: msg.id, content: msg.content, type: msg.type,
            createdAt: msg.createdAt, isOwn: msg.sender.id === myId,
          },
        }
      })
      return {
        messages: { ...s.messages, [chatId]: existing.map((m) => (m.id === tempId ? msg : m)) },
        chats,
      }
    }),

  setMessageFailed: (chatId, tempId, failed) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [chatId]: (s.messages[chatId] ?? []).map((m) =>
          m.id === tempId ? { ...m, failed, pending: failed ? false : m.pending } : m,
        ),
      },
    })),

  setMessageStatus: (chatId, tempId, status) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [chatId]: (s.messages[chatId] ?? []).map((m) =>
          m.id === tempId ? { ...m, ...status } : m,
        ),
      },
    })),

  removeMessage: (chatId, id) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [chatId]: (s.messages[chatId] ?? []).filter((m) => m.id !== id),
      },
    })),

  resetUnread: (chatId) =>
    set((s) => ({
      chats: s.chats.map((c) => c.id === chatId ? { ...c, unreadCount: 0 } : c),
    })),

  updatePartnerRead: (chatId, messageId, readAt) =>
    set((s) => ({
      chats: s.chats.map((c) =>
        c.id === chatId
          ? { ...c, partnerLastReadMessageId: messageId, partnerReadAt: readAt ?? c.partnerReadAt }
          : c
      ),
    })),

  setUserOnline: (userId) =>
    set((s) => ({ onlineUsers: new Set([...s.onlineUsers, userId]) })),

  setUserOffline: (userId, lastSeenAt) =>
    set((s) => {
      const next = new Set(s.onlineUsers)
      next.delete(userId)
      return { onlineUsers: next, lastSeenMap: { ...s.lastSeenMap, [userId]: lastSeenAt } }
    }),

  setTyping: (chatId, username, isTyping) =>
    set((s) => {
      const prev = new Set(s.typing[chatId] ?? [])
      if (isTyping) prev.add(username)
      else prev.delete(username)
      return { typing: { ...s.typing, [chatId]: prev } }
    }),
}))
