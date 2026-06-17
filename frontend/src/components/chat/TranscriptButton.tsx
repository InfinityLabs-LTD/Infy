import { useState } from 'react'
import { chatApi } from '@/api/chat'
import { useChatStore, type Message } from '@/store/chat'

// Кнопка распознавания речи для голосовых и кружков. Если транскрипт уже есть —
// показывает/скрывает текст; иначе запрашивает распознавание у сервера.
export function TranscriptButton({ message, align = 'start' }: {
  message: Message
  align?: 'start' | 'end'
}) {
  const updateMessage = useChatStore(s => s.updateMessage)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  const transcript = message.attachments?.[0]?.transcript ?? null

  async function handleClick() {
    setError(null)
    if (transcript) { setOpen(o => !o); return }
    if (loading) return
    setLoading(true)
    try {
      const res = await chatApi.transcribe(message.id)
      updateMessage(res.data.data)
      setOpen(true)
    } catch (err) {
      const e = err as { response?: { status?: number; data?: { error?: { message?: string } } } }
      setError(e.response?.data?.error?.message ?? 'Не удалось распознать речь')
    } finally {
      setLoading(false)
    }
  }

  const showText = open && transcript

  return (
    <div className="flex flex-col gap-1" style={{ alignItems: align === 'end' ? 'flex-end' : 'flex-start', maxWidth: 260 }}>
      <button
        onClick={(e) => { e.stopPropagation(); handleClick() }}
        disabled={loading}
        className="flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-medium transition-colors disabled:opacity-60"
        style={{ background: 'rgba(168,85,247,0.14)', color: '#C084FC', border: '1px solid rgba(168,85,247,0.28)' }}
        title="Расшифровать в текст"
      >
        {loading ? (
          <svg width="12" height="12" viewBox="0 0 24 24" className="animate-spin" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2" />
            <line x1="9" y1="20" x2="15" y2="20" /><line x1="12" y1="4" x2="12" y2="20" />
          </svg>
        )}
        {loading ? 'Распознаю…' : transcript ? (open ? 'Скрыть текст' : 'Показать текст') : 'Расшифровать'}
      </button>

      {error && (
        <span className="text-[11px] px-1" style={{ color: '#f87171' }}>{error}</span>
      )}

      {showText && (
        <div
          className="text-[13px] leading-snug px-2.5 py-1.5 rounded-xl whitespace-pre-wrap break-words"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.9)' }}
        >
          {transcript}
        </div>
      )}
    </div>
  )
}
