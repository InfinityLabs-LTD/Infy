import { PrismaClient, MessageType, Prisma } from '@prisma/client'
import { Readable } from 'stream'
import * as Minio from 'minio'
import { ulid } from 'ulid'
import { AppError, Errors } from '../../lib/errors.js'
import { getActiveSanction } from '../../lib/sanctions.js'
import { getSttConfig } from '../../lib/aiSettings.js'
import { transcribeAudio } from '../../lib/transcribe.js'
import { env } from '../../lib/env.js'

// Человекочитаемое сообщение о муте.
function muteMessage(reason: string, expiresAt: Date | null): string {
  if (expiresAt) {
    const until = expiresAt.toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
    return `Вы не можете отправлять сообщения до ${until}. Причина: ${reason}`
  }
  return `Вы не можете отправлять сообщения. Причина: ${reason}`
}

// Максимум разных реакций от одного пользователя на одно сообщение
const MAX_REACTIONS_PER_USER = 3

// Общий include для полной сериализации сообщения (с автором, вложениями,
// реакциями и кратким превью сообщения-ответа).
const messageInclude = {
  sender: true,
  attachments: true,
  reactions: { include: { user: true } },
  replyTo: { include: { sender: true } },
} satisfies Prisma.MessageInclude

export interface AttachmentInput {
  storageKey: string
  fileName?: string
  thumbnailKey?: string
  mimeType: string
  sizeBytes: number
  width?: number
  height?: number
  durationMs?: number
  waveform?: number[]
}

export interface SendMessageInput {
  content?: string
  type?: MessageType
  attachment?: AttachmentInput          // одиночное вложение (обратная совместимость)
  attachments?: AttachmentInput[]       // альбом: несколько вложений
  replyToId?: string
  // Идемпотентный ключ от клиента: повтор с тем же ключом не создаёт дубль.
  clientMessageId?: string
}

const MAX_ALBUM_ATTACHMENTS = 10

// Тип одиночного вложения по mime: image → IMAGE, video → VIDEO, audio → AUDIO, иначе FILE
function attachmentMessageType(a: AttachmentInput): MessageType {
  if (a.mimeType.startsWith('image/')) return 'IMAGE'
  if (a.mimeType.startsWith('video/')) return 'VIDEO'
  if (a.mimeType.startsWith('audio/')) return 'AUDIO'
  return 'FILE'
}

export async function getOrCreateDirectChat(
  prisma: PrismaClient,
  userId: bigint,
  partnerId: bigint,
) {
  if (userId === partnerId) {
    throw new AppError('CHAT_SELF', 'Cannot create chat with yourself', 400)
  }

  // Check partner exists
  const partner = await prisma.user.findUnique({ where: { id: partnerId } })
  if (!partner) throw new AppError('USER_NOT_FOUND', 'User not found', 404)

  const chatInclude = {
    members: { include: { user: true } },
    messages: {
      where: { deletedAt: null },
      orderBy: { id: 'desc' as const },
      take: 1,
    },
  }

  // Find existing direct chat between the two
  const existing = await prisma.chat.findFirst({
    where: {
      type: 'DIRECT',
      members: { every: { userId: { in: [userId, partnerId] } } },
      AND: [
        { members: { some: { userId } } },
        { members: { some: { userId: partnerId } } },
      ],
    },
    include: chatInclude,
  })

  if (existing) return existing

  // Create new chat + add both members
  return prisma.chat.create({
    data: {
      type: 'DIRECT',
      members: {
        create: [{ userId }, { userId: partnerId }],
      },
    },
    include: chatInclude,
  })
}

export async function listChats(prisma: PrismaClient, userId: bigint) {
  const [memberships, unreadRows] = await Promise.all([
    prisma.chatMember.findMany({
      where: { userId },
      include: {
        chat: {
          include: {
            members: { include: { user: true } },
            messages: {
              where: { deletedAt: null },
              orderBy: { id: 'desc' },
              take: 1,
            },
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
    }),
    prisma.$queryRaw<{ chatId: string; count: number }[]>`
      SELECT cm."chatId", CAST(COUNT(m.id) AS INTEGER) as count
      FROM chat_members cm
      LEFT JOIN messages m ON
        m."chatId" = cm."chatId"
        AND m."senderId" != ${userId}
        AND m."deletedAt" IS NULL
        AND (cm."lastReadMessageId" IS NULL OR m.id > cm."lastReadMessageId")
      WHERE cm."userId" = ${userId}
      GROUP BY cm."chatId"
    `,
  ])

  const unreadMap: Record<string, number> = {}
  for (const r of unreadRows) unreadMap[r.chatId] = Number(r.count)

  return memberships.map(m => serializeChat(m.chat, userId, unreadMap[m.chat.id] ?? 0))
}

// Один чат в том же формате, что и listChats (с partner, lastMessage, unread).
// Используется фронтендом, когда пришло сообщение в чат, которого ещё нет
// в локальном списке (новый диалог) — чтобы добавить его без перезагрузки.
export async function getChat(prisma: PrismaClient, chatId: string, userId: bigint) {
  const membership = await prisma.chatMember.findUnique({
    where: { chatId_userId: { chatId, userId } },
    include: {
      chat: {
        include: {
          members: { include: { user: true } },
          messages: {
            where: { deletedAt: null },
            orderBy: { id: 'desc' },
            take: 1,
          },
        },
      },
    },
  })
  if (!membership) throw new AppError('CHAT_NOT_MEMBER', 'You are not a member of this chat', 403)

  const unread = await prisma.$queryRaw<{ count: number }[]>`
    SELECT CAST(COUNT(m.id) AS INTEGER) as count
    FROM chat_members cm
    LEFT JOIN messages m ON
      m."chatId" = cm."chatId"
      AND m."senderId" != ${userId}
      AND m."deletedAt" IS NULL
      AND (cm."lastReadMessageId" IS NULL OR m.id > cm."lastReadMessageId")
    WHERE cm."chatId" = ${chatId} AND cm."userId" = ${userId}
  `
  return serializeChat(membership.chat, userId, Number(unread[0]?.count ?? 0))
}

export async function markAsRead(
  prisma: PrismaClient,
  chatId: string,
  userId: bigint,
  messageId: string,
) {
  const now = new Date()
  await prisma.$executeRaw`
    UPDATE chat_members
    SET "lastReadMessageId" = ${messageId}, "lastReadAt" = ${now}
    WHERE "chatId" = ${chatId}
      AND "userId" = ${userId}
      AND ("lastReadMessageId" IS NULL OR "lastReadMessageId" < ${messageId})
  `
  return now.toISOString()
}

export async function getMessages(
  prisma: PrismaClient,
  chatId: string,
  userId: bigint,
  cursor?: string,
  limit = 50,
) {
  // Verify membership
  const member = await prisma.chatMember.findUnique({
    where: { chatId_userId: { chatId, userId } },
  })
  if (!member) throw new AppError('CHAT_NOT_MEMBER', 'You are not a member of this chat', 403)

  const messages = await prisma.message.findMany({
    where: {
      chatId,
      deletedAt: null,
      ...(cursor ? { id: { lt: cursor } } : {}),
    },
    include: messageInclude,
    orderBy: { id: 'desc' },
    take: limit + 1,
  })

  const hasMore = messages.length > limit
  if (hasMore) messages.pop()

  return {
    messages: messages.reverse().map(serializeMessage),
    nextCursor: hasMore ? messages[0]?.id ?? null : null,
  }
}

// Поиск по тексту сообщений во всех чатах пользователя.
// Возвращает совпавшие сообщения вместе с партнёром по диалогу, чтобы фронт
// мог показать «в каком чате» и перейти в него.
export async function searchMessages(
  prisma: PrismaClient,
  userId: bigint,
  query: string,
  limit = 30,
) {
  const q = query.trim()
  if (q.length < 2) return []

  // Чаты, где пользователь состоит — поиск только по ним.
  const memberships = await prisma.chatMember.findMany({
    where: { userId },
    select: { chatId: true },
  })
  const chatIds = memberships.map(m => m.chatId)
  if (chatIds.length === 0) return []

  const messages = await prisma.message.findMany({
    where: {
      chatId: { in: chatIds },
      deletedAt: null,
      type: 'TEXT',
      content: { contains: q, mode: 'insensitive' },
    },
    include: {
      sender: true,
      chat: { include: { members: { include: { user: true } } } },
    },
    orderBy: { id: 'desc' },
    take: limit,
  })

  return messages.map(m => {
    const partner = m.chat.members.find(mem => mem.user.id !== userId)?.user
    return {
      messageId: m.id,
      chatId: m.chatId,
      content: m.content,
      createdAt: m.createdAt,
      isOwn: m.senderId === userId,
      partner: partner
        ? {
            id: partner.id.toString(),
            username: partner.username,
            nickname: partner.nickname,
            avatarUrl: partner.avatarUrl,
          }
        : null,
    }
  })
}

export async function sendMessage(
  prisma: PrismaClient,
  chatId: string,
  senderId: bigint,
  input: SendMessageInput,
) {
  const member = await prisma.chatMember.findUnique({
    where: { chatId_userId: { chatId, userId: senderId } },
  })
  if (!member) throw new AppError('CHAT_NOT_MEMBER', 'You are not a member of this chat', 403)

  // Мут запрещает отправку сообщений (бан — тоже, на случай ещё валидного токена).
  const mute = await getActiveSanction(prisma, senderId, 'MUTE')
  if (mute) throw Errors.ACCOUNT_MUTED(muteMessage(mute.reason, mute.expiresAt), mute.expiresAt)
  const ban = await getActiveSanction(prisma, senderId, 'BAN')
  if (ban) throw Errors.ACCOUNT_BANNED('Аккаунт заблокирован', ban.expiresAt)

  // Нормализуем вход: одиночное вложение и массив — к единому списку
  const attList: AttachmentInput[] = input.attachments?.length
    ? input.attachments
    : input.attachment
      ? [input.attachment]
      : []

  if (!input.content && attList.length === 0) {
    throw new AppError('MESSAGE_EMPTY', 'Message must have content or an attachment', 400)
  }
  if (attList.length > MAX_ALBUM_ATTACHMENTS) {
    throw new AppError('ATTACHMENT_LIMIT', `Maximum ${MAX_ALBUM_ATTACHMENTS} attachments per message`, 400)
  }

  // Проверяем, что отвечаем на существующее сообщение из этого же чата
  if (input.replyToId) {
    const parent = await prisma.message.findUnique({ where: { id: input.replyToId } })
    if (!parent || parent.deletedAt || parent.chatId !== chatId) {
      throw new AppError('REPLY_TARGET_INVALID', 'Reply target not found in this chat', 400)
    }
  }

  // Тип сообщения: явно заданный, либо выводим из числа/типа вложений
  const resolvedType: MessageType =
    input.type ??
    (attList.length > 1 ? 'ALBUM' : attList.length === 1 ? attachmentMessageType(attList[0]) : 'TEXT')

  // Идемпотентность: если клиент передал clientMessageId и сообщение с такой
  // парой (chatId, clientMessageId) уже есть — это повтор (ретрай после потери
  // ответа). Возвращаем существующее сообщение, не создавая дубль.
  if (input.clientMessageId) {
    const dup = await prisma.message.findUnique({
      where: { chatId_clientMessageId: { chatId, clientMessageId: input.clientMessageId } },
      include: messageInclude,
    })
    if (dup) return serializeMessage(dup)
  }

  const id = ulid()
  let message
  try {
    message = await prisma.message.create({
      data: {
        id,
        chatId,
        senderId,
        content: input.content ?? null,
        type: resolvedType,
        replyToId: input.replyToId ?? null,
        clientMessageId: input.clientMessageId ?? null,
        ...(attList.length
          ? {
              attachments: {
                create: attList.map(a => ({
                  storageKey:   a.storageKey,
                  fileName:     a.fileName,
                  thumbnailKey: a.thumbnailKey,
                  mimeType:     a.mimeType,
                  sizeBytes:    BigInt(a.sizeBytes),
                  width:        a.width,
                  height:       a.height,
                  durationMs:   a.durationMs,
                  waveform:     a.waveform ?? undefined,
                })),
              },
            }
          : {}),
      },
      include: messageInclude,
    })
  } catch (e) {
    // Гонка двух параллельных ретраев с одним ключом: один выиграл вставку,
    // второй получил unique-конфликт (P2002) — возвращаем уже созданное.
    if (
      input.clientMessageId &&
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === 'P2002'
    ) {
      const dup = await prisma.message.findUnique({
        where: { chatId_clientMessageId: { chatId, clientMessageId: input.clientMessageId } },
        include: messageInclude,
      })
      if (dup) return serializeMessage(dup)
    }
    throw e
  }

  return serializeMessage(message)
}

export async function toggleReaction(
  prisma: PrismaClient,
  messageId: string,
  userId: bigint,
  emoji: string,
) {
  const msg = await prisma.message.findUnique({
    where: { id: messageId },
    include: { chat: { include: { members: true } } },
  })
  if (!msg || msg.deletedAt) throw new AppError('MESSAGE_NOT_FOUND', 'Message not found', 404)
  const isMember = msg.chat.members.some(m => m.userId === userId)
  if (!isMember) throw new AppError('CHAT_NOT_MEMBER', 'Not a member', 403)

  const existing = await prisma.messageReaction.findUnique({
    where: { messageId_userId_emoji: { messageId, userId, emoji } },
  })

  if (existing) {
    await prisma.messageReaction.delete({ where: { id: existing.id } })
  } else {
    // Лимит: не более 3 разных реакций от одного пользователя на сообщение
    const myCount = await prisma.messageReaction.count({ where: { messageId, userId } })
    if (myCount >= MAX_REACTIONS_PER_USER) {
      throw new AppError('REACTION_LIMIT', `Maximum ${MAX_REACTIONS_PER_USER} reactions per message`, 409)
    }
    await prisma.messageReaction.create({ data: { messageId, userId, emoji } })
  }

  const updated = await prisma.message.findUnique({
    where: { id: messageId },
    include: messageInclude,
  })

  return serializeMessage(updated!)
}

// Читает объект MinIO целиком в буфер.
async function readObject(minio: Minio.Client, bucket: string, key: string): Promise<Buffer> {
  const stream = await minio.getObject(bucket, key)
  const chunks: Buffer[] = []
  for await (const chunk of stream as Readable) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

// Распознаёт речь в голосовом сообщении или кружке и сохраняет результат на
// вложении (кэш). Повторный вызов вернёт уже сохранённый текст.
export async function transcribeMessageAudio(
  prisma: PrismaClient,
  minio: Minio.Client,
  messageId: string,
  userId: bigint,
) {
  const msg = await prisma.message.findUnique({
    where: { id: messageId },
    include: { chat: { include: { members: true } }, attachments: true },
  })
  if (!msg || msg.deletedAt) throw new AppError('MESSAGE_NOT_FOUND', 'Message not found', 404)
  if (!msg.chat.members.some(m => m.userId === userId)) {
    throw new AppError('CHAT_NOT_MEMBER', 'Not a member', 403)
  }
  if (msg.type !== 'AUDIO' && msg.type !== 'CIRCLE_VIDEO') {
    throw new AppError('TRANSCRIBE_UNSUPPORTED', 'Сообщение не содержит голосовой записи', 400)
  }

  const att = msg.attachments[0]
  if (!att) throw new AppError('MESSAGE_NOT_FOUND', 'Вложение не найдено', 404)

  // Уже распознано — отдаём из кэша.
  if (att.transcript != null && att.transcript !== '') {
    return serializeMessageById(prisma, messageId)
  }

  const stt = await getSttConfig(prisma)
  if (!stt.apiKey) {
    throw new AppError('TRANSCRIBE_DISABLED', 'Распознавание речи недоступно: не настроен ключ OpenAI', 503)
  }

  const bucket = env.MINIO_BUCKET_MEDIA
  let buffer: Buffer
  try {
    buffer = await readObject(minio, bucket, att.storageKey)
  } catch {
    throw new AppError('TRANSCRIBE_FAILED', 'Не удалось прочитать файл записи', 500)
  }

  const fileName = att.fileName ?? (msg.type === 'CIRCLE_VIDEO' ? 'circle.mp4' : 'audio.opus')
  let text: string
  try {
    text = await transcribeAudio(stt, buffer, fileName, att.mimeType)
  } catch (e) {
    throw new AppError('TRANSCRIBE_FAILED', `Ошибка распознавания: ${e instanceof Error ? e.message : 'неизвестно'}`, 502)
  }

  const result = text || '(речь не распознана)'
  await prisma.attachment.update({ where: { id: att.id }, data: { transcript: result } })

  return serializeMessageById(prisma, messageId)
}

// Перечитывает сообщение с полным include и сериализует.
async function serializeMessageById(prisma: PrismaClient, messageId: string) {
  const updated = await prisma.message.findUnique({
    where: { id: messageId },
    include: messageInclude,
  })
  return serializeMessage(updated!)
}

export async function getChatMedia(
  prisma: PrismaClient,
  chatId: string,
  userId: bigint,
  cursor?: string,
  limit = 30,
) {
  const member = await prisma.chatMember.findUnique({
    where: { chatId_userId: { chatId, userId } },
  })
  if (!member) throw new AppError('CHAT_NOT_MEMBER', 'You are not a member of this chat', 403)

  const messages = await prisma.message.findMany({
    where: {
      chatId,
      deletedAt: null,
      type: { in: ['IMAGE', 'VIDEO', 'AUDIO', 'CIRCLE_VIDEO', 'ALBUM', 'FILE'] },
      ...(cursor ? { id: { lt: cursor } } : {}),
    },
    include: { sender: true, attachments: true },
    orderBy: { id: 'desc' },
    take: limit + 1,
  })

  const hasMore = messages.length > limit
  if (hasMore) messages.pop()

  return {
    messages: messages.map(serializeMessage),
    nextCursor: hasMore ? messages.at(-1)?.id ?? null : null,
  }
}

export async function editMessage(
  prisma: PrismaClient,
  messageId: string,
  userId: bigint,
  content: string,
) {
  const msg = await prisma.message.findUnique({ where: { id: messageId } })
  if (!msg || msg.deletedAt) throw new AppError('MESSAGE_NOT_FOUND', 'Message not found', 404)
  if (msg.senderId !== userId) throw new AppError('MESSAGE_FORBIDDEN', 'Cannot edit another user\'s message', 403)
  if (msg.type !== 'TEXT') throw new AppError('MESSAGE_NOT_EDITABLE', 'Only text messages can be edited', 400)

  const updated = await prisma.message.update({
    where: { id: messageId },
    data: { content, editedAt: new Date() },
    include: messageInclude,
  })

  return serializeMessage(updated)
}

// Закрепить/открепить сообщение. В прямом чате закреплённое — одно:
// при закреплении нового открепляем все предыдущие.
export async function togglePin(
  prisma: PrismaClient,
  messageId: string,
  userId: bigint,
) {
  const msg = await prisma.message.findUnique({
    where: { id: messageId },
    include: { chat: { include: { members: true } } },
  })
  if (!msg || msg.deletedAt) throw new AppError('MESSAGE_NOT_FOUND', 'Message not found', 404)
  if (!msg.chat.members.some(m => m.userId === userId)) {
    throw new AppError('CHAT_NOT_MEMBER', 'Not a member', 403)
  }

  const willPin = !msg.pinnedAt
  if (willPin) {
    // Открепляем все остальные закреплённые в этом чате
    await prisma.message.updateMany({
      where: { chatId: msg.chatId, pinnedAt: { not: null }, id: { not: messageId } },
      data: { pinnedAt: null },
    })
  }

  const updated = await prisma.message.update({
    where: { id: messageId },
    data: { pinnedAt: willPin ? new Date() : null },
    include: messageInclude,
  })

  // Системное сообщение-уведомление для обоих участников
  const actor = await prisma.user.findUnique({ where: { id: userId }, select: { nickname: true } })
  const actorName = actor?.nickname ?? 'Пользователь'
  const systemMessage = await prisma.message.create({
    data: {
      id: ulid(),
      chatId: msg.chatId,
      senderId: userId,
      type: 'SYSTEM',
      content: willPin
        ? `${actorName} закрепил(а) сообщение`
        : `${actorName} открепил(а) сообщение`,
    },
    include: messageInclude,
  })

  return {
    message: serializeMessage(updated),
    systemMessage: serializeMessage(systemMessage),
  }
}

// Текущее закреплённое сообщение чата (или null)
export async function getPinnedMessage(
  prisma: PrismaClient,
  chatId: string,
  userId: bigint,
) {
  const member = await prisma.chatMember.findUnique({
    where: { chatId_userId: { chatId, userId } },
  })
  if (!member) throw new AppError('CHAT_NOT_MEMBER', 'You are not a member of this chat', 403)

  const msg = await prisma.message.findFirst({
    where: { chatId, deletedAt: null, pinnedAt: { not: null } },
    include: messageInclude,
    orderBy: { pinnedAt: 'desc' },
  })
  return msg ? serializeMessage(msg) : null
}

export async function deleteMessage(
  prisma: PrismaClient,
  messageId: string,
  userId: bigint,
) {
  const msg = await prisma.message.findUnique({ where: { id: messageId } })
  if (!msg || msg.deletedAt) throw new AppError('MESSAGE_NOT_FOUND', 'Message not found', 404)
  if (msg.senderId !== userId) throw new AppError('MESSAGE_FORBIDDEN', 'Cannot delete another user\'s message', 403)

  await prisma.message.update({
    where: { id: messageId },
    data: { deletedAt: new Date() },
  })

  return { id: messageId, chatId: msg.chatId }
}

// Полностью удалить прямой чат для обоих участников.
// Удаляются сообщения, вложения, реакции, события календаря и сам чат.
export async function deleteChat(
  prisma: PrismaClient,
  chatId: string,
  userId: bigint,
) {
  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    include: { members: true },
  })
  if (!chat) throw new AppError('CHAT_NOT_FOUND', 'Chat not found', 404)
  if (!chat.members.some(m => m.userId === userId)) {
    throw new AppError('CHAT_NOT_MEMBER', 'You are not a member of this chat', 403)
  }

  const memberIds = chat.members.map(m => m.userId.toString())

  // Удаляем сам чат — связанные записи уходят каскадно по схеме Prisma.
  await prisma.chat.delete({ where: { id: chatId } })

  return { id: chatId, memberIds }
}

// ── Serializers ──────────────────────────────────────────────

type ChatWithMembers = {
  id: string
  type: string
  createdAt: Date
  members: Array<{
    lastReadMessageId: string | null
    lastReadAt?: Date | null
    user: {
      id: bigint
      username: string
      nickname: string
      avatarUrl: string | null
      lastSeenAt: Date
    }
  }>
  messages: Array<{
    id: string
    content: string | null
    type: string
    createdAt: Date
    senderId: bigint
  }>
}

export function serializeChat(chat: ChatWithMembers, viewerId: bigint, unreadCount = 0) {
  const partner = chat.members.find(m => m.user.id !== viewerId)?.user
  const partnerMember = chat.members.find(m => m.user.id !== viewerId)
  const lastMessage = chat.messages[0] ?? null

  return {
    id: chat.id,
    type: chat.type,
    partner: partner
      ? {
          id: partner.id.toString(),
          username: partner.username,
          nickname: partner.nickname,
          avatarUrl: partner.avatarUrl,
          lastSeenAt: partner.lastSeenAt,
        }
      : null,
    lastMessage: lastMessage
      ? {
          id: lastMessage.id,
          content: lastMessage.content,
          type: lastMessage.type,
          createdAt: lastMessage.createdAt,
          isOwn: lastMessage.senderId === viewerId,
        }
      : null,
    unreadCount,
    partnerLastReadMessageId: partnerMember?.lastReadMessageId ?? null,
    partnerReadAt: partnerMember?.lastReadAt ?? null,
    createdAt: chat.createdAt,
  }
}

type MessageWithSender = {
  id: string
  chatId: string
  content: string | null
  type: string
  createdAt: Date
  editedAt: Date | null
  deletedAt: Date | null
  pinnedAt?: Date | null
  replyToId?: string | null
  clientMessageId?: string | null
  replyTo?: {
    id: string
    content: string | null
    type: string
    deletedAt: Date | null
    sender: { id: bigint; nickname: string }
  } | null
  sender: {
    id: bigint
    username: string
    nickname: string
    avatarUrl: string | null
  }
  attachments?: Array<{
    id: string
    storageKey: string
    fileName: string | null
    thumbnailKey: string | null
    mimeType: string
    sizeBytes: bigint | null
    width: number | null
    height: number | null
    durationMs: number | null
    waveform: unknown
    transcript?: string | null
  }>
  reactions?: Array<{
    id: string
    emoji: string
    userId: bigint
    user: { id: bigint; username: string; nickname: string }
  }>
}

export function serializeMessage(msg: MessageWithSender) {
  // Group reactions by emoji: { emoji → { count, userIds[] } }
  const reactionsMap: Record<string, { emoji: string; count: number; userIds: string[] }> = {}
  for (const r of msg.reactions ?? []) {
    if (!reactionsMap[r.emoji]) reactionsMap[r.emoji] = { emoji: r.emoji, count: 0, userIds: [] }
    reactionsMap[r.emoji].count++
    reactionsMap[r.emoji].userIds.push(r.userId.toString())
  }

  return {
    id: msg.id,
    chatId: msg.chatId,
    content: msg.content,
    type: msg.type,
    createdAt: msg.createdAt,
    editedAt: msg.editedAt,
    pinnedAt: msg.pinnedAt ?? null,
    clientMessageId: msg.clientMessageId ?? null,
    replyTo: msg.replyTo
      ? {
          id: msg.replyTo.id,
          content: msg.replyTo.deletedAt ? null : msg.replyTo.content,
          type: msg.replyTo.type,
          deleted: !!msg.replyTo.deletedAt,
          sender: {
            id: msg.replyTo.sender.id.toString(),
            nickname: msg.replyTo.sender.nickname,
          },
        }
      : null,
    sender: {
      id: msg.sender.id.toString(),
      username: msg.sender.username,
      nickname: msg.sender.nickname,
      avatarUrl: msg.sender.avatarUrl,
    },
    attachments: (msg.attachments ?? []).map(a => ({
      id: a.id,
      storageKey: a.storageKey,
      fileName: a.fileName,
      thumbnailKey: a.thumbnailKey,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes ? Number(a.sizeBytes) : null,
      width: a.width,
      height: a.height,
      durationMs: a.durationMs,
      waveform: a.waveform,
      transcript: a.transcript ?? null,
      listenedAt: a.listenedAt ?? null,
    })),
    reactions: Object.values(reactionsMap),
  }
}

// Отмечает голосовое сообщение / кружок прослушанным собеседником.
// Вызывается только получателем (не отправителем). Idempotent.
export async function markVoiceListened(
  prisma: PrismaClient,
  messageId: string,
  userId: bigint,
): Promise<{ chatId: string; messageId: string; listenedAt: string }> {
  const msg = await prisma.message.findUnique({
    where: { id: messageId },
    include: { chat: { include: { members: true } }, attachments: true },
  })
  if (!msg || msg.deletedAt) throw new AppError('MESSAGE_NOT_FOUND', 'Message not found', 404)
  if (!msg.chat.members.some(m => m.userId === userId)) {
    throw new AppError('CHAT_NOT_MEMBER', 'Not a member', 403)
  }
  if (msg.type !== 'AUDIO' && msg.type !== 'CIRCLE_VIDEO') {
    throw new AppError('TRANSCRIBE_UNSUPPORTED', 'Не голосовое сообщение / кружок', 400)
  }
  // Отправитель не должен сам себе ставить listenedAt
  if (msg.senderId === userId) {
    throw new AppError('MESSAGE_NOT_FOUND', 'Нельзя отметить собственное сообщение прослушанным', 400)
  }

  const att = msg.attachments[0]
  if (!att) throw new AppError('MESSAGE_NOT_FOUND', 'Вложение не найдено', 404)

  const now = att.listenedAt ?? new Date()
  if (!att.listenedAt) {
    await prisma.attachment.update({ where: { id: att.id }, data: { listenedAt: now } })
  }

  return { chatId: msg.chatId, messageId, listenedAt: now.toISOString() }
}
