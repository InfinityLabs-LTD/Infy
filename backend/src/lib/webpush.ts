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

export async function sendPush(sub: PushSubscriptionKeys, payload: PushPayload): Promise<void> {
  await webpush.sendNotification(
    {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.p256dh, auth: sub.auth },
    },
    JSON.stringify(payload),
  )
}
