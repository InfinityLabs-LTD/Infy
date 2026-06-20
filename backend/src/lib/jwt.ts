import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { env, JWT_ISSUER, JWT_AUDIENCE } from './env.js'
import { Errors } from './errors.js'

export interface AccessTokenPayload {
  sub: string   // userId as string (BigInt serialized)
  username: string
  role: string
  sessionId: string
}

export function signAccessToken(payload: AccessTokenPayload): string {
  // H-5: пиннинг алгоритма + issuer/audience, чтобы токен нельзя было
  // подсунуть с другим alg и чтобы он был привязан к этому сервису.
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    algorithm: 'HS256',
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  })
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    // H-5: фиксируем допустимый алгоритм и проверяем iss/aud.
    return jwt.verify(token, env.JWT_ACCESS_SECRET, {
      algorithms: ['HS256'],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    }) as AccessTokenPayload
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) throw Errors.TOKEN_EXPIRED()
    throw Errors.TOKEN_INVALID()
  }
}

export function generateRefreshToken(): string {
  return crypto.randomBytes(48).toString('base64url')
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}
