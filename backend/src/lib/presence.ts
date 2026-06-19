import Redis from 'ioredis'

const PREFIX = 'presence:'
const CONN_PREFIX = 'presence:conns:'   // счётчик активных сокетов пользователя
const SET_KEY = 'presence:online'   // SET всех потенциально-онлайн userId
const TTL_SEC = 35   // client pings every 25s; expire after 35s if silent
const CONN_TTL_SEC = 120   // страховочный TTL счётчика соединений (от утечек при крэше)

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

/**
 * Регистрирует новое соединение (сокет) пользователя: атомарно инкрементит
 * счётчик соединений и помечает онлайн. Возвращает число активных соединений
 * после инкремента. Используется вместо ненадёжного fetchSockets().length для
 * определения «есть ли ещё активные сокеты» (H-3).
 */
export async function addConnection(redis: Redis, userId: string): Promise<number> {
  const res = await redis
    .multi()
    .incr(`${CONN_PREFIX}${userId}`)
    .expire(`${CONN_PREFIX}${userId}`, CONN_TTL_SEC)
    .setex(`${PREFIX}${userId}`, TTL_SEC, '1')
    .sadd(SET_KEY, userId)
    .exec()
  const count = res?.[0]?.[1]
  return typeof count === 'number' ? count : 1
}

/**
 * Снимает соединение пользователя: декрементит счётчик. Если он достиг 0 (или
 * ушёл в минус из-за рассинхрона) — переводит в offline и чистит индекс.
 * Возвращает оставшееся число активных соединений (>=0).
 */
export async function removeConnection(redis: Redis, userId: string): Promise<number> {
  const res = await redis.decr(`${CONN_PREFIX}${userId}`)
  const remaining = typeof res === 'number' ? res : 0
  if (remaining <= 0) {
    await redis
      .multi()
      .del(`${CONN_PREFIX}${userId}`)
      .del(`${PREFIX}${userId}`)
      .srem(SET_KEY, userId)
      .exec()
    return 0
  }
  // Ещё есть живые соединения — продлеваем страховочный TTL счётчика.
  await redis.expire(`${CONN_PREFIX}${userId}`, CONN_TTL_SEC).catch(() => {})
  return remaining
}

export async function refreshPresence(redis: Redis, userId: string): Promise<void> {
  // Продлеваем TTL присутствия и страховочный TTL счётчика соединений, а также
  // гарантируем членство в SET (на случай гонки с setOffline).
  await redis
    .multi()
    .expire(`${PREFIX}${userId}`, TTL_SEC)
    .expire(`${CONN_PREFIX}${userId}`, CONN_TTL_SEC)
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
