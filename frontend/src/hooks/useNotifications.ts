import { useEffect } from 'react'

export function useNotifications() {
  useEffect(() => {
    if (!('Notification' in window)) return
    if (Notification.permission === 'default') {
      // Request permission only after user interaction — delay slightly so it's not the very first thing
      const timer = setTimeout(() => {
        Notification.requestPermission()
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [])
}
