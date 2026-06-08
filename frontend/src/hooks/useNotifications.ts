import { useEffect } from 'react'
import { useAuthStore } from '@/store/auth'
import { pushApi } from '@/api/push'

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  return new Uint8Array([...raw].map(c => c.charCodeAt(0)))
}

export function useNotifications() {
  const accessToken = useAuthStore((s) => s.accessToken)

  useEffect(() => {
    if (!accessToken) return
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) return

    const setup = async () => {
      const permission =
        Notification.permission === 'default'
          ? await Notification.requestPermission()
          : Notification.permission

      if (permission !== 'granted') return

      try {
        const registration = await navigator.serviceWorker.ready

        const existing = await registration.pushManager.getSubscription()
        if (existing) return

        const { data } = await pushApi.getVapidPublicKey()
        const applicationServerKey = urlBase64ToUint8Array(data.data.publicKey)

        const sub = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        })

        const json = sub.toJSON()
        const keys = json.keys as Record<string, string>
        await pushApi.subscribe(json.endpoint!, keys.p256dh, keys.auth)
      } catch {
        // Push not supported or blocked — silent fail
      }
    }

    const timer = setTimeout(setup, 2000)
    return () => clearTimeout(timer)
  }, [accessToken])
}
