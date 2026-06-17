import { useCallback, useEffect, useState } from 'react'
import { useAuthStore } from '@/store/auth'
import { pushApi } from '@/api/push'

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  return new Uint8Array([...raw].map(c => c.charCodeAt(0)))
}

function arrayBuffersEqual(a: ArrayBuffer, b: ArrayBuffer): boolean {
  if (a.byteLength !== b.byteLength) return false
  const av = new Uint8Array(a)
  const bv = new Uint8Array(b)
  for (let i = 0; i < av.length; i++) if (av[i] !== bv[i]) return false
  return true
}

function isSupported(): boolean {
  return 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window
}

// Явный отказ пользователя от push (в настройках). Хранится локально, чтобы
// авто-переподписка при загрузке не включала уведомления обратно.
const OPT_OUT_KEY = 'infy:push-opt-out'
function isOptedOut(): boolean {
  try { return localStorage.getItem(OPT_OUT_KEY) === '1' } catch { return false }
}
function setOptedOut(v: boolean): void {
  try {
    if (v) localStorage.setItem(OPT_OUT_KEY, '1')
    else localStorage.removeItem(OPT_OUT_KEY)
  } catch { /* ignore */ }
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

function isStandalone(): boolean {
  // iOS Safari exposes navigator.standalone; others use the display-mode media query.
  return (
    (navigator as unknown as { standalone?: boolean }).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  )
}

// Creates/refreshes the push subscription and registers it on the server.
// Assumes permission has already been granted.
async function subscribeAndRegister(): Promise<void> {
  const registration = await navigator.serviceWorker.ready

  const { data } = await pushApi.getVapidPublicKey()
  const applicationServerKey = urlBase64ToUint8Array(data.data.publicKey).buffer as ArrayBuffer

  // Reuse an existing subscription only if it matches the current VAPID key;
  // otherwise (key rotated / subscription stale) drop it and re-subscribe.
  let sub = await registration.pushManager.getSubscription()
  if (sub) {
    const existingKey = sub.options.applicationServerKey
    const sameKey = existingKey != null && arrayBuffersEqual(existingKey, applicationServerKey)
    if (!sameKey) {
      await sub.unsubscribe().catch(() => {})
      sub = null
    }
  }

  if (!sub) {
    sub = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    })
  }

  // Always (re)register on the server — upsert is idempotent, and this
  // re-creates the row if the DB lost it or the endpoint changed.
  const json = sub.toJSON()
  const keys = json.keys as Record<string, string>
  await pushApi.subscribe(json.endpoint!, keys.p256dh, keys.auth)
}

export interface UseNotificationsResult {
  /** Browser supports the Web Push stack at all. */
  supported: boolean
  /** Current Notification permission ('default' | 'granted' | 'denied'). */
  permission: NotificationPermission
  /**
   * iOS only delivers Web Push to a PWA installed to the Home Screen.
   * True when we're on iOS but not yet running standalone — show an
   * "Add to Home Screen" hint instead of a permission prompt.
   */
  needsIosInstall: boolean
  /** Подписка push активна (есть и разрешение, и регистрация на сервере). */
  subscribed: boolean
  /** Request permission (must be called from a user gesture) and subscribe. */
  enable: () => Promise<void>
  /** Отписаться от push-уведомлений (локально + на сервере). */
  disable: () => Promise<void>
}

export function useNotifications(): UseNotificationsResult {
  const accessToken = useAuthStore((s) => s.accessToken)
  const supported = isSupported()
  const [permission, setPermission] = useState<NotificationPermission>(
    supported ? Notification.permission : 'denied',
  )

  const needsIosInstall = supported && isIos() && !isStandalone()
  const [subscribed, setSubscribed] = useState(false)

  // Auto-refresh the subscription when permission is already granted.
  // We never auto-prompt: iOS ignores requestPermission() outside a user
  // gesture, so prompting is deferred to enable().
  useEffect(() => {
    if (!accessToken || !supported) return
    if (Notification.permission !== 'granted' || isOptedOut()) {
      setSubscribed(false)
      return
    }

    const timer = setTimeout(() => {
      subscribeAndRegister().then(() => setSubscribed(true)).catch(() => {})
    }, 2000)
    return () => clearTimeout(timer)
  }, [accessToken, supported])

  // Отражаем фактическое наличие подписки в браузере при монтировании.
  useEffect(() => {
    if (!supported || Notification.permission !== 'granted' || isOptedOut()) return
    navigator.serviceWorker.ready
      .then(reg => reg.pushManager.getSubscription())
      .then(sub => setSubscribed(!!sub))
      .catch(() => {})
  }, [supported])

  const enable = useCallback(async () => {
    if (!supported) return
    const perm =
      Notification.permission === 'default'
        ? await Notification.requestPermission()
        : Notification.permission
    setPermission(perm)
    if (perm !== 'granted') return
    setOptedOut(false)
    // Не глотаем ошибки: на Android подписка может не создаться с первого раза
    // (SW ещё активируется), поэтому пробуем повторно и пробрасываем ошибку,
    // чтобы UI не показывал «включено», когда подписки на сервере нет.
    try {
      await subscribeAndRegister()
      setSubscribed(true)
    } catch {
      await new Promise((r) => setTimeout(r, 800))
      await subscribeAndRegister()
      setSubscribed(true)
    }
  }, [supported])

  const disable = useCallback(async () => {
    if (!supported) return
    setOptedOut(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        const endpoint = sub.endpoint
        await sub.unsubscribe().catch(() => {})
        await pushApi.unsubscribe(endpoint).catch(() => {})
      }
    } finally {
      setSubscribed(false)
    }
  }, [supported])

  return { supported, permission, needsIosInstall, subscribed, enable, disable }
}
