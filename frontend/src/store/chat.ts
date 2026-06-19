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
  // Когда собеседник прослушал (null = ещё не прослушано).
  listenedAt?: string | null
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
  // Идемпотентный ключ отправки: совпадает у оптимистичного плейсхолдера и у
  // реального сообщения с сервера — по нему происходит реконсиляция без дублей.
  clientMessageId?: string | null
  // Локальный статус отправки медиа (только клиент): сообщение уже видно
  // отправителю, но файл ещё грузится в фоне.
  pending?: boolean
  // Отправка не удалась — показываем значок ошибки и кнопку повтора.
  failed?: boolean
}

// Вставка сообщения в массив с сохранением порядка по id (ULID/UUIDv7
// лексикографически монотонны во времени). Оптимистичные плейсхолдеры имеют id
// вида `temp-…` — они не сравнимы с серверными ULID, поэтому всегда кладутся
// в конец (самые свежие, ещё не подтверждённые). Возвращает новый массив.
function insertOrdered(list: Message[], msg: Message): Message[] {
  const isTemp = msg.id.startsWith('temp-')
  if (isTemp) return [...list, msg]
  // Ищем позицию первого реального сообщения с id больше нового.
  let i = list.length
  while (i > 0) {
    const prev = list[i - 1]
    if (prev.id.startsWith('temp-')) { i--; continue }  // temp всегда после реальных
    if (prev.id <= msg.id) break
    i--
  }
  return [...list.slice(0, i), msg, ...list.slice(i)]
}

// Объединяет два набора сообщений без потерь и дублей, восстанавливая порядок:
// реальные — по возрастанию id (ULID монотонен), оптимистичные плейсхолдеры
// (temp-…) — всегда в хвосте в порядке их createdAt. При совпадении id выигрывает
// `incoming` (свежая версия с сервера: реакции/правки/вложения). Используется при
// forward-sync и неразрушающем ресинке, чтобы НЕ схлопывать уже подгруженную
// вверх историю до серверного окна.
function mergeMessages(base: Message[], incoming: Message[]): Message[] {
  const byId = new Map<string, Message>()
  for (const m of base) byId.set(m.id, m)
  for (const m of incoming) byId.set(m.id, m)  // incoming перекрывает base

  const all = [...byId.values()]
  const real = all
    .filter((m) => !m.id.startsWith('temp-'))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  // Реконсиляция оптимистичных плейсхолдеров: если реальное сообщение с тем же
  // clientMessageId уже пришло (forward-sync), временный дубль отбрасываем.
  const realClientIds = new Set(real.map((m) => m.clientMessageId).filter(Boolean) as string[])
  const temps = all
    .filter((m) => m.id.startsWith('temp-') && !(m.clientMessageId && realClientIds.has(m.clientMessageId)))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  return [...real, ...temps]
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
  // Открытый сейчас чат — чтобы addMessage не накручивал unread для активного
  // диалога (его и так помечают прочитанным). null, когда чат не открыт.
  activeChatId: string | null
  drafts: Record<string, string>        // chatId → текст черновика

  setChats: (chats: Chat[]) => void
  upsertChat: (chat: Chat) => void
  removeChat: (chatId: string) => void
  setSocketReady: (v: boolean) => void
  setActiveChat: (chatId: string | null) => void
  // mode:
  //   'replace' — холодное открытие: серверное окно — источник истины (+ хвост
  //               неотправленных плейсхолдеров).
  //   'merge'   — ресинк по фокусу/реконнекту: объединяем с уже загруженным,
  //               не теряя подгруженную вверх историю (cursor не трогаем).
  setMessages: (chatId: string, messages: Message[], nextCursor: string | null, mode?: 'replace' | 'merge') => void
  // Forward-sync: вмерживает порцию «новее, чем …» без потерь и дублей.
  mergeForward: (chatId: string, messages: Message[]) => void
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
  updateAttachmentListened: (chatId: string, messageId: string, listenedAt: string) => void
  setUserOnline: (userId: string) => void
  setUserOffline: (userId: string, lastSeenAt: string) => void
  // Полная замена набора онлайн-пользователей (снапшот при connect/реконнекте).
  // В отличие от аддитивного setUserOnline, снимает тех, кого больше нет онлайн.
  setOnlineUsers: (userIds: string[]) => void
  setTyping: (chatId: string, username: string, isTyping: boolean) => void
  setDraft: (chatId: string, text: string) => void
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
  activeChatId: null,
  drafts: {},

  setChats: (chats) => set({ chats: sortChats(chats) }),
  setSocketReady: (v) => set({ socketReady: v }),
  setActiveChat: (chatId) => set({ activeChatId: chatId }),

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

  setMessages: (chatId, messages, nextCursor, mode = 'replace') =>
    set((s) => {
      const prev = s.messages[chatId] ?? []
      const serverIds = new Set(messages.map((m) => m.id))
      const serverClientIds = new Set(
        messages.map((m) => m.clientMessageId).filter(Boolean) as string[],
      )
      // Локальные неотправленные плейсхолдеры (pending/failed, которых ещё нет
      // на сервере) сохраняем всегда — иначе ресинк стирал бы их (потеря).
      const localUnsent = prev.filter(
        (m) =>
          (m.pending || m.failed) &&
          !serverIds.has(m.id) &&
          !(m.clientMessageId && serverClientIds.has(m.clientMessageId)),
      )

      if (mode === 'merge') {
        // Ресинк по фокусу/реконнекту: НЕ схлопываем уже подгруженную вверх
        // историю до серверного окна — объединяем по id без потерь и дублей.
        // nextCursor (граница «загрузить ранее») сохраняем прежним.
        const merged = mergeMessages(prev, messages)
        return { messages: { ...s.messages, [chatId]: merged } }
      }

      // 'replace' — холодное открытие: серверное окно как есть + хвост unsent.
      return {
        messages: { ...s.messages, [chatId]: [...messages, ...localUnsent] },
        nextCursor: { ...s.nextCursor, [chatId]: nextCursor },
      }
    }),

  mergeForward: (chatId, messages) =>
    set((s) => {
      if (messages.length === 0) return s
      const prev = s.messages[chatId] ?? []
      return { messages: { ...s.messages, [chatId]: mergeMessages(prev, messages) } }
    }),

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

      // Реконсиляция оптимистичной отправки: своё сообщение приходит и
      // REST-ответом, и широковещанием по сокету. Сопоставляем плейсхолдер с
      // реальным по идемпотентному ключу clientMessageId — детерминированно,
      // без эвристик по тексту/времени (исключает дубли и ложные схлопывания).
      if (isOwn && msg.clientMessageId) {
        const idx = existing.findIndex((m) => m.clientMessageId === msg.clientMessageId)
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

      // Реальное сообщение вставляем в порядке по id (ULID монотонен), а не
      // слепо в конец — иначе пришедшее с задержкой/из другого канала встанет
      // не на своё место.
      const updated = insertOrdered(existing, msg)
      // Превью в сайдбаре — по реально последнему сообщению (могло прийти
      // старое out-of-order, тогда last остаётся прежним).
      const newest = updated[updated.length - 1] ?? msg
      const newestIsOwn = newest.sender.id === myId

      // Не накручиваем unread для своего сообщения и для открытого сейчас чата
      // (он и так помечается прочитанным эффектом в ChatPage) — иначе бейдж
      // дребезжит при быстром потоке.
      const isActive = s.activeChatId === msg.chatId
      const chats = s.chats.map((c) => {
        if (c.id !== msg.chatId) return c
        return {
          ...c,
          lastMessage: {
            id: newest.id,
            content: newest.content,
            type: newest.type,
            createdAt: newest.createdAt,
            isOwn: newestIsOwn,
          },
          unreadCount: isOwn || isActive ? c.unreadCount : c.unreadCount + 1,
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
      // Реальное сообщение могло оказаться не на своём месте по времени (temp
      // держался в хвосте, а за это время пришли чужие сообщения). Убираем temp
      // и вставляем real в позицию по ULID, восстанавливая хронологию.
      const withoutTemp = existing.filter((m) => m.id !== tempId)
      return {
        messages: { ...s.messages, [chatId]: insertOrdered(withoutTemp, msg) },
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

  updateAttachmentListened: (chatId, messageId, listenedAt) =>
    set((s) => {
      const msgs = s.messages[chatId]
      if (!msgs) return s
      return {
        messages: {
          ...s.messages,
          [chatId]: msgs.map((m) =>
            m.id === messageId && m.attachments?.length
              ? { ...m, attachments: m.attachments.map((a, i) => i === 0 ? { ...a, listenedAt } : a) }
              : m
          ),
        },
      }
    }),

  setUserOnline: (userId) =>
    set((s) => ({ onlineUsers: new Set([...s.onlineUsers, userId]) })),

  setOnlineUsers: (userIds) => set({ onlineUsers: new Set(userIds) }),

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

  setDraft: (chatId, text) =>
    set((s) => ({
      drafts: text ? { ...s.drafts, [chatId]: text } : Object.fromEntries(Object.entries(s.drafts).filter(([k]) => k !== chatId)),
    })),
}))
