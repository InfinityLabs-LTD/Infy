import { Server as HttpServer } from 'http'
import { Server as SocketServer, Socket } from 'socket.io'
import { createAdapter } from '@socket.io/redis-adapter'
import Redis from 'ioredis'
import { PrismaClient } from '@prisma/client'
import { verifyAccessToken } from '../../lib/jwt.js'
import { Errors } from '../../lib/errors.js'
import { subscribeToChannel } from '../../lib/pubsub.js'
import { setOnline, setOffline, refreshPresence, isOnline, getOnlineUserIds } from '../../lib/presence.js'
import * as ChatService from '../chat/chat.service.js'
import { uuidv7 } from 'uuidv7'

interface AuthSocket extends Socket {
  userId: string
  username: string
  role: string
  sessionId: string
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
      const p = payload as { event: string; data: { chatId?: string; id?: string } }
      if (p.data?.chatId) {
        io.to(`chat:${p.data.chatId}`).emit(p.event, p.data)
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
      ack?: (res: { ok: boolean; message?: unknown; error?: string }) => void,
    ) => {
      try {
        const { chatId, content, type } = payload
        if (!chatId || !content?.trim()) {
          ack?.({ ok: false, error: 'Invalid payload' })
          return
        }

        const message = await ChatService.sendMessage(
          prisma,
          chatId,
          BigInt(userId),
          { content: content.trim(), type: (type as 'TEXT') ?? 'TEXT' },
        )

        io.to(`chat:${chatId}`).emit('message_new', message)
        ack?.({ ok: true, message })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error'
        ack?.({ ok: false, error: msg })
      }
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
