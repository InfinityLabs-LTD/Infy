import { FastifyRequest, FastifyReply } from 'fastify'
import { verifyAccessToken, AccessTokenPayload } from '../lib/jwt.js'
import { Errors } from '../lib/errors.js'
import { isSessionActive, markSessionActive } from '../lib/sessionStore.js'

declare module 'fastify' {
  interface FastifyRequest {
    user: AccessTokenPayload
  }
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const authHeader = request.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    throw Errors.UNAUTHORIZED()
  }

  const token = authHeader.slice(7)
  const payload = verifyAccessToken(token)

  // H-3 / M-4: проверяем, что сессия не отозвана. allowlist в Redis удаляется
  // при logout/ban/смене пароля/revoke, поэтому украденный или «переживший
  // logout» access-токен перестаёт работать сразу, а не через 15 минут.
  const redis = request.server.redis
  if (await isSessionActive(redis, payload.sessionId)) {
    request.user = payload
    return
  }

  // Ключа в Redis нет — это либо сессия, созданная до внедрения allowlist,
  // либо потеря кэша Redis, либо реально отозванная сессия. Сверяемся с БД
  // (источник истины) и при живой сессии лениво восстанавливаем ключ.
  // Отозванная в БД сессия так НЕ восстановится.
  const session = await request.server.prisma.deviceSession.findUnique({
    where: { id: payload.sessionId },
    select: { revokedAt: true },
  })
  if (!session || session.revokedAt) {
    throw Errors.SESSION_REVOKED()
  }
  await markSessionActive(redis, payload.sessionId)
  request.user = payload
}

export async function requireAdmin(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  if (request.user?.role !== 'ADMIN') {
    throw Errors.FORBIDDEN()
  }
}
