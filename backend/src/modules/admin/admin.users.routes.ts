import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { authenticate, requireAdmin } from '../../middleware/authenticate.js'
import { env } from '../../lib/env.js'
import * as AuthService from '../auth/auth.service.js'

// Полный набор полей вложения для админ-просмотра — чтобы фронтенд мог
// отрисовать любой контент (фото, видео, аудио, голосовые, кружки, файлы).
const attachmentSelect = {
  id: true, storageKey: true, thumbnailKey: true, mimeType: true,
  sizeBytes: true, width: true, height: true, durationMs: true, waveform: true,
} as const

function serializeAttachment(a: {
  id: string; storageKey: string; thumbnailKey: string | null; mimeType: string
  sizeBytes: bigint | null; width: number | null; height: number | null
  durationMs: number | null; waveform: unknown
}) {
  return {
    id: a.id,
    storageKey: a.storageKey,
    thumbnailKey: a.thumbnailKey,
    mimeType: a.mimeType,
    sizeBytes: a.sizeBytes ? Number(a.sizeBytes) : null,
    width: a.width,
    height: a.height,
    durationMs: a.durationMs,
    waveform: a.waveform ?? null,
  }
}

// Базовый публичный URL фронтенда — для ссылок смены пароля.
function appPublicUrl(): string {
  return (env.APP_PUBLIC_URL || env.CORS_ORIGINS.split(',')[0] || '').replace(/\/+$/, '')
}

const adminUsersRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', authenticate)
  app.addHook('preHandler', requireAdmin)

  // GET /admin/users?page=1&limit=50&search=
  app.get('/', {
    schema: {
      tags: ['Admin'],
      summary: 'List all users (admin)',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          page:   { type: 'integer', minimum: 1, default: 1 },
          limit:  { type: 'integer', minimum: 1, maximum: 100, default: 50 },
          search: { type: 'string' },
        },
      },
    },
  }, async (request) => {
    const { page = 1, limit = 50, search } = request.query as {
      page?: number; limit?: number; search?: string
    }
    const skip = (page - 1) * limit

    const where = search
      ? {
          OR: [
            { username: { contains: search, mode: 'insensitive' as const } },
            { nickname: { contains: search, mode: 'insensitive' as const } },
            { email:    { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}

    const [users, total] = await Promise.all([
      app.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { id: 'asc' },
        select: {
          id: true, username: true, nickname: true,
          email: true, role: true, avatarUrl: true,
          createdAt: true, lastSeenAt: true,
          emailVerifiedAt: true,
        },
      }),
      app.prisma.user.count({ where }),
    ])

    return {
      data: {
        users: users.map(u => ({ ...u, id: u.id.toString() })),
        total,
        page,
        pages: Math.ceil(total / limit),
      },
    }
  })

  // GET /admin/users/:id
  app.get('/:id', {
    schema: {
      tags: ['Admin'],
      summary: 'Get user by id (admin)',
      security: [{ bearerAuth: [] }],
    },
  }, async (request) => {
    const { id } = request.params as { id: string }
    const user = await app.prisma.user.findUniqueOrThrow({
      where: { id: BigInt(id) },
      select: {
        id: true, username: true, nickname: true, email: true,
        role: true, avatarUrl: true, birthdate: true,
        createdAt: true, lastSeenAt: true, emailVerifiedAt: true,
        _count: { select: { messages: true, chatMemberships: true } },
        badges: { include: { badge: true }, orderBy: { grantedAt: 'asc' } },
      },
    })
    return {
      data: {
        ...user,
        id: user.id.toString(),
        badges: user.badges.map(b => ({
          slug: b.badge.slug, label: b.badge.label, color: b.badge.color,
          icon: b.badge.icon, description: b.badge.description, badgeId: b.badge.id,
        })),
      },
    }
  })

  // PUT /admin/users/:id/badges/:badgeId — выдать бейдж пользователю.
  app.put('/:id/badges/:badgeId', {
    schema: { tags: ['Admin'], summary: 'Grant a badge to a user (admin)', security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const { id, badgeId } = request.params as { id: string; badgeId: string }
    const userId = BigInt(id)
    const grantedById = BigInt(request.user.sub)

    await app.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true } })
    await app.prisma.badge.findUniqueOrThrow({ where: { id: badgeId }, select: { id: true } })

    await app.prisma.userBadge.upsert({
      where: { userId_badgeId: { userId, badgeId } },
      create: { userId, badgeId, grantedById },
      update: { grantedById },
    })
    return reply.code(204).send()
  })

  // DELETE /admin/users/:id/badges/:badgeId — снять бейдж с пользователя.
  app.delete('/:id/badges/:badgeId', {
    schema: { tags: ['Admin'], summary: 'Revoke a badge from a user (admin)', security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const { id, badgeId } = request.params as { id: string; badgeId: string }
    await app.prisma.userBadge.deleteMany({ where: { userId: BigInt(id), badgeId } })
    return reply.code(204).send()
  })

  // PATCH /admin/users/:id
  app.patch('/:id', {
    schema: {
      tags: ['Admin'],
      summary: 'Update user (admin)',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          nickname: { type: 'string', minLength: 1, maxLength: 64 },
          role:     { type: 'string', enum: ['USER', 'ADMIN'] },
          email:    { type: 'string', format: 'email', nullable: true },
        },
      },
    },
  }, async (request) => {
    const { id } = request.params as { id: string }
    const body = z.object({
      nickname: z.string().min(1).max(64).optional(),
      role:     z.enum(['USER', 'ADMIN']).optional(),
      email:    z.string().email().nullable().optional(),
    }).parse(request.body)

    const user = await app.prisma.user.update({
      where: { id: BigInt(id) },
      data: {
        ...(body.nickname !== undefined && { nickname: body.nickname }),
        ...(body.role     !== undefined && { role: body.role }),
        ...(body.email    !== undefined && { email: body.email }),
      },
      select: { id: true, username: true, nickname: true, role: true, email: true },
    })
    return { data: { ...user, id: user.id.toString() } }
  })

  // GET /admin/users/:id/messages?page=&limit=
  app.get('/:id/messages', {
    schema: {
      tags: ['Admin'],
      summary: 'Get message history for a user (admin)',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          page:  { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
        },
      },
    },
  }, async (request) => {
    const { id } = request.params as { id: string }
    const { page = 1, limit = 50 } = request.query as { page?: number; limit?: number }
    const skip = (page - 1) * limit

    const [messages, total] = await Promise.all([
      app.prisma.message.findMany({
        where: { senderId: BigInt(id), deletedAt: null },
        skip,
        take: limit,
        orderBy: { id: 'desc' },
        include: {
          sender:      { select: { id: true, username: true, nickname: true, avatarUrl: true } },
          attachments: { select: { id: true, mimeType: true, storageKey: true, sizeBytes: true } },
          chat:        { select: { id: true, type: true } },
        },
      }),
      app.prisma.message.count({ where: { senderId: BigInt(id), deletedAt: null } }),
    ])

    return {
      data: {
        messages: messages.map(m => ({
          ...m,
          senderId: m.senderId.toString(),
          sender:   { ...m.sender, id: m.sender.id.toString() },
          attachments: m.attachments.map(a => ({
            ...a,
            sizeBytes: a.sizeBytes ? Number(a.sizeBytes) : null,
          })),
        })),
        total,
        page,
        pages: Math.ceil(total / limit),
      },
    }
  })

  // POST /admin/users/:id/password — сгенерировать новый пароль и установить его.
  // Возвращает сырой пароль ОДИН раз — админ передаёт его пользователю.
  app.post('/:id/password', {
    schema: {
      tags: ['Admin'],
      summary: 'Generate and set a new password for a user (admin)',
      security: [{ bearerAuth: [] }],
    },
  }, async (request) => {
    const { id } = request.params as { id: string }
    const userId = BigInt(id)
    // Убедимся, что пользователь существует (иначе 404).
    await app.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true } })

    const password = AuthService.generatePassword()
    await AuthService.setUserPassword(app.prisma, app.redis, userId, password)
    return { data: { password } }
  })

  // POST /admin/users/:id/password-reset-link — одноразовая ссылка для
  // самостоятельной смены пароля пользователем.
  app.post('/:id/password-reset-link', {
    schema: {
      tags: ['Admin'],
      summary: 'Create a self-service password reset link for a user (admin)',
      security: [{ bearerAuth: [] }],
    },
  }, async (request) => {
    const { id } = request.params as { id: string }
    const userId = BigInt(id)
    await app.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true } })

    const token = await AuthService.createPasswordResetToken(app.prisma, userId)
    const url = `${appPublicUrl()}/reset-password?token=${token}`
    return { data: { url, token, expiresInHours: 24 } }
  })

  // DELETE /admin/users/:id — полное удаление аккаунта из всех таблиц.
  // Личные (DIRECT) чаты с этим пользователем удаляются целиком у обоих,
  // вместе со всеми сообщениями и вложениями. Объекты в MinIO тоже стираются.
  app.delete('/:id', {
    schema: {
      tags: ['Admin'],
      summary: 'Permanently delete a user and all their data (admin)',
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const userId = BigInt(id)

    if (userId === BigInt(request.user.sub)) {
      return reply.code(400).send({ error: { code: 'ADMIN_SELF_DELETE', message: 'Нельзя удалить собственный аккаунт' } })
    }

    const user = await app.prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
    if (!user) {
      return reply.code(404).send({ error: { code: 'AUTH_USER_NOT_FOUND', message: 'Пользователь не найден' } })
    }

    // 1) Найти личные чаты, в которых состоит пользователь — их удаляем целиком.
    const directChats = await app.prisma.chat.findMany({
      where: { type: 'DIRECT', members: { some: { userId } } },
      select: { id: true },
    })
    const directChatIds = directChats.map(c => c.id)

    // 2) Собрать ключи объектов MinIO для удаления:
    //    - все вложения в удаляемых личных чатах
    //    - все вложения сообщений, отправленных этим пользователем (в групповых чатах)
    const attachments = await app.prisma.attachment.findMany({
      where: {
        OR: [
          { message: { chatId: { in: directChatIds } } },
          { message: { senderId: userId } },
        ],
      },
      select: { storageKey: true, thumbnailKey: true },
    })

    // 3) Транзакция: удаляем данные из БД.
    //    Большинство связей каскадные (chat → messages → attachments/reactions,
    //    user → sessions/push/memberships). Вручную чистим то, что Restrict /
    //    не каскадится автоматически.
    await app.prisma.$transaction(async (tx) => {
      // Удалить личные чаты целиком (каскад уберёт их сообщения/вложения/участников).
      if (directChatIds.length > 0) {
        await tx.chat.deleteMany({ where: { id: { in: directChatIds } } })
      }
      // Сообщения пользователя в оставшихся (групповых) чатах — sender не каскадный.
      await tx.message.deleteMany({ where: { senderId: userId } })
      // Санкции, выданные этим админом (issuedBy = Restrict) — снимаем привязку, удаляя их.
      await tx.sanction.deleteMany({ where: { issuedById: userId } })
      // Звонки, инициированные пользователем (initiator не каскадный).
      await tx.callSession.deleteMany({ where: { initiatorId: userId } })
      // Наконец — сам пользователь (каскад добьёт sessions, push, memberships,
      // reactions, sanctions-as-target, reset-токены и т.д.).
      await tx.user.delete({ where: { id: userId } })
    })

    // 4) Удаляем файлы из MinIO (после успешной транзакции; ошибки не критичны).
    const keys = [...new Set(
      attachments.flatMap(a => [a.storageKey, a.thumbnailKey].filter((k): k is string => !!k)),
    )]
    if (keys.length > 0) {
      await app.minio.removeObjects(env.MINIO_BUCKET_MEDIA, keys).catch((err) => {
        app.log.warn({ err }, 'Не удалось удалить часть файлов из MinIO при удалении пользователя')
      })
    }

    return reply.code(204).send()
  })

  // GET /admin/users/:id/chats — список диалогов пользователя (для просмотра переписок).
  app.get('/:id/chats', {
    schema: {
      tags: ['Admin'],
      summary: 'List chats a user participates in (admin)',
      security: [{ bearerAuth: [] }],
    },
  }, async (request) => {
    const { id } = request.params as { id: string }
    const userId = BigInt(id)

    const memberships = await app.prisma.chatMember.findMany({
      where: { userId },
      include: {
        chat: {
          include: {
            members: {
              include: { user: { select: { id: true, username: true, nickname: true, avatarUrl: true } } },
            },
            _count: { select: { messages: true } },
            messages: {
              orderBy: { id: 'desc' },
              take: 1,
              select: { id: true, content: true, type: true, createdAt: true, senderId: true },
            },
          },
        },
      },
    })

    const chats = memberships.map(m => {
      const others = m.chat.members
        .filter(mm => mm.userId !== userId)
        .map(mm => ({ ...mm.user, id: mm.user.id.toString() }))
      const last = m.chat.messages[0]
      return {
        id: m.chat.id,
        type: m.chat.type,
        messageCount: m.chat._count.messages,
        participants: others,
        lastMessage: last
          ? { id: last.id, content: last.content, type: last.type, createdAt: last.createdAt, senderId: last.senderId.toString() }
          : null,
      }
    })

    // Свежие диалоги — сверху (по времени последнего сообщения).
    chats.sort((a, b) => {
      const ta = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0
      const tb = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0
      return tb - ta
    })

    return { data: { chats } }
  })

  // GET /admin/chats/:chatId/messages?cursor=&limit= — полная переписка диалога.
  // Хронологический поток с вложениями (фото/видео/аудио/голосовые/кружки/файлы).
  app.get('/chats/:chatId/messages', {
    schema: {
      tags: ['Admin'],
      summary: 'Read full message thread of a chat (admin)',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          cursor: { type: 'string' },
          limit:  { type: 'integer', minimum: 1, maximum: 100, default: 50 },
        },
      },
    },
  }, async (request) => {
    const { chatId } = request.params as { chatId: string }
    const { cursor, limit = 50 } = request.query as { cursor?: string; limit?: number }

    const chat = await app.prisma.chat.findUniqueOrThrow({
      where: { id: chatId },
      include: {
        members: { include: { user: { select: { id: true, username: true, nickname: true, avatarUrl: true } } } },
      },
    })

    // Курсор назад по времени (id — UUID v7, монотонно растёт): берём страницу
    // более старых сообщений, чем cursor.
    const messages = await app.prisma.message.findMany({
      where: { chatId, deletedAt: null },
      orderBy: { id: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        sender:      { select: { id: true, username: true, nickname: true, avatarUrl: true } },
        attachments: { select: attachmentSelect },
        replyTo: {
          select: {
            id: true, content: true, type: true,
            sender: { select: { id: true, nickname: true } },
          },
        },
      },
    })

    const hasMore = messages.length > limit
    const page = hasMore ? messages.slice(0, limit) : messages
    const nextCursor = hasMore ? page[page.length - 1].id : null

    return {
      data: {
        chat: {
          id: chat.id,
          type: chat.type,
          participants: chat.members.map(m => ({ ...m.user, id: m.user.id.toString() })),
        },
        // Отдаём в хронологическом порядке (старые сверху) для удобной отрисовки.
        messages: page.reverse().map(m => ({
          id: m.id,
          chatId: m.chatId,
          content: m.content,
          type: m.type,
          createdAt: m.createdAt,
          editedAt: m.editedAt,
          sender: { ...m.sender, id: m.sender.id.toString() },
          attachments: m.attachments.map(serializeAttachment),
          replyTo: m.replyTo
            ? { id: m.replyTo.id, content: m.replyTo.content, type: m.replyTo.type, sender: { ...m.replyTo.sender, id: m.replyTo.sender.id.toString() } }
            : null,
        })),
        nextCursor,
      },
    }
  })
}

export default adminUsersRoutes
