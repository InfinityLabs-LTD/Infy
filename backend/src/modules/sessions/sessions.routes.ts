import { FastifyPluginAsync } from 'fastify'
import { authenticate } from '../../middleware/authenticate.js'
import { Errors } from '../../lib/errors.js'
import { publishMessage } from '../../lib/pubsub.js'
import { z } from 'zod'

const sessionsRoutes: FastifyPluginAsync = async (app) => {
  // All session routes require authentication
  app.addHook('preHandler', authenticate)

  // GET /sessions — list user's device sessions
  app.get('/', {
    schema: {
      tags: ['Sessions'],
      summary: 'List active device sessions',
      security: [{ bearerAuth: [] }],
    },
  }, async (request) => {
    const userId = BigInt(request.user.sub)
    const sessions = await app.prisma.deviceSession.findMany({
      where: { userId, revokedAt: null },
      orderBy: { lastActiveAt: 'desc' },
    })

    return {
      data: sessions.map(s => ({
        id: s.id,
        deviceName: s.deviceName,
        userAgent: s.userAgent,
        ip: s.ip,
        createdAt: s.createdAt,
        lastActiveAt: s.lastActiveAt,
        isCurrent: s.id === request.user.sessionId,
      })),
    }
  })

  // DELETE /sessions/:id — revoke specific session
  app.delete('/:id', {
    schema: {
      tags: ['Sessions'],
      summary: 'Revoke a specific session',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: { id: { type: 'string' } },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const userId = BigInt(request.user.sub)

    const session = await app.prisma.deviceSession.findUnique({ where: { id } })
    if (!session || session.userId !== userId) throw Errors.SESSION_NOT_FOUND()

    await app.prisma.deviceSession.update({
      where: { id },
      data: { revokedAt: new Date() },
    })

    // Немедленно рвём сокет(ы) этой сессии в realtime — чтобы пользователь не
    // «висел в сети» и презенс обновился сразу (H-4).
    await publishMessage(app.redis, 'realtime:control', {
      event: 'force_disconnect', userId: userId.toString(), sessionIds: [id],
    }).catch(() => {})

    return reply.code(204).send()
  })

  // POST /sessions/logout-all
  app.post('/logout-all', {
    schema: {
      tags: ['Sessions'],
      summary: 'Revoke all sessions (optionally except current)',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          exceptCurrent: { type: 'boolean', default: true },
        },
      },
    },
  }, async (request, reply) => {
    const { exceptCurrent = true } = (request.body ?? {}) as { exceptCurrent?: boolean }
    const userId = BigInt(request.user.sub)

    const where = exceptCurrent
      ? { userId, revokedAt: null, id: { not: request.user.sessionId } }
      : { userId, revokedAt: null }

    // Собираем id отзываемых сессий заранее — нужны для адресного отключения
    // сокетов в realtime (updateMany не возвращает строки).
    const toRevoke = await app.prisma.deviceSession.findMany({ where, select: { id: true } })

    const result = await app.prisma.deviceSession.updateMany({
      where,
      data: { revokedAt: new Date() },
    })

    if (toRevoke.length > 0) {
      // Рвём именно отозванные сессии (текущая, если exceptCurrent, не входит) (H-4).
      await publishMessage(app.redis, 'realtime:control', {
        event: 'force_disconnect', userId: userId.toString(), sessionIds: toRevoke.map(s => s.id),
      }).catch(() => {})
    }

    return reply.send({ data: { revokedCount: result.count } })
  })
}

export default sessionsRoutes
