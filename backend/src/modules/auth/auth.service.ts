import argon2 from 'argon2'
import crypto from 'crypto'
import { PrismaClient } from '@prisma/client'
import type Redis from 'ioredis'
import {
  signAccessToken,
  generateRefreshToken,
  hashRefreshToken,
} from '../../lib/jwt.js'
import { markSessionActive, revokeSession, revokeSessions } from '../../lib/sessionStore.js'
import { Errors } from '../../lib/errors.js'
import { getActiveSanction } from '../../lib/sanctions.js'
import { isReservedUsername } from '../../lib/reservedUsernames.js'
import { RegisterInput, LoginInput } from './auth.schema.js'
import { mailAvailable, sendPasswordResetEmail } from '../../lib/mailer.js'
import { env } from '../../lib/env.js'

// Человекочитаемое сообщение о бане для отказа во входе.
function banMessage(reason: string, expiresAt: Date | null): string {
  if (expiresAt) {
    const until = expiresAt.toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
    return `Аккаунт заблокирован до ${until}. Причина: ${reason}`
  }
  return `Аккаунт заблокирован бессрочно. Причина: ${reason}`
}

// Срок жизни ссылки смены пароля.
const RESET_TOKEN_TTL_MS = 24 * 3_600_000

// Алфавит без визуально похожих символов (0/O, 1/l/I) — пароль легко продиктовать.
const PWD_ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'

// Криптостойкий читаемый пароль для админской смены.
export function generatePassword(length = 16): string {
  const bytes = crypto.randomBytes(length)
  let out = ''
  for (let i = 0; i < length; i++) out += PWD_ALPHABET[bytes[i] % PWD_ALPHABET.length]
  return out
}

interface TokenPair {
  accessToken: string
  refreshToken: string
  sessionId: string
}

// Бейдж в сериализованном виде (то, что уходит на клиент).
export interface SerializedBadge {
  slug: string
  label: string
  color: string
  icon: string
  description: string | null
}

// Достаёт бейджи из связи UserBadge[] (если она была загружена через include).
function serializeBadges(user: {
  badges?: { badge: { slug: string; label: string; color: string; icon: string; description: string | null } }[]
}): SerializedBadge[] {
  return (user.badges ?? []).map(b => ({
    slug: b.badge.slug,
    label: b.badge.label,
    color: b.badge.color,
    icon: b.badge.icon,
    description: b.badge.description,
  }))
}

export function serializeUser(user: { id: bigint; username: string; nickname: string; avatarUrl: string | null; coverUrl: string | null; bio: string | null; role: string; email: string | null; emailVerifiedAt?: Date | null; birthdate: Date | null; timezone?: string | null; aiSuggestReplies?: boolean; notifyPopup?: boolean; notifySound?: boolean; notifyVibrate?: boolean; interests?: string[]; createdAt: Date; lastSeenAt: Date; badges?: { badge: { slug: string; label: string; color: string; icon: string; description: string | null } }[] }) {
  return {
    id: user.id.toString(),
    username: user.username,
    nickname: user.nickname,
    avatarUrl: user.avatarUrl,
    coverUrl: user.coverUrl,
    bio: user.bio,
    role: user.role,
    email: user.email,
    // Привязана ли (подтверждена) почта — нужно для смены username и UI.
    emailVerified: user.emailVerifiedAt != null,
    birthdate: user.birthdate,
    timezone: user.timezone ?? null,
    aiSuggestReplies: user.aiSuggestReplies ?? true,
    notifyPopup: user.notifyPopup ?? true,
    notifySound: user.notifySound ?? true,
    notifyVibrate: user.notifyVibrate ?? true,
    interests: user.interests ?? [],
    badges: serializeBadges(user),
    createdAt: user.createdAt,
    lastSeenAt: user.lastSeenAt,
  }
}

async function createTokenPair(
  prisma: PrismaClient,
  redis: Redis,
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

  // H-3: регистрируем сессию в allowlist активных.
  await markSessionActive(redis, session.id)

  return { accessToken, refreshToken: rawRefreshToken, sessionId: session.id }
}

export async function register(
  prisma: PrismaClient,
  redis: Redis,
  input: RegisterInput,
  meta: { userAgent?: string; ip?: string },
) {
  if (isReservedUsername(input.username)) throw Errors.USERNAME_RESERVED()

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

  const tokens = await createTokenPair(prisma, redis, user.id, {
    deviceName: 'Web',
    userAgent: meta.userAgent,
    ip: meta.ip,
  })

  return { user: serializeUser(user), ...tokens }
}

export async function login(
  prisma: PrismaClient,
  redis: Redis,
  input: LoginInput,
  meta: { userAgent?: string; ip?: string },
) {
  const user = await prisma.user.findUnique({ where: { username: input.username } })
  if (!user) throw Errors.INVALID_PASSWORD()

  const valid = await argon2.verify(user.passwordHash, input.password)
  if (!valid) throw Errors.INVALID_PASSWORD()

  // Бан блокирует вход полностью.
  const ban = await getActiveSanction(prisma, user.id, 'BAN')
  if (ban) throw Errors.ACCOUNT_BANNED(banMessage(ban.reason, ban.expiresAt), ban.expiresAt)

  await prisma.user.update({
    where: { id: user.id },
    data: { lastSeenAt: new Date() },
  })

  // Дедуп: повторный вход с того же устройства (тот же User-Agent) не должен
  // плодить новые сессии — иначе счётчик «Устройства» завышается и в списке
  // появляются дубликаты. Гасим прежние активные сессии этого же устройства.
  if (meta.userAgent) {
    const dupes = await prisma.deviceSession.findMany({
      where: { userId: user.id, revokedAt: null, userAgent: meta.userAgent },
      select: { id: true },
    })
    if (dupes.length > 0) {
      await prisma.deviceSession.updateMany({
        where: { id: { in: dupes.map(d => d.id) } },
        data: { revokedAt: new Date() },
      })
      // H-3: гасим и в allowlist, иначе старый access-токен этого устройства
      // продолжал бы работать.
      await revokeSessions(redis, dupes.map(d => d.id))
    }
  }

  const tokens = await createTokenPair(prisma, redis, user.id, {
    deviceName: 'Web',
    userAgent: meta.userAgent,
    ip: meta.ip,
  })

  return { user: serializeUser(user), ...tokens }
}

export async function refresh(
  prisma: PrismaClient,
  redis: Redis,
  rawRefreshToken: string,
  meta: { userAgent?: string; ip?: string },
) {
  const tokenHash = hashRefreshToken(rawRefreshToken)

  const session = await prisma.deviceSession.findUnique({ where: { refreshTokenHash: tokenHash } })
  if (!session) throw Errors.TOKEN_INVALID()
  if (session.revokedAt) throw Errors.SESSION_REVOKED()

  // Бан, выданный во время активной сессии, отрезает доступ при следующем refresh
  // (≤ 15 мин — срок жизни access-токена).
  const ban = await getActiveSanction(prisma, session.userId, 'BAN')
  if (ban) throw Errors.ACCOUNT_BANNED(banMessage(ban.reason, ban.expiresAt), ban.expiresAt)

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

  // H-3: продлеваем TTL ключа активной сессии (и восстанавливаем его, если
  // Redis терял данные) — сессия по-прежнему жива.
  await markSessionActive(redis, session.id)

  return { accessToken, refreshToken: newRawToken }
}

// ── Смена пароля ─────────────────────────────────────────────

// Установить новый пароль и отозвать все активные сессии пользователя
// (после смены пароля все устройства должны перелогиниться).
export async function setUserPassword(prisma: PrismaClient, redis: Redis, userId: bigint, newPassword: string) {
  const passwordHash = await argon2.hash(newPassword)
  // Сначала собираем id отзываемых сессий — нужно почистить allowlist.
  const toRevoke = await prisma.deviceSession.findMany({
    where: { userId, revokedAt: null },
    select: { id: true },
  })
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
    prisma.deviceSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
    // Гасим все ещё не использованные ссылки смены пароля этого пользователя.
    prisma.passwordResetToken.updateMany({
      where: { userId, consumedAt: null },
      data: { consumedAt: new Date() },
    }),
  ])
  // H-3: немедленный отзыв access-токенов всех устройств.
  await revokeSessions(redis, toRevoke.map(s => s.id))
}

// Сменить пароль самостоятельно (из настроек): проверяем текущий пароль и
// отзываем все остальные сессии, кроме текущей — устройство, с которого
// меняют пароль, остаётся в системе.
export async function changePassword(
  prisma: PrismaClient,
  redis: Redis,
  userId: bigint,
  currentSessionId: string,
  currentPassword: string,
  newPassword: string,
) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })

  const valid = await argon2.verify(user.passwordHash, currentPassword)
  if (!valid) throw Errors.CURRENT_PASSWORD_WRONG()

  const same = await argon2.verify(user.passwordHash, newPassword)
  if (same) throw Errors.SAME_PASSWORD()

  const passwordHash = await argon2.hash(newPassword)
  const toRevoke = await prisma.deviceSession.findMany({
    where: { userId, revokedAt: null, id: { not: currentSessionId } },
    select: { id: true },
  })
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
    prisma.deviceSession.updateMany({
      where: { userId, revokedAt: null, id: { not: currentSessionId } },
      data: { revokedAt: new Date() },
    }),
    prisma.passwordResetToken.updateMany({
      where: { userId, consumedAt: null },
      data: { consumedAt: new Date() },
    }),
  ])
  // H-3: отзываем все устройства кроме текущего.
  await revokeSessions(redis, toRevoke.map(s => s.id))
}

// Создать одноразовый токен смены пароля. Возвращает сырой токен (его нужно
// вставить в ссылку — в БД хранится только хэш).
export async function createPasswordResetToken(prisma: PrismaClient, userId: bigint): Promise<string> {
  const rawToken = crypto.randomBytes(32).toString('base64url')
  const tokenHash = hashRefreshToken(rawToken)
  await prisma.passwordResetToken.create({
    data: {
      userId,
      tokenHash,
      expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    },
  })
  return rawToken
}

// Сменить пароль по токену из ссылки (самостоятельная смена пользователем).
export async function resetPasswordWithToken(prisma: PrismaClient, redis: Redis, rawToken: string, newPassword: string) {
  const tokenHash = hashRefreshToken(rawToken)
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } })
  if (!record || record.consumedAt || record.expiresAt < new Date()) {
    throw Errors.RESET_TOKEN_INVALID()
  }

  const passwordHash = await argon2.hash(newPassword)
  const toRevoke = await prisma.deviceSession.findMany({
    where: { userId: record.userId, revokedAt: null },
    select: { id: true },
  })
  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { consumedAt: new Date() } }),
    prisma.deviceSession.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ])
  // H-3: после сброса пароля отзываем access-токены всех устройств.
  await revokeSessions(redis, toRevoke.map(s => s.id))
}

// Запрос на сброс пароля по почте. Молча завершается, если почта не найдена
// или отправка недоступна — чтобы не раскрывать существование аккаунта.
export async function requestPasswordReset(prisma: PrismaClient, email: string): Promise<void> {
  if (!(await mailAvailable(prisma))) return

  const user = await prisma.user.findFirst({
    where: { email: email.toLowerCase().trim(), emailVerifiedAt: { not: null } },
    select: { id: true },
  })
  if (!user) return

  const rawToken = await createPasswordResetToken(prisma, user.id)
  const base = (env.APP_PUBLIC_URL || env.CORS_ORIGINS.split(',')[0] || '').replace(/\/+$/, '')
  const resetUrl = `${base}/reset-password?token=${rawToken}`
  await sendPasswordResetEmail(prisma, email, resetUrl).catch(() => {
    // Не ломаем флоу, если письмо не ушло — логируется на уровне transport
  })
}

export async function logout(prisma: PrismaClient, redis: Redis, sessionId: string) {
  await prisma.deviceSession.update({
    where: { id: sessionId },
    data: { revokedAt: new Date() },
  }).catch(() => {
    // Session may already be gone — ignore
  })
  // H-3: убираем сессию из allowlist — access-токен мгновенно недействителен.
  await revokeSession(redis, sessionId)
}
