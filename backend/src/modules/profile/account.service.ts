import crypto from 'crypto'
import { PrismaClient } from '@prisma/client'
import { Errors } from '../../lib/errors.js'
import { isReservedUsername } from '../../lib/reservedUsernames.js'
import { mailEnabled, sendVerificationCode } from '../../lib/mailer.js'

// Срок жизни кода подтверждения почты.
const EMAIL_CODE_TTL_MS = 15 * 60_000
// Сколько неверных вводов кода допускается до инвалидации.
const MAX_CODE_ATTEMPTS = 5

function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex')
}

// 6-значный код (000000–999999), с ведущими нулями.
function generateCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0')
}

// ── Привязка почты ───────────────────────────────────────────

// Запросить привязку почты: создаём код, шлём письмо. Возвращает адрес,
// на который отправлен код (для отображения в UI).
export async function requestEmailBinding(
  prisma: PrismaClient,
  userId: bigint,
  rawEmail: string,
): Promise<{ email: string }> {
  if (!mailEnabled()) throw Errors.EMAIL_SENDING_DISABLED()

  const email = rawEmail.trim().toLowerCase()

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
  // Если почта уже привязана и подтверждена — повторная привязка не нужна.
  if (user.email && user.emailVerifiedAt) throw Errors.EMAIL_ALREADY_BOUND()

  // Адрес не должен быть занят подтверждённой почтой другого пользователя.
  const taken = await prisma.user.findFirst({
    where: { email, emailVerifiedAt: { not: null }, id: { not: userId } },
  })
  if (taken) throw Errors.EMAIL_TAKEN()

  const code = generateCode()

  // Один активный код на пользователя: гасим прежние неподтверждённые.
  await prisma.emailVerificationToken.updateMany({
    where: { userId, consumedAt: null },
    data: { consumedAt: new Date() },
  })
  await prisma.emailVerificationToken.create({
    data: {
      userId,
      email,
      codeHash: hashCode(code),
      expiresAt: new Date(Date.now() + EMAIL_CODE_TTL_MS),
    },
  })

  try {
    await sendVerificationCode(email, code)
  } catch {
    // Письмо не ушло — гасим только что созданный токен, чтобы не оставлять висяк.
    await prisma.emailVerificationToken.updateMany({
      where: { userId, consumedAt: null },
      data: { consumedAt: new Date() },
    })
    throw Errors.EMAIL_SEND_FAILED()
  }

  return { email }
}

// Подтвердить почту введённым кодом. При успехе записывает email + emailVerifiedAt.
export async function confirmEmailBinding(
  prisma: PrismaClient,
  userId: bigint,
  code: string,
): Promise<void> {
  const record = await prisma.emailVerificationToken.findFirst({
    where: { userId, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  })
  if (!record || record.expiresAt < new Date() || record.attempts >= MAX_CODE_ATTEMPTS) {
    throw Errors.EMAIL_VERIFY_CODE_INVALID()
  }

  if (record.codeHash !== hashCode(code.trim())) {
    await prisma.emailVerificationToken.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    })
    throw Errors.EMAIL_VERIFY_CODE_INVALID()
  }

  // Перепроверяем уникальность на момент подтверждения (гонка между запросом и вводом).
  const taken = await prisma.user.findFirst({
    where: { email: record.email, emailVerifiedAt: { not: null }, id: { not: userId } },
  })
  if (taken) throw Errors.EMAIL_TAKEN()

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { email: record.email, emailVerifiedAt: new Date() },
    }),
    prisma.emailVerificationToken.update({
      where: { id: record.id },
      data: { consumedAt: new Date() },
    }),
  ])
}

// ── Смена username ───────────────────────────────────────────

// Сменить username. Доступно только при подтверждённой почте. После смены —
// все сессии отзываются (нужно перелогиниться на всех устройствах).
export async function changeUsername(
  prisma: PrismaClient,
  userId: bigint,
  rawUsername: string,
): Promise<void> {
  const username = rawUsername.trim().toLowerCase()

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
  if (!user.emailVerifiedAt) throw Errors.EMAIL_REQUIRED_FOR_USERNAME()

  if (username === user.username) return // нечего менять

  if (isReservedUsername(username)) throw Errors.USERNAME_RESERVED()

  const existing = await prisma.user.findFirst({
    where: { username, id: { not: userId } },
  })
  if (existing) throw Errors.USERNAME_TAKEN()

  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { username } }),
    // Выкидываем со ВСЕХ устройств, включая текущее.
    prisma.deviceSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ])
}
