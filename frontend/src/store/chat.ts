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
  thumbnailKey: string | null
  mimeType: string
  sizeBytes: number | null
  width: number | null
  height: number | null
  durationMs: number | null
  waveform: number[] | null
  publicUrl?: string
  thumbnailUrl?: string
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
  removeMessage: (chatId: string, id: string) => void
  resetUnread: (chatId: string) => void
  updatePartnerRead: (chatId: string, messageId: string, readAt?: string) => void
  setUserOnline: (userId: string) => void
  setUserOffline: (userId: string, lastSeenAt: string) => void
  setTyping: (chatId: string, username: string, isTyping: boolean) => void
}

function sortChats(chats: Chat[]): Chat[] {
  return [...chats].sort((a, b) => {
    const ta = a.lastMessage?.createdAt ?? a.createdAt
    const tb = b.lastMessage?.createdAt ?? b.createdAt
    return tb.localeCompare(ta)
  })
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

      const updated = [...existing, msg]
      const myId = useAuthStore.getState().user?.id
      const isOwn = msg.sender.id === myId

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
      return {
        messages: {
          ...s.messages,
          [msg.chatId]: existing.map((m) => (m.id === msg.id ? msg : m)),
        },
      }
    }),

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
