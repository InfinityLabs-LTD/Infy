import webpush from 'web-push'
import { env } from './env.js'

webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY)

export interface PushPayload {
  title: string
  body: string
  icon?: string
  tag?: string
  url?: string
}

export interface PushSubscriptionKeys {
  endpoint: string
  p256dh: string
  auth: string
}

/**
 * Sends a push. Returns `true` on success. If the push service reports the
 * subscription is gone (404/410), returns `false` so the caller can prune it.
 * Other errors are rethrown.
 */
export async function sendPush(sub: PushSubscriptionKeys, payload: PushPayload): Promise<boolean> {
  try {
    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      },
      JSON.stringify(payload),
    )
    return true
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode
    if (status === 404 || status === 410) return false
    throw err
  }
}
