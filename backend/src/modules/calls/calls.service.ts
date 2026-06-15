import { PrismaClient, CallMedia, CallStatus, Prisma } from '@prisma/client'
import { ulid } from 'ulid'
import { AppError } from '../../lib/errors.js'

// Статусы, означающие, что звонок уже завершён (повторно завершать нельзя).
const TERMINAL: CallStatus[] = ['ENDED', 'MISSED', 'DECLINED', 'CANCELLED', 'FAILED']

const callInclude = {
  initiator: { select: { id: true, username: true, nickname: true, avatarUrl: true } },
  participants: {
    include: { user: { select: { id: true, username: true, nickname: true, avatarUrl: true } } },
  },
} satisfies Prisma.CallSessionInclude

type CallWithRelations = Prisma.CallSessionGetPayload<{ include: typeof callInclude }>

/**
 * Проверяет членство пользователя в чате и для DIRECT-чата возвращает id партнёра.
 * Для звонков 1:1 партнёр — единственный другой участник.
 */
export async function resolveDirectCallTarget(
  prisma: PrismaClient,
  chatId: string,
  callerId: bigint,
): Promise<{ partnerId: bigint }> {
  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    include: { members: { select: { userId: true } } },
  })
  if (!chat) throw new AppError('CHAT_NOT_FOUND', 'Chat not found', 404)
  if (chat.type !== 'DIRECT') {
    throw new AppError('CALL_GROUP_UNSUPPORTED', 'Group calls are not yet supported', 400)
  }
  const isMember = chat.members.some(m => m.userId === callerId)
  if (!isMember) throw new AppError('CHAT_NOT_MEMBER', 'You are not a member of this chat', 403)

  const partner = chat.members.find(m => m.userId !== callerId)
  if (!partner) throw new AppError('CALL_NO_PARTNER', 'No call partner in this chat', 400)
  return { partnerId: partner.userId }
}

/**
 * Создаёт новую сессию звонка в статусе RINGING с двумя участниками.
 * Бросает CALL_ALREADY_ACTIVE, если в этом чате уже есть незавершённый звонок —
 * защита от двойного звонка/гонок.
 */
export async function createCall(
  prisma: PrismaClient,
  chatId: string,
  initiatorId: bigint,
  partnerId: bigint,
  media: CallMedia,
): Promise<CallWithRelations> {
  const existing = await prisma.callSession.findFirst({
    where: { chatId, status: { in: ['RINGING', 'ACTIVE'] } },
  })
  if (existing) throw new AppError('CALL_ALREADY_ACTIVE', 'A call is already in progress in this chat', 409)

  return prisma.callSession.create({
    data: {
      id: ulid(),
      chatId,
      initiatorId,
      media,
      status: 'RINGING',
      participants: {
        create: [{ userId: initiatorId }, { userId: partnerId }],
      },
    },
    include: callInclude,
  })
}

/** Помечает звонок принятым: RINGING → ACTIVE, фиксирует joinedAt получателя. */
export async function markAnswered(
  prisma: PrismaClient,
  callId: string,
  userId: bigint,
): Promise<CallWithRelations | null> {
  const call = await prisma.callSession.findUnique({ where: { id: callId } })
  if (!call || call.status !== 'RINGING') return null

  const now = new Date()
  await prisma.$transaction([
    prisma.callSession.update({
      where: { id: callId },
      data: { status: 'ACTIVE', answeredAt: now },
    }),
    prisma.callParticipant.updateMany({
      where: { callId, userId, joinedAt: null },
      data: { joinedAt: now },
    }),
  ])

  return prisma.callSession.findUnique({ where: { id: callId }, include: callInclude })
}

/**
 * Завершает звонок. Итоговый статус зависит от того, был ли он принят:
 *  - был ACTIVE         → ENDED (+ длительность)
 *  - отклонён получателем → DECLINED
 *  - отменён звонящим / таймаут → CANCELLED / MISSED
 * Идемпотентна: повторный вызов на уже завершённом звонке вернёт его как есть.
 */
export async function endCall(
  prisma: PrismaClient,
  callId: string,
  reason: 'hangup' | 'declined' | 'cancelled' | 'missed' | 'failed',
): Promise<CallWithRelations | null> {
  const call = await prisma.callSession.findUnique({ where: { id: callId } })
  if (!call) return null
  if (TERMINAL.includes(call.status)) {
    return prisma.callSession.findUnique({ where: { id: callId }, include: callInclude })
  }

  const now = new Date()
  const wasActive = call.status === 'ACTIVE'
  const durationSec = wasActive && call.answeredAt
    ? Math.max(0, Math.round((now.getTime() - call.answeredAt.getTime()) / 1000))
    : 0

  let status: CallStatus
  if (wasActive) status = 'ENDED'
  else if (reason === 'declined') status = 'DECLINED'
  else if (reason === 'failed') status = 'FAILED'
  else if (reason === 'missed') status = 'MISSED'
  else status = 'CANCELLED'

  await prisma.$transaction([
    prisma.callSession.update({
      where: { id: callId },
      data: { status, endedAt: now, durationSec },
    }),
    prisma.callParticipant.updateMany({
      where: { callId, leftAt: null },
      data: { leftAt: now },
    }),
  ])

  return prisma.callSession.findUnique({ where: { id: callId }, include: callInclude })
}

/** История звонков пользователя (по всем его чатам), курсорная пагинация по createdAt. */
export async function listCallHistory(
  prisma: PrismaClient,
  userId: bigint,
  cursor?: string,
  limit = 30,
) {
  const calls = await prisma.callSession.findMany({
    where: { participants: { some: { userId } } },
    include: callInclude,
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
  })

  const hasMore = calls.length > limit
  if (hasMore) calls.pop()

  return {
    calls: calls.map(c => serializeCall(c, userId)),
    nextCursor: hasMore ? calls.at(-1)?.id ?? null : null,
  }
}

export function serializeCall(call: CallWithRelations, viewerId: bigint) {
  const isIncoming = call.initiatorId !== viewerId
  const other = call.participants.find(p => p.user.id !== viewerId)?.user
    ?? call.initiator
  // missed с точки зрения зрителя: входящий, оставшийся без ответа
  const wasMissed = isIncoming && (call.status === 'MISSED' || call.status === 'CANCELLED')

  return {
    id: call.id,
    chatId: call.chatId,
    media: call.media,
    status: call.status,
    direction: isIncoming ? 'incoming' : 'outgoing',
    missed: wasMissed,
    durationSec: call.durationSec,
    createdAt: call.createdAt.toISOString(),
    answeredAt: call.answeredAt?.toISOString() ?? null,
    endedAt: call.endedAt?.toISOString() ?? null,
    peer: {
      id: other.id.toString(),
      username: other.username,
      nickname: other.nickname,
      avatarUrl: other.avatarUrl,
    },
  }
}
