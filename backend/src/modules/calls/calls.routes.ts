import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../../middleware/authenticate.js'
import { buildIceServers } from '../../lib/turn.js'
import * as CallsService from './calls.service.js'

const callRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', authenticate)

  // GET /calls/ice — ICE-серверы (STUN + time-limited TURN credentials).
  // Клиент запрашивает прямо перед установкой соединения, т.к. TURN-creds истекают.
  app.get('/ice', {
    schema: {
      tags: ['Calls'],
      summary: 'Get ICE servers (STUN/TURN) for WebRTC',
      security: [{ bearerAuth: [] }],
    },
  }, async (request) => {
    const iceServers = buildIceServers(request.user.sub)
    return { data: { iceServers } }
  })

  // GET /calls/history — история звонков пользователя (курсорная пагинация).
  app.get('/history', {
    schema: {
      tags: ['Calls'],
      summary: 'List call history',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          cursor: { type: 'string' },
          limit: { type: 'integer', minimum: 1, maximum: 100 },
        },
      },
    },
  }, async (request) => {
    const { cursor, limit } = z.object({
      cursor: z.string().optional(),
      limit: z.coerce.number().min(1).max(100).optional(),
    }).parse(request.query)

    const userId = BigInt(request.user.sub)
    const result = await CallsService.listCallHistory(app.prisma, userId, cursor, limit)
    return { data: result }
  })
}

export default callRoutes
