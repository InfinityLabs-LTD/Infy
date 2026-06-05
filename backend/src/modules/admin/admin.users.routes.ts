import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { authenticate, requireAdmin } from '../../middleware/authenticate.js'

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
      },
    })
    return { data: { ...user, id: user.id.toString() } }
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
}

export default adminUsersRoutes
