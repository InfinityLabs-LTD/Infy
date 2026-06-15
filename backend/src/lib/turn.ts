import { createHmac } from 'crypto'
import { env } from './env.js'

export interface IceServer {
  urls: string | string[]
  username?: string
  credential?: string
}

/**
 * Собирает список ICE-серверов для клиента.
 *
 * STUN отдаётся всегда (публичные адреса). TURN — только если задан секрет:
 * используется схема coturn `use-auth-secret` (REST API TURN, RFC 5766 §10.2):
 * username = "<expiry-unix>:<userId>", credential = base64(HMAC-SHA1(secret, username)).
 * Такие credentials живут TURN_TTL_SEC секунд и не требуют хранить статические пароли.
 */
export function buildIceServers(userId: string): IceServer[] {
  const servers: IceServer[] = []

  const stun = env.STUN_URLS.split(',').map(s => s.trim()).filter(Boolean)
  if (stun.length > 0) servers.push({ urls: stun })

  const turnUrls = env.TURN_URLS.split(',').map(s => s.trim()).filter(Boolean)
  if (turnUrls.length > 0 && env.TURN_SECRET) {
    const expiry = Math.floor(Date.now() / 1000) + env.TURN_TTL_SEC
    const username = `${expiry}:${userId}`
    const credential = createHmac('sha1', env.TURN_SECRET)
      .update(username)
      .digest('base64')
    servers.push({ urls: turnUrls, username, credential })
  }

  return servers
}
