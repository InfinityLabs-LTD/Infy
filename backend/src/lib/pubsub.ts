import Redis from 'ioredis'

export async function publishMessage(redis: Redis, channel: string, payload: unknown): Promise<void> {
  await redis.publish(channel, JSON.stringify(payload))
}

export function subscribeToChannel(
  redis: Redis,
  channel: string,
  handler: (payload: unknown) => void,
): () => void {
  // ioredis subscriber must be a separate connection
  const sub = redis.duplicate()
  sub.subscribe(channel)
  sub.on('message', (_ch, raw) => {
    try {
      handler(JSON.parse(raw))
    } catch {
      // malformed JSON — ignore
    }
  })
  return () => { sub.disconnect() }
}
