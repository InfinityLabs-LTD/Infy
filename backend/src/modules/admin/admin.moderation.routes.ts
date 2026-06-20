import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { authenticate, requireAdmin } from '../../middleware/authenticate.js'
import { publishMessage } from '../../lib/pubsub.js'
import { revokeSessions } from '../../lib/sessionStore.js'

const userSelect = {
  id: true, username: true, nickname: true, avatarUrl: true,
} as const

function serializeSanction(s: {
  id: string; userId: bigint; issuedById: bigint; type: string; reason: string
  createdAt: Date; expiresAt: Date | null; revokedAt: Date | null
  user: { id: bigint; username: string; nickname: string; avatarUrl: string | null }
  issuedBy: { id: bigint; username: string; nickname: string; avatarUrl: string | null }
}) {
  // Не разворачиваем `...s` целиком: userId/issuedById — BigInt и ломают JSON.stringify.
  return {
    id:        s.id,
    type:      s.type,
    reason:    s.reason,
    createdAt: s.createdAt,
    expiresAt: s.expiresAt,
    revokedAt: s.revokedAt,
    user:     { ...s.user,     id: s.user.id.toString() },
    issuedBy: { ...s.issuedBy, id: s.issuedBy.id.toString() },
  }
}

const adminModerationRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', authenticate)
  app.addHook('preHandler', requireAdmin)

  // GET /admin/moderation/sanctions?status=active|all
  app.get('/sanctions', {
    schema: {
      tags: ['Admin'],
      summary: 'List sanctions (admin)',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: { status: { type: 'string', enum: ['active', 'all'], default: 'active' } },
      },
    },
  }, async (request) => {
    const { status = 'active' } = request.query as { status?: 'active' | 'all' }
    const now = new Date()

    // active = не снята вручную И (бессрочна ИЛИ ещё не истекла)
    const where = status === 'active'
      ? {
          revokedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        }
      : {}

    const activeWhere = { revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }

    const [sanctions, warnCount, muteCount, banCount] = await Promise.all([
      app.prisma.sanction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 200,
        include: {
          user:     { select: userSelect },
          issuedBy: { select: userSelect },
        },
      }),
      app.prisma.sanction.count({ where: { ...activeWhere, type: 'WARN' } }),
      app.prisma.sanction.count({ where: { ...activeWhere, type: 'MUTE' } }),
      app.prisma.sanction.count({ where: { ...activeWhere, type: 'BAN' } }),
    ])

    const byType = { WARN: warnCount, MUTE: muteCount, BAN: banCount }

    return {
      data: {
        sanctions: sanctions.map(serializeSanction),
        activeByType: byType,
      },
    }
  })

  // POST /admin/moderation/sanctions
  app.post('/sanctions', {
    schema: {
      tags: ['Admin'],
      summary: 'Issue a sanction (admin)',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['userId', 'type', 'reason'],
        properties: {
          userId:        { type: 'string' },
          type:          { type: 'string', enum: ['WARN', 'MUTE', 'BAN'] },
          reason:        { type: 'string', minLength: 1, maxLength: 500 },
          durationHours: { type: 'integer', minimum: 1, nullable: true },
        },
      },
    },
  }, async (request, reply) => {
    const body = z.object({
      userId:        z.string(),
      type:          z.enum(['WARN', 'MUTE', 'BAN']),
      reason:        z.string().min(1).max(500),
      durationHours: z.number().int().min(1).nullable().optional(),
    }).parse(request.body)

    const issuerId = BigInt(request.user.sub)
    const targetId = BigInt(body.userId)

    if (targetId === issuerId) {
      return reply.code(400).send({ error: { code: 'MOD_SELF_SANCTION', message: 'Нельзя применить санкцию к себе' } })
    }

    // WARN не имеет срока; MUTE/BAN — опциональный срок (null = бессрочно)
    const expiresAt = body.type !== 'WARN' && body.durationHours
      ? new Date(Date.now() + body.durationHours * 3_600_000)
      : null

    const sanction = await app.prisma.sanction.create({
      data: {
        userId:     targetId,
        issuedById: issuerId,
        type:       body.type,
        reason:     body.reason,
        expiresAt,
      },
      include: {
        user:     { select: userSelect },
        issuedBy: { select: userSelect },
      },
    })

    // H-3 / M-1 (звонки): BAN немедленно отзывает все сессии забаненного —
    // access-токены перестают работать сразу (allowlist), а сокеты рвутся
    // через realtime. Без этого бан вступал в силу только при следующем
    // login/refresh (≤15 мин), а WS-сессия жила ещё дольше.
    if (body.type === 'BAN') {
      const toRevoke = await app.prisma.deviceSession.findMany({
        where: { userId: targetId, revokedAt: null },
        select: { id: true },
      })
      if (toRevoke.length > 0) {
        await app.prisma.deviceSession.updateMany({
          where: { id: { in: toRevoke.map(s => s.id) } },
          data: { revokedAt: new Date() },
        })
        await revokeSessions(app.redis, toRevoke.map(s => s.id))
        await publishMessage(app.redis, 'realtime:control', {
          event: 'force_disconnect',
          userId: targetId.toString(),
          sessionIds: toRevoke.map(s => s.id),
        }).catch(() => {})
      }
    }

    return reply.code(201).send({ data: serializeSanction(sanction) })
  })

  // DELETE /admin/moderation/sanctions/:id — снять досрочно
  app.delete('/sanctions/:id', {
    schema: {
      tags: ['Admin'],
      summary: 'Revoke a sanction (admin)',
      security: [{ bearerAuth: [] }],
    },
  }, async (request) => {
    const { id } = request.params as { id: string }
    const sanction = await app.prisma.sanction.update({
      where: { id },
      data: { revokedAt: new Date() },
      include: {
        user:     { select: userSelect },
        issuedBy: { select: userSelect },
      },
    })
    return { data: serializeSanction(sanction) }
  })
}

export default adminModerationRoutes
