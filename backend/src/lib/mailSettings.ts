import { PrismaClient } from '@prisma/client'
import { env } from './env.js'

// Настройки SMTP для отправки писем. Хранятся в app_settings (строками),
// с фолбэком на переменные окружения. Аналогично aiSettings.ts.

const KEYS = {
  enabled: 'mail.enabled',
  host: 'mail.smtp.host',
  port: 'mail.smtp.port',
  secure: 'mail.smtp.secure',
  user: 'mail.smtp.user',
  pass: 'mail.smtp.pass',
  from: 'mail.from',
  fromName: 'mail.fromName',
} as const

export interface MailConfig {
  enabled: boolean
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
  from: string
  fromName: string
}

// Безопасное представление для админки — без пароля (только признак, что он задан).
export interface MailSettingsPublic {
  enabled: boolean
  host: string
  port: number
  secure: boolean
  user: string
  hasPass: boolean
  from: string
  fromName: string
}

async function readAll(prisma: PrismaClient): Promise<Map<string, string>> {
  const rows = await prisma.appSetting.findMany({
    where: { key: { in: Object.values(KEYS) } },
  })
  return new Map(rows.map(r => [r.key, r.value]))
}

function pick(map: Map<string, string>, key: string, fallback: string): string {
  const v = map.get(key)
  return v !== undefined && v !== '' ? v : fallback
}

// Полная конфигурация (включая пароль) для реальной отправки.
export async function getMailConfig(prisma: PrismaClient): Promise<MailConfig> {
  const map = await readAll(prisma)

  const host = pick(map, KEYS.host, env.MAIL_SMTP_HOST)
  const port = Number(pick(map, KEYS.port, String(env.MAIL_SMTP_PORT))) || 587
  const secureRaw = map.get(KEYS.secure)
  const secure = secureRaw !== undefined ? secureRaw === 'true' : env.MAIL_SMTP_SECURE
  const user = pick(map, KEYS.user, env.MAIL_SMTP_USER)
  const pass = pick(map, KEYS.pass, env.MAIL_SMTP_PASS)
  const from = pick(map, KEYS.from, env.MAIL_FROM)
  const fromName = pick(map, KEYS.fromName, env.MAIL_FROM_NAME)

  // По умолчанию включено, если задан хост.
  const enabledRaw = map.get(KEYS.enabled)
  const enabled = enabledRaw !== undefined ? enabledRaw === 'true' : host.length > 0

  return { enabled, host, port, secure, user, pass, from, fromName }
}

// Доступна ли отправка прямо сейчас: включена И задан хост.
export async function mailAvailable(prisma: PrismaClient): Promise<boolean> {
  const c = await getMailConfig(prisma)
  return c.enabled && c.host.length > 0
}

// Безопасные настройки для админки.
export async function getMailSettingsPublic(prisma: PrismaClient): Promise<MailSettingsPublic> {
  const c = await getMailConfig(prisma)
  return {
    enabled: c.enabled,
    host: c.host,
    port: c.port,
    secure: c.secure,
    user: c.user,
    hasPass: c.pass.length > 0,
    from: c.from,
    fromName: c.fromName,
  }
}

export interface MailSettingsUpdate {
  enabled?: boolean
  host?: string
  port?: number
  secure?: boolean
  user?: string
  pass?: string        // '' очищает; undefined — не трогать
  from?: string
  fromName?: string
}

// Сохранить настройки из админки. Ключи, пришедшие undefined, не меняются.
export async function updateMailSettings(
  prisma: PrismaClient,
  patch: MailSettingsUpdate,
): Promise<MailSettingsPublic> {
  const writes: { key: string; value: string }[] = []
  if (patch.enabled !== undefined) writes.push({ key: KEYS.enabled, value: String(patch.enabled) })
  if (patch.host !== undefined) writes.push({ key: KEYS.host, value: patch.host.trim() })
  if (patch.port !== undefined) writes.push({ key: KEYS.port, value: String(patch.port) })
  if (patch.secure !== undefined) writes.push({ key: KEYS.secure, value: String(patch.secure) })
  if (patch.user !== undefined) writes.push({ key: KEYS.user, value: patch.user.trim() })
  if (patch.pass !== undefined) writes.push({ key: KEYS.pass, value: patch.pass })
  if (patch.from !== undefined) writes.push({ key: KEYS.from, value: patch.from.trim() })
  if (patch.fromName !== undefined) writes.push({ key: KEYS.fromName, value: patch.fromName.trim() })

  if (writes.length > 0) {
    await prisma.$transaction(
      writes.map(w =>
        prisma.appSetting.upsert({
          where: { key: w.key },
          update: { value: w.value },
          create: { key: w.key, value: w.value },
        }),
      ),
    )
  }

  return getMailSettingsPublic(prisma)
}
