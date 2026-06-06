import { create } from 'zustand'

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

export interface Message {
  id: string
  chatId: string
  content: string | null
  type: string
  createdAt: string
  editedAt: string | null
  sender: MessageSender
  attachments?: MessageAttachment[]
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
  setSocketReady: (v: boolean) => void
  setMessages: (chatId: string, messages: Message[], nextCursor: string | null) => void
  prependMessages: (chatId: string, messages: Message[], nextCursor: string | null) => void
  addMessage: (msg: Message) => void
  updateMessage: (msg: Message) => void
  removeMessage: (chatId: string, id: string) => void
  setUserOnline: (userId: string) => void
  setUserOffline: (userId: string, lastSeenAt: string) => void
  setTyping: (chatId: string, username: string, isTyping: boolean) => void
}

export const useChatStore = create<ChatState>((set) => ({
  chats: [],
  messages: {},
  nextCursor: {},
  onlineUsers: new Set(),
  lastSeenMap: {},
  typing: {},
  socketReady: false,

  setChats: (chats) => set({ chats }),
  setSocketReady: (v) => set({ socketReady: v }),

  upsertChat: (chat) =>
    set((s) => {
      const existing = s.chats.findIndex((c) => c.id === chat.id)
      if (existing >= 0) {
        const updated = [...s.chats]
        updated[existing] = chat
        return { chats: updated }
      }
      return { chats: [chat, ...s.chats] }
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
      // Deduplicate
      if (existing.some((m) => m.id === msg.id)) return s

      const updated = [...existing, msg]
      // Update last message in chat list
      const chats = s.chats.map((c) => {
        if (c.id !== msg.chatId) return c
        return {
          ...c,
          lastMessage: {
            id: msg.id,
            content: msg.content,
            type: msg.type,
            createdAt: msg.createdAt,
            isOwn: false,  // will be recalculated by component
          },
        }
      })
      return {
        messages: { ...s.messages, [msg.chatId]: updated },
        chats,
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
