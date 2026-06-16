import { Server as HttpServer } from 'http'
import { Server as SocketServer, Socket } from 'socket.io'
import { createAdapter } from '@socket.io/redis-adapter'
import Redis from 'ioredis'
import { PrismaClient } from '@prisma/client'
import { verifyAccessToken } from '../../lib/jwt.js'
import { AppError } from '../../lib/errors.js'
import { subscribeToChannel } from '../../lib/pubsub.js'
import { setOnline, setOffline, refreshPresence, isOnline, getOnlineUserIds } from '../../lib/presence.js'
import { sendPush } from '../../lib/webpush.js'
import * as ChatService from '../chat/chat.service.js'
import { registerCallHandlers } from '../calls/calls.signaling.js'
import { askInChat } from '../ai/ai.service.js'

// Команда вызова ИИ прямо в чате: «/ask вопрос». Ответ виден обоим участникам.
const ASK_PREFIX = /^\/ask\b\s*/i

interface AuthSocket extends Socket {
  userId: string
  username: string
  role: string
  sessionId: string
}

interface MessageForPush {
  chatId: string
  sender?: { id: string; nickname: string; avatarUrl?: string | null }
  content?: string | null
  type?: string
}

async function pushToOfflineMembers(
  redis: Redis,
  prisma: PrismaClient,
  msg: MessageForPush,
  senderUserId: string,
): Promise<void> {
  try {
    const members = await prisma.chatMember.findMany({
      where: { chatId: msg.chatId },
      select: { userId: true },
    })

    const offlineUserIds: bigint[] = []
    for (const m of members) {
      if (m.userId.toString() === senderUserId) continue
      const online = await isOnline(redis, m.userId.toString())
      if (!online) offlineUserIds.push(m.userId)
    }

    if (offlineUserIds.length === 0) return

    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId: { in: offlineUserIds } },
    })

    const senderName = msg.sender?.nickname ?? 'Infy'
    const senderAvatar = msg.sender?.avatarUrl ?? '/icon.jpg'
    const body = msg.type === 'TEXT' ? (msg.content ?? '') : '📎 Вложение'

    const results = await Promise.allSettled(
      subscriptions.map(sub =>
        sendPush(sub, {
          title: senderName,
          body,
          icon: senderAvatar,
          tag: msg.chatId,
          url: `/`,
        }),
      ),
    )

    // Prune subscriptions the push service reported as gone (404/410).
    const deadEndpoints = subscriptions
      .filter((_, i) => results[i].status === 'fulfilled' && (results[i] as PromiseFulfilledResult<boolean>).value === false)
      .map(sub => sub.endpoint)
    if (deadEndpoints.length > 0) {
      await prisma.pushSubscription.deleteMany({ where: { endpoint: { in: deadEndpoints } } })
    }
  } catch { /* non-critical */ }
}

export function createSocketServer(
  httpServer: HttpServer,
  redisUrl: string,
  prisma: PrismaClient,
): SocketServer {
  const pubClient = new Redis(redisUrl)
  const subClient = pubClient.duplicate()

  const io = new SocketServer(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    transports: ['websocket', 'polling'],
    pingInterval: 25_000,
    pingTimeout: 10_000,
  })

  io.adapter(createAdapter(pubClient, subClient))

  // ── JWT auth middleware ────────────────────────────────────
  io.use((socket, next) => {
    const token =
      (socket.handshake.auth as Record<string, string>).token ??
      socket.handshake.headers['authorization']?.replace('Bearer ', '')

    if (!token) return next(new Error('UNAUTHORIZED'))

    try {
      const payload = verifyAccessToken(token)
      const s = socket as AuthSocket
      s.userId = payload.sub
      s.username = payload.username
      s.role = payload.role
      s.sessionId = payload.sessionId
      next()
    } catch {
      next(new Error('UNAUTHORIZED'))
    }
  })

  // ── Subscribe to Redis pub/sub from core ──────────────────
  const unsub = subscribeToChannel(
    pubClient.duplicate(),
    'chat:message',
    (payload) => {
      const p = payload as { event: string; data: { chatId?: string; sender?: { id: string; nickname: string; avatarUrl?: string | null }; content?: string; type?: string } }
      if (p.data?.chatId) {
        io.to(`chat:${p.data.chatId}`).emit(p.event, p.data)
        // Push только для обычных сообщений: системные, AI-запрос/ответ и пустые
        // плейсхолдеры не уведомляем (у ИИ-ответа своя доставка/обновление).
        const noPushTypes = new Set(['SYSTEM', 'AI', 'AI_QUERY'])
        if (p.event === 'message_new' && p.data.sender?.id && !noPushTypes.has(p.data.type ?? '')) {
          pushToOfflineMembers(pubClient, prisma, p.data as MessageForPush, p.data.sender.id).catch(() => {})
        }
      }
    },
  )

  // ── Subscribe to calendar events from core ────────────────
  const unsubCalendar = subscribeToChannel(
    pubClient.duplicate(),
    'chat:calendar',
    (payload) => {
      const p = payload as { event: string; data: { chatId?: string } }
      if (p.data?.chatId) {
        io.to(`chat:${p.data.chatId}`).emit(p.event, p.data)
      }
    },
  )

  // ── Subscribe to due reminders from scheduler ─────────────
  // Доставляем в персональную комнату каждого адресата (по userIds).
  const unsubReminder = subscribeToChannel(
    pubClient.duplicate(),
    'calendar:reminder',
    (payload) => {
      const p = payload as { userIds?: string[]; data?: unknown }
      if (!Array.isArray(p.userIds)) return
      for (const uid of p.userIds) {
        io.to(`user:${uid}`).emit('reminder_due', p.data)
      }
    },
  )

  // ── Connection handler ────────────────────────────────────
  io.on('connection', async (socket) => {
    const s = socket as AuthSocket
    const { userId, username } = s

    // Mark online + join personal room
    await setOnline(pubClient, userId)
    socket.join(`user:${userId}`)

    // Send current online users snapshot to the newly connected client
    try {
      const onlineIds = await getOnlineUserIds(pubClient)
      socket.emit('online_users', { userIds: onlineIds })
    } catch { /* non-critical */ }

    // Notify everyone that this user came online
    io.emit('user_online', { userId, username })

    // Auto-join all user's chat rooms
    try {
      const memberships = await prisma.chatMember.findMany({
        where: { userId: BigInt(userId) },
        select: { chatId: true },
      })
      for (const { chatId } of memberships) {
        socket.join(`chat:${chatId}`)
      }
    } catch { /* non-critical */ }

    // ── Сигналинг звонков (WebRTC) ──────────────────────────
    registerCallHandlers(io, s, pubClient, prisma)

    // ── join_chat ───────────────────────────────────────────
    socket.on('join_chat', async (chatId: string) => {
      try {
        const member = await prisma.chatMember.findUnique({
          where: { chatId_userId: { chatId, userId: BigInt(userId) } },
        })
        if (member) socket.join(`chat:${chatId}`)
      } catch { /* ignore */ }
    })

    // ── send_message ────────────────────────────────────────
    socket.on('send_message', async (
      payload: { chatId: string; content: string; type?: string },
      ack?: (res: { ok: boolean; message?: unknown; error?: string; code?: string }) => void,
    ) => {
      try {
        const { chatId, content, type } = payload
        if (!chatId || !content?.trim()) {
          ack?.({ ok: false, error: 'Invalid payload' })
          return
        }

        // Команда /ask <вопрос> — вызов Infy AI в чате. Не сохраняем команду
        // как обычное сообщение: ассистент сам публикует системный ответ обоим.
        if (ASK_PREFIX.test(content.trim())) {
          const question = content.trim().replace(ASK_PREFIX, '').trim()
          if (!question) {
            ack?.({ ok: false, error: 'Пустой вопрос для /ask', code: 'ASK_EMPTY' })
            return
          }
          try {
            await askInChat(prisma, pubClient, chatId, BigInt(userId), question)
            ack?.({ ok: true })
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Error'
            const code = err instanceof AppError ? err.code : undefined
            ack?.({ ok: false, error: msg, code })
          }
          return
        }

        const message = await ChatService.sendMessage(
          prisma,
          chatId,
          BigInt(userId),
          { content: content.trim(), type: (type as 'TEXT') ?? 'TEXT' },
        )

        io.to(`chat:${chatId}`).emit('message_new', message)
        pushToOfflineMembers(pubClient, prisma, message, userId).catch(() => {})
        ack?.({ ok: true, message })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error'
        const code = err instanceof AppError ? err.code : undefined
        ack?.({ ok: false, error: msg, code })
      }
    })

    // ── mark_read ───────────────────────────────────────────
    socket.on('mark_read', async ({ chatId, messageId }: { chatId: string; messageId: string }) => {
      if (!chatId || !messageId) return
      try {
        const readAt = await ChatService.markAsRead(prisma, chatId, BigInt(userId), messageId)
        socket.to(`chat:${chatId}`).emit('messages_read', { chatId, userId, messageId, readAt })
      } catch { /* non-critical */ }
    })

    // ── typing ──────────────────────────────────────────────
    socket.on('typing_start', (chatId: string) => {
      socket.to(`chat:${chatId}`).emit('typing', { chatId, userId, username, typing: true })
    })

    socket.on('typing_stop', (chatId: string) => {
      socket.to(`chat:${chatId}`).emit('typing', { chatId, userId, username, typing: false })
    })

    // ── heartbeat (refresh presence TTL) ───────────────────
    socket.on('ping', async () => {
      await refreshPresence(pubClient, userId)
      socket.emit('pong')
    })

    // ── disconnect ──────────────────────────────────────────
    socket.on('disconnect', async () => {
      // Check if user has other active sockets before marking offline
      const sockets = await io.in(`user:${userId}`).fetchSockets()
      if (sockets.length === 0) {
        await setOffline(pubClient, userId)
        await prisma.user.update({
          where: { id: BigInt(userId) },
          data: { lastSeenAt: new Date() },
        }).catch(() => {})
        io.emit('user_offline', { userId, username, lastSeenAt: new Date() })
      }
    })
  })

  return io
}
