import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { reportsApi, type MySanction } from '@/api/reports'

// Уведомляет пользователя о действующих санкциях (Infy Shield):
//  • WARN — предупреждение, можно закрыть (запоминаем по id в localStorage);
//  • MUTE — действующий запрет на отправку сообщений.
// BAN не показывается здесь — забаненный не может войти (login/refresh отклоняются).
const DISMISSED_KEY = 'infy.dismissedWarns'

function getDismissed(): string[] {
  try { return JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]') } catch { return [] }
}
function addDismissed(id: string) {
  const next = [...new Set([...getDismissed(), id])]
  localStorage.setItem(DISMISSED_KEY, JSON.stringify(next))
}

function expiryLabel(expiresAt: string | null): string {
  if (!expiresAt) return 'бессрочно'
  return `до ${new Date(expiresAt).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}`
}

export function SanctionBanner() {
  const [sanctions, setSanctions] = useState<MySanction[]>([])
  const [dismissed, setDismissed] = useState<string[]>(getDismissed)

  useEffect(() => {
    reportsApi.mySanctions()
      .then(r => setSanctions(r.data.data.sanctions))
      .catch(() => {})
  }, [])

  // Активный мут и невыключенные предупреждения.
  const mute = sanctions.find(s => s.type === 'MUTE') ?? null
  const warns = sanctions.filter(s => s.type === 'WARN' && !dismissed.includes(s.id))

  function dismiss(id: string) {
    addDismissed(id)
    setDismissed(getDismissed())
  }

  const visible = [
    ...(mute ? [{ ...mute, dismissible: false as const }] : []),
    ...warns.map(w => ({ ...w, dismissible: true as const })),
  ]

  if (visible.length === 0) return null

  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[60] w-full max-w-md px-3 space-y-2">
      <AnimatePresence>
        {visible.map(s => {
          const isMute = s.type === 'MUTE'
          const color = isMute ? '#A855F7' : '#F59E0B'
          const bg = isMute ? 'rgba(168,85,247,0.12)' : 'rgba(245,158,11,0.12)'
          const border = isMute ? 'rgba(168,85,247,0.3)' : 'rgba(245,158,11,0.3)'
          return (
            <motion.div key={s.id}
              initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
              className="glass-pop rounded-2xl px-4 py-3 flex items-start gap-3"
              style={{ background: bg, border: `1px solid ${border}` }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
                className="shrink-0 mt-0.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold" style={{ color }}>
                  {isMute ? `Запрет на отправку сообщений · ${expiryLabel(s.expiresAt)}` : 'Предупреждение от модерации'}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.75)' }}>{s.reason}</p>
              </div>
              {s.dismissible && (
                <button onClick={() => dismiss(s.id)} className="shrink-0 text-white/40 hover:text-white transition-colors">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
