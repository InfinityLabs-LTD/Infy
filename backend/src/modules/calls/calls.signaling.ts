import { Server as SocketServer, Socket } from 'socket.io'
import Redis from 'ioredis'
import { PrismaClient, CallMedia } from '@prisma/client'
import { ulid } from 'ulid'
import { isOnline } from '../../lib/presence.js'
import { sendPush } from '../../lib/webpush.js'
import * as CallsService from './calls.service.js'

// Сколько секунд звоним без ответа, прежде чем считать звонок пропущенным.
const RING_TIMEOUT_MS = 45_000
// TTL записи о звонке, ПОКА он звонит (RINGING). Короткий: если таймер дозвона
// потерян (реконнект инициатора на другой инстанс / рестарт), запись и busy-лок
// сами истекут вскоре после RING_TIMEOUT_MS, а не висят часами. Cleanup-воркер
// дополнительно закрывает осиротевшие RINGING-сессии в БД.
const RINGING_STATE_TTL_SEC = 60
// TTL записи об активном звонке (после accept). Запас на длинный разговор;
// продлевается heartbeat'ом call:media-state/signal не требуется — звонок
// корректно завершается через hangup/disconnect.
const ACTIVE_STATE_TTL_SEC = 4 * 60 * 60   // 4 часа максимум на один разговор

interface AuthSocket extends Socket {
  userId: string
  username: string
}

// Состояние активного звонка в Redis (общее для всех realtime-инстансов).
interface CallState {
  callId: string
  chatId: string
  initiatorId: string
  calleeId: string
  media: CallMedia
  status: 'ringing' | 'active'
}

const KEY = (callId: string) => `call:state:${callId}`
// Обратный индекс: какой звонок сейчас у пользователя (для busy-проверки и cleanup при disconnect).
const USER_CALL = (userId: string) => `call:user:${userId}`

async function saveState(redis: Redis, s: CallState): Promise<void> {
  const json = JSON.stringify(s)
  const ttl = s.status === 'active' ? ACTIVE_STATE_TTL_SEC : RINGING_STATE_TTL_SEC
  await redis
    .multi()
    .setex(KEY(s.callId), ttl, json)
    .setex(USER_CALL(s.initiatorId), ttl, s.callId)
    .setex(USER_CALL(s.calleeId), ttl, s.callId)
    .exec()
}

/**
 * Атомарно захватывает busy-лок для обоих участников через SET NX.
 * Возвращает true, если оба свободны и заняты этим звонком; иначе откатывает и
 * возвращает причину. Убирает TOCTOU-гонку двух одновременных invite.
 */
async function acquireBusyLock(
  redis: Redis,
  callId: string,
  initiatorId: string,
  calleeId: string,
): Promise<{ ok: true } | { ok: false; busy: 'self' | 'peer' }> {
  const gotSelf = await redis.set(USER_CALL(initiatorId), callId, 'EX', RINGING_STATE_TTL_SEC, 'NX')
  if (gotSelf !== 'OK') return { ok: false, busy: 'self' }
  const gotPeer = await redis.set(USER_CALL(calleeId), callId, 'EX', RINGING_STATE_TTL_SEC, 'NX')
  if (gotPeer !== 'OK') {
    await redis.del(USER_CALL(initiatorId))   // откат
    return { ok: false, busy: 'peer' }
  }
  return { ok: true }
}

async function loadState(redis: Redis, callId: string): Promise<CallState | null> {
  const raw = await redis.get(KEY(callId))
  if (!raw) return null
  try { return JSON.parse(raw) as CallState } catch { return null }
}

async function clearState(redis: Redis, s: CallState): Promise<void> {
  await redis
    .multi()
    .del(KEY(s.callId))
    .del(USER_CALL(s.initiatorId))
    .del(USER_CALL(s.calleeId))
    .exec()
}

async function getUserActiveCall(redis: Redis, userId: string): Promise<string | null> {
  return redis.get(USER_CALL(userId))
}

// Таймеры дозвона держим в памяти инстанса. invite и timeout обрабатываются
// на одном инстансе (сокет инициатора живёт здесь), поэтому этого достаточно.
const ringTimers = new Map<string, NodeJS.Timeout>()

function clearRingTimer(callId: string): void {
  const t = ringTimers.get(callId)
  if (t) { clearTimeout(t); ringTimers.delete(callId) }
}

/** Отправляет push получателю звонка, если он офлайн (звонок в свёрнутом браузере). */
async function pushIncomingCall(
  redis: Redis,
  prisma: PrismaClient,
  calleeId: string,
  callerName: string,
  callerAvatar: string | null,
  media: CallMedia,
): Promise<void> {
  try {
    const online = await isOnline(redis, calleeId)
    if (online) return   // онлайн — получит call:incoming по сокету
    const callee = await prisma.user.findUnique({
      where: { id: BigInt(calleeId) },
      select: { notifyPopup: true, notifySound: true, notifyVibrate: true },
    })
    if (callee?.notifyPopup === false) return   // баннеры отключены
    const subs = await prisma.pushSubscription.findMany({ where: { userId: BigInt(calleeId) } })
    if (subs.length === 0) return
    const body = media === 'VIDEO' ? '📹 Входящий видеозвонок' : '📞 Входящий звонок'
    await Promise.allSettled(subs.map(sub =>
      sendPush(sub, {
        title: callerName, body, icon: callerAvatar ?? '/logo.png', tag: 'call', url: '/',
        sound: callee?.notifySound !== false,
        vibrate: callee?.notifyVibrate !== false,
      }),
    ))
  } catch { /* push некритичен */ }
}

/**
 * Регистрирует обработчики сигналинга звонков на одном сокете.
 * Вызывается из основного connection-хендлера socket.server.ts.
 *
 * Сообщение о звонке (SYSTEM) и история пишутся в БД; SDP/ICE только
 * ретранслируются между двумя пирами — сервер их не хранит и не читает.
 */
export function registerCallHandlers(
  io: SocketServer,
  socket: AuthSocket,
  redis: Redis,
  prisma: PrismaClient,
): void {
  const { userId } = socket

  // Куда слать события конкретному пользователю (все его вкладки/устройства).
  const room = (uid: string) => `user:${uid}`

  // ── call:invite — инициировать звонок ──────────────────────
  socket.on('call:invite', async (
    payload: { chatId: string; media?: 'AUDIO' | 'VIDEO' },
    ack?: (res: { ok: boolean; callId?: string; error?: string }) => void,
  ) => {
    try {
      const { chatId } = payload
      const media: CallMedia = payload.media === 'VIDEO' ? 'VIDEO' : 'AUDIO'
      if (!chatId) { ack?.({ ok: false, error: 'chatId required' }); return }

      // Проверка членства + резолв партнёра (для DIRECT 1:1)
      const { partnerId } = await CallsService.resolveDirectCallTarget(prisma, chatId, BigInt(userId))
      const calleeId = partnerId.toString()

      // Атомарный захват busy-лока обоих участников (SET NX) — без TOCTOU-окна.
      const provisionalCallId = ulid()
      const lock = await acquireBusyLock(redis, provisionalCallId, userId, calleeId)
      if (!lock.ok) {
        if (lock.busy === 'self') { ack?.({ ok: false, error: 'YOU_BUSY' }); return }
        ack?.({ ok: false, error: 'PEER_BUSY' })
        socket.emit('call:peer-busy', { chatId })
        return
      }

      let call: Awaited<ReturnType<typeof CallsService.createCall>>
      try {
        // Запись в БД (RINGING) + участники. Partial unique index не даст создать
        // второй незавершённый звонок в том же чате (двойная защита к busy-локу).
        call = await CallsService.createCall(prisma, chatId, BigInt(userId), partnerId, media)
      } catch (e) {
        // Создание не удалось — освобождаем захваченный лок, чтобы не висел до TTL.
        await redis.del(USER_CALL(userId), USER_CALL(calleeId)).catch(() => {})
        throw e
      }

      const state: CallState = {
        callId: call.id,
        chatId,
        initiatorId: userId,
        calleeId,
        media,
        status: 'ringing',
      }
      // Перепривязываем лок к реальному callId + кладём полный state с TTL.
      await saveState(redis, state)

      const caller = call.initiator
      // Диагностика маршрутизации входящего (видно в логах realtime).
      const calleeSockets = await io.in(room(calleeId)).fetchSockets()
      console.log(`[call] invite ${call.id} ${userId}→${calleeId} media=${media} calleeSockets=${calleeSockets.length}`)
      // Получателю — входящий звонок (на все его сокеты)
      io.to(room(calleeId)).emit('call:incoming', {
        callId: call.id,
        chatId,
        media,
        from: {
          id: caller.id.toString(),
          username: caller.username,
          nickname: caller.nickname,
          avatarUrl: caller.avatarUrl,
        },
      })
      // Звонящему — подтверждение, что пошёл вызов
      socket.emit('call:ringing', { callId: call.id, chatId, media })

      // Push, если получатель офлайн
      pushIncomingCall(redis, prisma, calleeId, caller.nickname, caller.avatarUrl, media).catch(() => {})

      // Таймаут дозвона → пропущенный
      clearRingTimer(call.id)
      ringTimers.set(call.id, setTimeout(() => {
        endAndNotify(io, redis, prisma, call.id, 'missed', null).catch(() => {})
      }, RING_TIMEOUT_MS))

      ack?.({ ok: true, callId: call.id })
    } catch (err) {
      const e = err as { code?: string; message?: string }
      ack?.({ ok: false, error: e.code ?? e.message ?? 'CALL_FAILED' })
    }
  })

  // ── call:accept — получатель принял ────────────────────────
  socket.on('call:accept', async (
    payload: { callId: string },
    ack?: (res: { ok: boolean; error?: string }) => void,
  ) => {
    const state = await loadState(redis, payload.callId)
    if (!state || state.calleeId !== userId || state.status !== 'ringing') {
      ack?.({ ok: false, error: 'CALL_NOT_RINGING' }); return
    }
    clearRingTimer(state.callId)

    const updated = await CallsService.markAnswered(prisma, state.callId, BigInt(userId))
    if (!updated) { ack?.({ ok: false, error: 'CALL_NOT_RINGING' }); return }

    state.status = 'active'
    await saveState(redis, state)

    // Звонящему — что приняли; теперь он шлёт offer
    io.to(room(state.initiatorId)).emit('call:accepted', { callId: state.callId })
    // Прочим вкладкам получателя — что звонок ушёл на этом устройстве
    socket.to(room(state.calleeId)).emit('call:taken-elsewhere', { callId: state.callId })
    ack?.({ ok: true })
  })

  // ── call:decline — получатель отклонил ─────────────────────
  socket.on('call:decline', async (payload: { callId: string }) => {
    const state = await loadState(redis, payload.callId)
    if (!state || state.calleeId !== userId) return
    await endAndNotify(io, redis, prisma, state.callId, 'declined', userId)
  })

  // ── call:cancel — звонящий отменил до ответа ───────────────
  socket.on('call:cancel', async (payload: { callId: string }) => {
    const state = await loadState(redis, payload.callId)
    if (!state || state.initiatorId !== userId) return
    await endAndNotify(io, redis, prisma, state.callId, 'cancelled', userId)
  })

  // ── call:hangup — завершить активный звонок ────────────────
  socket.on('call:hangup', async (payload: { callId: string }) => {
    const state = await loadState(redis, payload.callId)
    if (!state || (state.initiatorId !== userId && state.calleeId !== userId)) return
    await endAndNotify(io, redis, prisma, state.callId, 'hangup', userId)
  })

  // ── call:failed — клиент не смог установить ICE ────────────
  socket.on('call:failed', async (payload: { callId: string }) => {
    const state = await loadState(redis, payload.callId)
    if (!state || (state.initiatorId !== userId && state.calleeId !== userId)) return
    await endAndNotify(io, redis, prisma, state.callId, 'failed', userId)
  })

  // ── call:signal — ретрансляция SDP/ICE второму пиру ────────
  // payload.data — непрозрачный для сервера объект { type, sdp } | { candidate }.
  socket.on('call:signal', async (payload: { callId: string; data: unknown }) => {
    if (!payload?.callId || payload.data == null) return
    // M-11: ограничиваем размер ретранслируемого payload (SDP редко >64КБ),
    // чтобы участник не мог гнать через шлюз произвольно большие объёмы.
    if (JSON.stringify(payload.data).length > 64 * 1024) return
    const state = await loadState(redis, payload.callId)
    if (!state) return
    const peerId =
      state.initiatorId === userId ? state.calleeId
      : state.calleeId === userId ? state.initiatorId
      : null
    if (!peerId) return
    io.to(room(peerId)).emit('call:signal', { callId: state.callId, from: userId, data: payload.data })
  })

  // ── call:media-state — mute/камера/демонстрация экрана ─────
  socket.on('call:media-state', async (
    payload: { callId: string; micOn?: boolean; camOn?: boolean; screenOn?: boolean },
  ) => {
    const state = await loadState(redis, payload.callId)
    if (!state) return
    const peerId =
      state.initiatorId === userId ? state.calleeId
      : state.calleeId === userId ? state.initiatorId
      : null
    if (!peerId) return
    io.to(room(peerId)).emit('call:media-state', {
      callId: state.callId,
      from: userId,
      micOn: payload.micOn,
      camOn: payload.camOn,
      screenOn: payload.screenOn,
    })
  })

  // ── disconnect — если пользователь был в звонке, завершаем ──
  socket.on('disconnect', async () => {
    // Если у пользователя ещё есть другие активные сокеты — звонок продолжается там.
    const sockets = await io.in(room(userId)).fetchSockets()
    if (sockets.length > 0) return

    const callId = await getUserActiveCall(redis, userId)
    if (!callId) return
    const state = await loadState(redis, callId)
    if (!state) return
    // ringing → cancelled/missed; active → hangup
    const reason = state.status === 'ringing'
      ? (state.initiatorId === userId ? 'cancelled' : 'missed')
      : 'hangup'
    await endAndNotify(io, redis, prisma, callId, reason, userId)
  })
}

/**
 * Единая точка завершения звонка: пишет финальный статус в БД, чистит Redis,
 * шлёт обеим сторонам call:ended и публикует SYSTEM-сообщение в чат.
 */
async function endAndNotify(
  io: SocketServer,
  redis: Redis,
  prisma: PrismaClient,
  callId: string,
  reason: 'hangup' | 'declined' | 'cancelled' | 'missed' | 'failed',
  byUserId: string | null,
): Promise<void> {
  clearRingTimer(callId)
  const state = await loadState(redis, callId)
  if (!state) return
  await clearState(redis, state)

  const call = await CallsService.endCall(prisma, callId, reason)
  if (!call) return

  const room = (uid: string) => `user:${uid}`
  const ended = { callId, chatId: state.chatId, reason, status: call.status, durationSec: call.durationSec, by: byUserId }
  io.to(room(state.initiatorId)).emit('call:ended', ended)
  io.to(room(state.calleeId)).emit('call:ended', ended)

  // SYSTEM-сообщение в ленту чата (как делает chat при пине)
  await writeCallSystemMessage(io, prisma, call, reason)
}

/** Пишет SYSTEM-сообщение о завершённом звонке и эмитит его в комнату чата. */
async function writeCallSystemMessage(
  io: SocketServer,
  prisma: PrismaClient,
  call: { id: string; chatId: string; initiatorId: bigint; media: CallMedia; status: string; durationSec: number },
  reason: string,
): Promise<void> {
  const mediaLabel = call.media === 'VIDEO' ? 'Видеозвонок' : 'Звонок'
  let text: string
  if (call.status === 'ENDED') {
    const m = Math.floor(call.durationSec / 60)
    const s = call.durationSec % 60
    const dur = m > 0 ? `${m} мин ${s} сек` : `${s} сек`
    text = `${mediaLabel} · ${dur}`
  } else if (call.status === 'MISSED' || call.status === 'CANCELLED') {
    text = `Пропущенный ${mediaLabel.toLowerCase()}`
  } else if (call.status === 'DECLINED') {
    text = `${mediaLabel} отклонён`
  } else {
    text = `${mediaLabel} не состоялся`
  }

  try {
    const message = await prisma.message.create({
      data: {
        id: ulid(),
        chatId: call.chatId,
        senderId: call.initiatorId,
        type: 'SYSTEM',
        content: text,
      },
      include: {
        sender: { select: { id: true, username: true, nickname: true, avatarUrl: true } },
        attachments: true,
        reactions: { include: { user: true } },
        replyTo: { include: { sender: true } },
      },
    })

    // Сериализуем в тот же формат, что и chat.service (минимально необходимый).
    io.to(`chat:${call.chatId}`).emit('message_new', {
      id: message.id,
      chatId: message.chatId,
      content: message.content,
      type: message.type,
      createdAt: message.createdAt,
      editedAt: null,
      pinnedAt: null,
      replyTo: null,
      sender: {
        id: message.sender.id.toString(),
        username: message.sender.username,
        nickname: message.sender.nickname,
        avatarUrl: message.sender.avatarUrl,
      },
      attachments: [],
      reactions: [],
    })
  } catch { /* лог сообщения о звонке некритичен для самого звонка */ }
}
