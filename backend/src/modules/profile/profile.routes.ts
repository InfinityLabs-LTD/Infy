import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import path from 'path'
import { authenticate } from '../../middleware/authenticate.js'
import { Errors } from '../../lib/errors.js'
import { serializeUser } from '../auth/auth.service.js'
import { usernameSchema } from '../auth/auth.schema.js'
import { env } from '../../lib/env.js'
import { isValidTimezone } from '../../lib/timezone.js'
import { mailEnabled } from '../../lib/mailer.js'
import {
  requestEmailBinding,
  confirmEmailBinding,
  changeUsername,
} from './account.service.js'

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
const MAX_AVATAR_BYTES = 5 * 1024 * 1024 // 5 MB
const MAX_COVER_BYTES = 10 * 1024 * 1024 // 10 MB

// Один интерес/хэштег: буквы/цифры/_/-, без пробелов и решётки (её рисует UI).
const interestSchema = z.string().trim().min(1).max(24).regex(/^[\p{L}\p{N}_-]+$/u)

// Убирает дубликаты интересов без учёта регистра, сохраняя исходный порядок/написание.
function dedupeInterests(list: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of list) {
    const key = raw.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(raw)
  }
  return out
}

// username здесь НЕ принимается: смена username идёт через отдельный
// защищённый эндпоинт (требует подтверждённой почты и отзывает сессии).
const updateProfileSchema = z.object({
  nickname: z.string().min(1).max(64).trim().optional(),
  birthdate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  bio: z.string().max(500).trim().optional().nullable(),
  // Хэштеги/интересы — выбирает сам пользователь (до 10 шт.).
  interests: z.array(interestSchema).max(10).optional(),
  // IANA-зона (напр. "Asia/Yekaterinburg"); null — сбросить.
  timezone: z.string().max(64).optional().nullable()
    .refine(v => v == null || isValidTimezone(v), { message: 'Invalid IANA timezone' }),
  // Infy Pulse: подсказки ответов над полем ввода чата.
  aiSuggestReplies: z.boolean().optional(),
  // Настройки push-уведомлений.
  notifyPopup: z.boolean().optional(),
  notifySound: z.boolean().optional(),
  notifyVibrate: z.boolean().optional(),
})

const profileRoutes: FastifyPluginAsync = async (app) => {
  // GET /profile/me
  app.get('/me', {
    preHandler: [authenticate],
    schema: {
      tags: ['Profile'],
      summary: 'Get own profile',
      security: [{ bearerAuth: [] }],
    },
  }, async (request) => {
    const userId = BigInt(request.user.sub)
    const user = await app.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { badges: { include: { badge: true }, orderBy: { grantedAt: 'asc' } } },
    })
    return { data: serializeUser(user) }
  })

  // GET /profile/me/stats — реальная статистика профиля.
  // Контакты = собеседники в личных чатах; Чаты = все диалоги; Группы = групповые чаты;
  // Устройства = активные (не отозванные) сессии.
  app.get('/me/stats', {
    preHandler: [authenticate],
    schema: {
      tags: ['Profile'],
      summary: 'Get own profile stats',
      security: [{ bearerAuth: [] }],
    },
  }, async (request) => {
    const userId = BigInt(request.user.sub)

    const [chats, groups, devices, directChats] = await Promise.all([
      app.prisma.chatMember.count({ where: { userId } }),
      app.prisma.chatMember.count({ where: { userId, chat: { type: 'GROUP' } } }),
      app.prisma.deviceSession.count({ where: { userId, revokedAt: null } }),
      app.prisma.chat.findMany({
        where: { type: 'DIRECT', members: { some: { userId } } },
        select: { members: { select: { userId: true } } },
      }),
    ])

    // Контакты — уникальные собеседники в личных чатах (исключая себя).
    const contactIds = new Set<string>()
    for (const c of directChats) {
      for (const m of c.members) {
        if (m.userId !== userId) contactIds.add(m.userId.toString())
      }
    }

    return { data: { contacts: contactIds.size, chats, groups, devices } }
  })

  // PATCH /profile/me
  app.patch('/me', {
    preHandler: [authenticate],
    schema: {
      tags: ['Profile'],
      summary: 'Update own profile',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          nickname: { type: 'string', minLength: 1, maxLength: 64 },
          birthdate: { type: 'string', nullable: true },
          bio: { type: 'string', maxLength: 500, nullable: true },
          interests: { type: 'array', items: { type: 'string' }, maxItems: 10 },
          timezone: { type: 'string', maxLength: 64, nullable: true },
          aiSuggestReplies: { type: 'boolean' },
          notifyPopup: { type: 'boolean' },
          notifySound: { type: 'boolean' },
          notifyVibrate: { type: 'boolean' },
        },
      },
    },
  }, async (request) => {
    const userId = BigInt(request.user.sub)
    const input = updateProfileSchema.parse(request.body)

    const user = await app.prisma.user.update({
      where: { id: userId },
      data: {
        ...(input.nickname !== undefined && { nickname: input.nickname }),
        ...(input.birthdate !== undefined && {
          birthdate: input.birthdate ? new Date(input.birthdate) : null,
        }),
        ...(input.bio !== undefined && { bio: input.bio ?? null }),
        ...(input.interests !== undefined && {
          // Нормализуем: убираем дубликаты (без учёта регистра), сохраняя порядок.
          interests: dedupeInterests(input.interests),
        }),
        ...(input.timezone !== undefined && { timezone: input.timezone ?? null }),
        ...(input.aiSuggestReplies !== undefined && { aiSuggestReplies: input.aiSuggestReplies }),
        ...(input.notifyPopup !== undefined && { notifyPopup: input.notifyPopup }),
        ...(input.notifySound !== undefined && { notifySound: input.notifySound }),
        ...(input.notifyVibrate !== undefined && { notifyVibrate: input.notifyVibrate }),
      },
      include: { badges: { include: { badge: true }, orderBy: { grantedAt: 'asc' } } },
    })

    return { data: serializeUser(user) }
  })

  // ── Привязка почты + смена username ──────────────────────────

  // GET /profile/me/email-status — доступна ли отправка писем (для UI).
  app.get('/me/email-status', {
    preHandler: [authenticate],
    schema: {
      tags: ['Profile'],
      summary: 'Whether email sending is configured on the server',
      security: [{ bearerAuth: [] }],
    },
  }, async () => {
    return { data: { mailEnabled: await mailEnabled(app.prisma) } }
  })

  // POST /profile/me/email — запросить привязку почты (отправить код).
  app.post('/me/email', {
    preHandler: [authenticate],
    config: {
      rateLimit: { max: env.RATE_LIMIT_LOGIN_MAX, timeWindow: env.RATE_LIMIT_LOGIN_WINDOW_MS },
    },
    schema: {
      tags: ['Profile'],
      summary: 'Request email binding — sends a verification code',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['email'],
        properties: { email: { type: 'string', format: 'email' } },
      },
    },
  }, async (request) => {
    const userId = BigInt(request.user.sub)
    const { email } = z.object({ email: z.string().email().max(255) }).parse(request.body)
    const result = await requestEmailBinding(app.prisma, userId, email)
    return { data: result }
  })

  // POST /profile/me/email/confirm — подтвердить почту кодом.
  app.post('/me/email/confirm', {
    preHandler: [authenticate],
    config: {
      rateLimit: { max: env.RATE_LIMIT_LOGIN_MAX, timeWindow: env.RATE_LIMIT_LOGIN_WINDOW_MS },
    },
    schema: {
      tags: ['Profile'],
      summary: 'Confirm email with the verification code',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['code'],
        properties: { code: { type: 'string', minLength: 6, maxLength: 6 } },
      },
    },
  }, async (request) => {
    const userId = BigInt(request.user.sub)
    const { code } = z.object({ code: z.string().regex(/^\d{6}$/) }).parse(request.body)
    await confirmEmailBinding(app.prisma, userId, code)

    const user = await app.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { badges: { include: { badge: true }, orderBy: { grantedAt: 'asc' } } },
    })
    return { data: serializeUser(user) }
  })

  // POST /profile/me/username — сменить username (нужна подтверждённая почта).
  // После смены все сессии отзываются — клиент должен перелогиниться.
  app.post('/me/username', {
    preHandler: [authenticate],
    config: {
      rateLimit: { max: env.RATE_LIMIT_LOGIN_MAX, timeWindow: env.RATE_LIMIT_LOGIN_WINDOW_MS },
    },
    schema: {
      tags: ['Profile'],
      summary: 'Change username (requires a verified email; revokes all sessions)',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['username'],
        properties: { username: { type: 'string', minLength: 3, maxLength: 32 } },
      },
    },
  }, async (request, reply) => {
    const userId = BigInt(request.user.sub)
    const { username } = z.object({ username: usernameSchema }).parse(request.body)
    await changeUsername(app.prisma, userId, username)
    // 204: смена прошла, но текущая сессия отозвана — клиент уйдёт на логин.
    return reply.code(204).send()
  })

  // POST /profile/me/avatar — multipart upload
  app.post('/me/avatar', {
    preHandler: [authenticate],
    schema: {
      tags: ['Profile'],
      summary: 'Upload avatar image',
      security: [{ bearerAuth: [] }],
      consumes: ['multipart/form-data'],
    },
  }, async (request, reply) => {
    const userId = BigInt(request.user.sub)

    const data = await request.file()
    if (!data) return reply.code(400).send({ error: { code: 'NO_FILE', message: 'No file uploaded' } })

    if (!ALLOWED_MIME.has(data.mimetype)) throw Errors.AVATAR_INVALID_TYPE()

    const chunks: Buffer[] = []
    let size = 0
    for await (const chunk of data.file) {
      size += chunk.length
      if (size > MAX_AVATAR_BYTES) throw Errors.AVATAR_TOO_LARGE()
      chunks.push(chunk)
    }

    const buffer = Buffer.concat(chunks)
    const ext = path.extname(data.filename) || `.${data.mimetype.split('/')[1]}`
    const objectKey = `${userId.toString()}/${Date.now()}${ext}`

    await app.minio.putObject(env.MINIO_BUCKET_AVATARS, objectKey, buffer, buffer.length, {
      'Content-Type': data.mimetype,
    })

    const avatarUrl = `/media/avatars/${objectKey}`

    const user = await app.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl },
    })

    return { data: { avatarUrl: user.avatarUrl } }
  })

  // POST /profile/me/cover — cover image upload
  app.post('/me/cover', {
    preHandler: [authenticate],
    schema: {
      tags: ['Profile'],
      summary: 'Upload cover image',
      security: [{ bearerAuth: [] }],
      consumes: ['multipart/form-data'],
    },
  }, async (request, reply) => {
    const userId = BigInt(request.user.sub)

    const data = await request.file()
    if (!data) return reply.code(400).send({ error: { code: 'NO_FILE', message: 'No file uploaded' } })

    if (!ALLOWED_MIME.has(data.mimetype)) throw Errors.AVATAR_INVALID_TYPE()

    const chunks: Buffer[] = []
    let size = 0
    for await (const chunk of data.file) {
      size += chunk.length
      if (size > MAX_COVER_BYTES) throw Errors.AVATAR_TOO_LARGE()
      chunks.push(chunk)
    }

    const buffer = Buffer.concat(chunks)
    const ext = path.extname(data.filename) || `.${data.mimetype.split('/')[1]}`
    const objectKey = `covers/${userId.toString()}/${Date.now()}${ext}`

    await app.minio.putObject(env.MINIO_BUCKET_AVATARS, objectKey, buffer, buffer.length, {
      'Content-Type': data.mimetype,
    })

    const coverUrl = `/media/avatars/${objectKey}`

    const user = await app.prisma.user.update({
      where: { id: userId },
      data: { coverUrl },
    })

    return { data: { coverUrl: user.coverUrl } }
  })

  // GET /profile/search?q= — find users by username or nickname (excluding self)
  app.get('/search', {
    preHandler: [authenticate],
    schema: {
      tags: ['Profile'],
      summary: 'Search users by username or nickname',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        required: ['q'],
        properties: { q: { type: 'string', minLength: 2 } },
      },
    },
  }, async (request) => {
    const { q } = z.object({ q: z.string().min(2).max(64) }).parse(request.query)
    const userId = BigInt(request.user.sub)
    const term = q.trim().replace(/^@/, '')

    const users = await app.prisma.user.findMany({
      where: {
        id: { not: userId },
        OR: [
          { username: { contains: term, mode: 'insensitive' } },
          { nickname: { contains: term, mode: 'insensitive' } },
        ],
      },
      take: 20,
      orderBy: { username: 'asc' },
    })

    return {
      data: users.map(u => ({
        id: u.id.toString(),
        username: u.username,
        nickname: u.nickname,
        avatarUrl: u.avatarUrl,
      })),
    }
  })

  // GET /users/:username — public profile
  app.get('/:username', {
    preHandler: [authenticate],
    schema: {
      tags: ['Profile'],
      summary: 'Get public profile by username',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: { username: { type: 'string' } },
      },
    },
  }, async (request) => {
    const { username } = request.params as { username: string }
    const user = await app.prisma.user.findUnique({
      where: { username },
      include: { badges: { include: { badge: true }, orderBy: { grantedAt: 'asc' } } },
    })
    if (!user) throw Errors.USER_NOT_FOUND()

    // Публичный профиль: только то, что видят другие. Личные данные
    // (email, день рождения, настройки) НЕ отдаём.
    return {
      data: {
        id: user.id.toString(),
        username: user.username,
        nickname: user.nickname,
        avatarUrl: user.avatarUrl,
        coverUrl: user.coverUrl,
        bio: user.bio,
        role: user.role,
        interests: user.interests,
        badges: user.badges.map(b => ({
          slug: b.badge.slug,
          label: b.badge.label,
          color: b.badge.color,
          icon: b.badge.icon,
          description: b.badge.description,
        })),
        createdAt: user.createdAt,
        lastSeenAt: user.lastSeenAt,
      },
    }
  })
}

export default profileRoutes
