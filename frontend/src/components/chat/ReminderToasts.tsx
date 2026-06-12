import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useReminderStore } from '@/store/reminders'
import { useChatStore } from '@/store/chat'

const AUTO_DISMISS_MS = 12_000

export function ReminderToasts() {
  const toasts = useReminderStore(s => s.toasts)
  const dismiss = useReminderStore(s => s.dismiss)
  const chats = useChatStore(s => s.chats)
  const navigate = useNavigate()

  // Автозакрытие самого старого тоста.
  useEffect(() => {
    if (toasts.length === 0) return
    const timer = setTimeout(() => dismiss(toasts[0].reminderId), AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [toasts, dismiss])

  if (toasts.length === 0) return null

  function openChat(chatId: string) {
    const chat = chats.find(c => c.id === chatId)
    const partnerId = chat?.partner?.id
    navigate(partnerId ? `/chat/${partnerId}` : '/')
  }

  return (
    <div className="fixed top-3 right-3 z-[60] flex flex-col gap-2 w-[330px] max-w-[calc(100vw-24px)]">
      {toasts.slice(0, 4).map(t => {
        const when = t.allDay
          ? new Date(t.eventAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
          : new Date(t.eventAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
        return (
          <div
            key={t.reminderId}
            className="glass-pop relative rounded-2xl overflow-hidden reminder-toast-in"
          >
            <button
              onClick={() => { openChat(t.chatId); dismiss(t.reminderId) }}
              className="w-full text-left px-4 py-3 pr-9 hover:bg-white/5 transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                  style={{ background: 'rgba(124,58,237,0.18)' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#A855F7" strokeWidth="2">
                    <rect x="3" y="4" width="18" height="18" rx="2"/>
                    <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
                    <line x1="3" y1="10" x2="21" y2="10"/>
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-white truncate">{t.title}</p>
                  <p className="text-[12px] mt-0.5" style={{ color: '#C084FC' }}>
                    {t.categoryName} · {when}
                  </p>
                  {t.notes && (
                    <p className="text-[12px] mt-0.5 truncate" style={{ color: 'var(--text-mid)' }}>{t.notes}</p>
                  )}
                  <p className="text-[11px] mt-1" style={{ color: 'var(--text-low)' }}>
                    Напоминание от {t.from.nickname}
                  </p>
                </div>
              </div>
            </button>
            <button
              onClick={() => dismiss(t.reminderId)}
              className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full transition-colors hover:bg-white/10"
              style={{ color: 'rgba(255,255,255,0.45)' }}
              title="Закрыть"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        )
      })}
      <style>{`
        @keyframes reminderToastIn { from { transform: translateX(110%); opacity: 0 } to { transform: translateX(0); opacity: 1 } }
        .reminder-toast-in { animation: reminderToastIn 0.25s ease-out both; position: relative; }
      `}</style>
    </div>
  )
}
