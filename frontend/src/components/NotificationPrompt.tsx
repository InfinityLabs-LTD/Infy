import { useState } from 'react'
import { useNotifications } from '@/hooks/useNotifications'

const DISMISS_KEY = 'infy:notif-prompt-dismissed'

/**
 * Lightweight prompt encouraging the user to enable push notifications.
 *
 * - On iOS, Web Push only works once the app is installed to the Home Screen,
 *   and the permission dialog must come from a user gesture. So we either show
 *   an "Add to Home Screen" hint, or a button that requests permission on tap.
 * - On other platforms we show the enable button when permission is still
 *   'default'.
 */
export function NotificationPrompt() {
  const { supported, permission, needsIosInstall, subscribed, enable } = useNotifications()
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(DISMISS_KEY) === '1',
  )
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  if (!supported || dismissed) return null
  // Прячем плашку только когда подписка реально оформлена, либо доступ запрещён.
  if (permission === 'denied') return null
  if (permission === 'granted' && subscribed) return null

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1')
    setDismissed(true)
  }

  const handleEnable = async () => {
    setBusy(true)
    setFailed(false)
    try {
      await enable()
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-3 mb-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-xl">
      {needsIosInstall ? (
        <p className="text-sm text-white/80">
          Чтобы получать уведомления на iPhone, добавьте Infy на главный экран:
          нажмите <span className="font-medium">«Поделиться»</span> →
          <span className="font-medium"> «На экран “Домой”»</span>.
        </p>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-white/80">
            {failed
              ? 'Не удалось включить уведомления. Попробуйте ещё раз.'
              : 'Включить уведомления о новых сообщениях?'}
          </p>
          <button
            onClick={() => void handleEnable()}
            disabled={busy}
            className="shrink-0 rounded-xl bg-purple-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-purple-400 disabled:opacity-50"
          >
            {busy ? 'Включаем…' : failed ? 'Повторить' : 'Включить'}
          </button>
        </div>
      )}
      <button
        onClick={dismiss}
        className="mt-2 text-xs text-white/40 hover:text-white/60"
      >
        Скрыть
      </button>
    </div>
  )
}
