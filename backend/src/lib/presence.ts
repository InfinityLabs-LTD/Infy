import Redis from 'ioredis'

const PREFIX = 'presence:'
const TTL_SEC = 35   // client pings every 25s; expire after 35s if silent

export async function setOnline(redis: Redis, userId: string): Promise<void> {
  await redis.setex(`${PREFIX}${userId}`, TTL_SEC, '1')
}

export async function setOffline(redis: Redis, userId: string): Promise<void> {
  await redis.del(`${PREFIX}${userId}`)
}

export async function isOnline(redis: Redis, userId: string): Promise<boolean> {
  return (await redis.exists(`${PREFIX}${userId}`)) === 1
}

export async function refreshPresence(redis: Redis, userId: string): Promise<void> {
  await redis.expire(`${PREFIX}${userId}`, TTL_SEC)
}
