import type Redis from 'ioredis'

// H-3 / M-4: allowlist активных сессий в Redis.
//
// Access-токены stateless и живут 15 минут, поэтому logout / «выйти со всех
// устройств» / бан / смена пароля раньше не отзывали уже выданный access-токен
// (окно до 15 мин). Здесь храним множество АКТИВНЫХ sessionId; authenticate
// проверяет наличие, а отзыв сессии немедленно удаляет ключ → access-токен
// этой сессии перестаёт работать на следующем же запросе.
//
// TTL ключа = срок жизни refresh-токена (сессия не может жить дольше). Каждый
// refresh продлевает TTL. Источник истины остаётся БД (DeviceSession); Redis —
// быстрый кэш для проверки на горячем пути без запроса в БД на каждый вызов.

const PREFIX = 'session:active:'

// 30 дней в секундах (совпадает с JWT_REFRESH_EXPIRES_IN по умолчанию).
const SESSION_TTL_SEC = 30 * 24 * 3600

function key(sessionId: string): string {
  return `${PREFIX}${sessionId}`
}

// Пометить сессию активной (при логине/регистрации/refresh).
export async function markSessionActive(
  redis: Redis,
  sessionId: string,
  ttlSec: number = SESSION_TTL_SEC,
): Promise<void> {
  await redis.set(key(sessionId), '1', 'EX', ttlSec)
}

// Удалить сессию из allowlist (при logout/ban/смене пароля/revoke).
export async function revokeSession(redis: Redis, sessionId: string): Promise<void> {
  await redis.del(key(sessionId))
}

export async function revokeSessions(redis: Redis, sessionIds: string[]): Promise<void> {
  if (sessionIds.length === 0) return
  await redis.del(...sessionIds.map(key))
}

// Активна ли сессия. Fail-open при недоступности Redis НЕ делаем для отзыва —
// но и не роняем весь API: если ключ отсутствует, сессия считается отозванной.
export async function isSessionActive(redis: Redis, sessionId: string): Promise<boolean> {
  const v = await redis.get(key(sessionId))
  return v !== null
}
