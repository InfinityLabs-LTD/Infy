import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { env } from './env.js'
import { Errors } from './errors.js'

export interface AccessTokenPayload {
  sub: string   // userId as string (BigInt serialized)
  username: string
  role: string
  sessionId: string
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  })
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload
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
