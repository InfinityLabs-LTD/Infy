import { FastifyRequest, FastifyReply } from 'fastify'
import { verifyAccessToken, AccessTokenPayload } from '../lib/jwt.js'
import { Errors } from '../lib/errors.js'

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
  request.user = verifyAccessToken(token)
}

export async function requireAdmin(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  if (request.user?.role !== 'ADMIN') {
    throw Errors.FORBIDDEN()
  }
}
