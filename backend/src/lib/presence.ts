import Redis from 'ioredis'

const PREFIX = 'presence:'
const SET_KEY = 'presence:online'   // SET всех потенциально-онлайн userId
const TTL_SEC = 35   // client pings every 25s; expire after 35s if silent

// Presence хранится двумя структурами:
//   1) per-user TTL-ключ `presence:<id>` — источник истины «онлайн ли юзер»
//      (автоистечение через TTL_SEC, если клиент перестал слать ping);
//   2) SET `presence:online` — индекс для быстрого перечисления онлайна без
//      блокирующего KEYS. Членство в SET может «протухать» (TTL-ключ истёк, а из
//      SET убрать некому), поэтому getOnlineUserIds лениво сверяет SET с
//      TTL-ключами через pipeline и подчищает мусор.

export async function setOnline(redis: Redis, userId: string): Promise<void> {
  await redis
    .multi()
    .setex(`${PREFIX}${userId}`, TTL_SEC, '1')
    .sadd(SET_KEY, userId)
    .exec()
}

export async function setOffline(redis: Redis, userId: string): Promise<void> {
  await redis
    .multi()
    .del(`${PREFIX}${userId}`)
    .srem(SET_KEY, userId)
    .exec()
}

export async function isOnline(redis: Redis, userId: string): Promise<boolean> {
  return (await redis.exists(`${PREFIX}${userId}`)) === 1
}

/** Батч-проверка присутствия: один round-trip вместо N. */
export async function areOnline(redis: Redis, userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set()
  const pipeline = redis.pipeline()
  for (const id of userIds) pipeline.exists(`${PREFIX}${id}`)
  const res = await pipeline.exec()
  const online = new Set<string>()
  res?.forEach(([, val], i) => {
    if (val === 1) online.add(userIds[i])
  })
  return online
}

export async function refreshPresence(redis: Redis, userId: string): Promise<void> {
  // Продлеваем TTL и гарантируем членство в SET (на случай гонки с setOffline).
  await redis
    .multi()
    .expire(`${PREFIX}${userId}`, TTL_SEC)
    .sadd(SET_KEY, userId)
    .exec()
}

/**
 * Возвращает актуальный список онлайн-пользователей. Читает кандидатов из SET
 * (O(1) вместо KEYS O(N) по всему keyspace), затем одним pipeline проверяет
 * TTL-ключи и лениво удаляет из SET протухшие записи.
 */
export async function getOnlineUserIds(redis: Redis): Promise<string[]> {
  const candidates = await redis.smembers(SET_KEY)
  if (candidates.length === 0) return []

  const pipeline = redis.pipeline()
  for (const id of candidates) pipeline.exists(`${PREFIX}${id}`)
  const res = await pipeline.exec()

  const online: string[] = []
  const stale: string[] = []
  candidates.forEach((id, i) => {
    if (res?.[i]?.[1] === 1) online.push(id)
    else stale.push(id)
  })

  if (stale.length > 0) redis.srem(SET_KEY, ...stale).catch(() => {})
  return online
}
