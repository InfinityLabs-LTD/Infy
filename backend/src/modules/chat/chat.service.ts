import { PrismaClient, MessageType } from '@prisma/client'
import { ulid } from 'ulid'
import { AppError } from '../../lib/errors.js'

export interface AttachmentInput {
  storageKey: string
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
  attachment?: AttachmentInput
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

export async function markAsRead(
  prisma: PrismaClient,
  chatId: string,
  userId: bigint,
  messageId: string,
) {
  await prisma.$executeRaw`
    UPDATE chat_members
    SET "lastReadMessageId" = ${messageId}
    WHERE "chatId" = ${chatId}
      AND "userId" = ${userId}
      AND ("lastReadMessageId" IS NULL OR "lastReadMessageId" < ${messageId})
  `
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
    include: { sender: true, attachments: true },
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

  if (!input.content && !input.attachment) {
    throw new AppError('MESSAGE_EMPTY', 'Message must have content or an attachment', 400)
  }

  const id = ulid()
  const message = await prisma.message.create({
    data: {
      id,
      chatId,
      senderId,
      content: input.content ?? null,
      type: input.type ?? 'TEXT',
      ...(input.attachment
        ? {
            attachments: {
              create: {
                storageKey:   input.attachment.storageKey,
                thumbnailKey: input.attachment.thumbnailKey,
                mimeType:     input.attachment.mimeType,
                sizeBytes:    BigInt(input.attachment.sizeBytes),
                width:        input.attachment.width,
                height:       input.attachment.height,
                durationMs:   input.attachment.durationMs,
                waveform:     input.attachment.waveform ?? undefined,
              },
            },
          }
        : {}),
    },
    include: { sender: true, attachments: true },
  })

  return serializeMessage(message)
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
      type: { not: 'TEXT' },
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

  const updated = await prisma.message.update({
    where: { id: messageId },
    data: { content, editedAt: new Date() },
    include: { sender: true, attachments: true },
  })

  return serializeMessage(updated)
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

// ── Serializers ──────────────────────────────────────────────

type ChatWithMembers = {
  id: string
  type: string
  createdAt: Date
  members: Array<{
    lastReadMessageId: string | null
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
  sender: {
    id: bigint
    username: string
    nickname: string
    avatarUrl: string | null
  }
  attachments?: Array<{
    id: string
    storageKey: string
    thumbnailKey: string | null
    mimeType: string
    sizeBytes: bigint | null
    width: number | null
    height: number | null
    durationMs: number | null
    waveform: unknown
  }>
}

export function serializeMessage(msg: MessageWithSender) {
  return {
    id: msg.id,
    chatId: msg.chatId,
    content: msg.content,
    type: msg.type,
    createdAt: msg.createdAt,
    editedAt: msg.editedAt,
    sender: {
      id: msg.sender.id.toString(),
      username: msg.sender.username,
      nickname: msg.sender.nickname,
      avatarUrl: msg.sender.avatarUrl,
    },
    attachments: (msg.attachments ?? []).map(a => ({
      id: a.id,
      storageKey: a.storageKey,
      thumbnailKey: a.thumbnailKey,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes ? Number(a.sizeBytes) : null,
      width: a.width,
      height: a.height,
      durationMs: a.durationMs,
      waveform: a.waveform,
    })),
  }
}
