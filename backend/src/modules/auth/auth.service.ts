import argon2 from 'argon2'
import { PrismaClient } from '@prisma/client'
import {
  signAccessToken,
  generateRefreshToken,
  hashRefreshToken,
} from '../../lib/jwt.js'
import { Errors } from '../../lib/errors.js'
import { RegisterInput, LoginInput } from './auth.schema.js'

interface TokenPair {
  accessToken: string
  refreshToken: string
  sessionId: string
}

export function serializeUser(user: { id: bigint; username: string; nickname: string; avatarUrl: string | null; role: string; email: string | null; createdAt: Date; lastSeenAt: Date }) {
  return {
    id: user.id.toString(),
    username: user.username,
    nickname: user.nickname,
    avatarUrl: user.avatarUrl,
    role: user.role,
    email: user.email,
    createdAt: user.createdAt,
    lastSeenAt: user.lastSeenAt,
  }
}

async function createTokenPair(
  prisma: PrismaClient,
  userId: bigint,
  meta: { deviceName?: string; userAgent?: string; ip?: string },
): Promise<TokenPair> {
  const rawRefreshToken = generateRefreshToken()
  const refreshTokenHash = hashRefreshToken(rawRefreshToken)

  const session = await prisma.deviceSession.create({
    data: {
      userId,
      refreshTokenHash,
      deviceName: meta.deviceName,
      userAgent: meta.userAgent,
      ip: meta.ip,
    },
  })

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })

  const accessToken = signAccessToken({
    sub: userId.toString(),
    username: user.username,
    role: user.role,
    sessionId: session.id,
  })

  return { accessToken, refreshToken: rawRefreshToken, sessionId: session.id }
}

export async function register(
  prisma: PrismaClient,
  input: RegisterInput,
  meta: { userAgent?: string; ip?: string },
) {
  const existing = await prisma.user.findUnique({ where: { username: input.username } })
  if (existing) throw Errors.USERNAME_TAKEN()

  if (input.email) {
    const emailExists = await prisma.user.findUnique({ where: { email: input.email } })
    if (emailExists) throw Errors.EMAIL_TAKEN()
  }

  const passwordHash = await argon2.hash(input.password)

  const user = await prisma.user.create({
    data: {
      username: input.username,
      nickname: input.nickname,
      passwordHash,
      email: input.email ?? null,
      birthdate: input.birthdate ? new Date(input.birthdate) : null,
    },
  })

  const tokens = await createTokenPair(prisma, user.id, {
    deviceName: 'Web',
    userAgent: meta.userAgent,
    ip: meta.ip,
  })

  return { user: serializeUser(user), ...tokens }
}

export async function login(
  prisma: PrismaClient,
  input: LoginInput,
  meta: { userAgent?: string; ip?: string },
) {
  const user = await prisma.user.findUnique({ where: { username: input.username } })
  if (!user) throw Errors.INVALID_PASSWORD()

  const valid = await argon2.verify(user.passwordHash, input.password)
  if (!valid) throw Errors.INVALID_PASSWORD()

  await prisma.user.update({
    where: { id: user.id },
    data: { lastSeenAt: new Date() },
  })

  const tokens = await createTokenPair(prisma, user.id, {
    deviceName: 'Web',
    userAgent: meta.userAgent,
    ip: meta.ip,
  })

  return { user: serializeUser(user), ...tokens }
}

export async function refresh(
  prisma: PrismaClient,
  rawRefreshToken: string,
  meta: { userAgent?: string; ip?: string },
) {
  const tokenHash = hashRefreshToken(rawRefreshToken)

  const session = await prisma.deviceSession.findUnique({ where: { refreshTokenHash: tokenHash } })
  if (!session) throw Errors.TOKEN_INVALID()
  if (session.revokedAt) throw Errors.SESSION_REVOKED()

  const newRawToken = generateRefreshToken()
  const newHash = hashRefreshToken(newRawToken)

  await prisma.deviceSession.update({
    where: { id: session.id },
    data: {
      refreshTokenHash: newHash,
      lastActiveAt: new Date(),
      userAgent: meta.userAgent ?? session.userAgent,
      ip: meta.ip ?? session.ip,
    },
  })

  const user = await prisma.user.update({
    where: { id: session.userId },
    data: { lastSeenAt: new Date() },
  })

  const accessToken = signAccessToken({
    sub: user.id.toString(),
    username: user.username,
    role: user.role,
    sessionId: session.id,
  })

  return { accessToken, refreshToken: newRawToken }
}

export async function logout(prisma: PrismaClient, sessionId: string) {
  await prisma.deviceSession.update({
    where: { id: sessionId },
    data: { revokedAt: new Date() },
  }).catch(() => {
    // Session may already be gone — ignore
  })
}
