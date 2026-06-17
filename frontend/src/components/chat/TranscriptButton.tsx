import { useState, type ReactNode } from 'react'
import { chatApi } from '@/api/chat'
import { useChatStore, type Message } from '@/store/chat'

// Иконка-документ для кнопки расшифровки.
function DocIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2" />
      <line x1="9" y1="20" x2="15" y2="20" /><line x1="12" y1="4" x2="12" y2="20" />
    </svg>
  )
}
function SpinnerIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" className="animate-spin" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" />
    </svg>
  )
}

// Общая логика расшифровки (запрос/кэш/ошибка/раскрытие текста).
function useTranscript(message: Message) {
  const updateMessage = useChatStore(s => s.updateMessage)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const transcript = message.attachments?.[0]?.transcript ?? null

  async function toggle() {
    setError(null)
    if (transcript) { setOpen(o => !o); return }
    if (loading) return
    setLoading(true)
    try {
      const res = await chatApi.transcribe(message.id)
      updateMessage(res.data.data)
      setOpen(true)
    } catch (err) {
      const e = err as { response?: { data?: { error?: { message?: string } } } }
      setError(e.response?.data?.error?.message ?? 'Не удалось распознать речь')
    } finally {
      setLoading(false)
    }
  }
  return { loading, error, open, transcript, toggle }
}

function TextPanel({ text, isOwn }: { text: string; isOwn: boolean }) {
  return (
    <div
      className="text-[13px] leading-snug mt-1.5 px-2.5 py-1.5 rounded-xl whitespace-pre-wrap break-words"
      style={{
        background: isOwn ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.08)',
        color: 'rgba(255,255,255,0.92)',
      }}
    >
      {text}
    </div>
  )
}

// Голосовое + кнопка расшифровки справа от дорожки; текст разворачивается снизу.
export function AudioWithTranscript({ message, isOwn, children }: {
  message: Message
  isOwn: boolean
  children: ReactNode   // сам компонент AudioMessage
}) {
  const { loading, error, open, transcript, toggle } = useTranscript(message)
  const showButton = !message.pending && !message.failed
  const iconColor = isOwn ? 'rgba(255,255,255,0.85)' : '#C084FC'
  const iconBg = isOwn ? 'rgba(255,255,255,0.16)' : 'rgba(168,85,247,0.16)'

  return (
    <div>
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">{children}</div>
        {showButton && (
          <button
            onClick={(e) => { e.stopPropagation(); toggle() }}
            disabled={loading}
            title={transcript ? (open ? 'Скрыть текст' : 'Показать текст') : 'Расшифровать в текст'}
            className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors active:scale-90 disabled:opacity-60"
            style={{ background: iconBg, color: iconColor }}
          >
            {loading ? <SpinnerIcon /> : <DocIcon />}
          </button>
        )}
      </div>
      {error && <span className="text-[11px]" style={{ color: '#f87171' }}>{error}</span>}
      {open && transcript && <TextPanel text={transcript} isOwn={isOwn} />}
    </div>
  )
}

// Кнопка расшифровки для кружка (под видео): подпись + текст снизу.
export function TranscriptButton({ message, isOwn = false }: {
  message: Message
  isOwn?: boolean
}) {
  const { loading, error, open, transcript, toggle } = useTranscript(message)
  if (message.pending || message.failed) return null

  return (
    <div className="flex flex-col gap-1" style={{ alignItems: isOwn ? 'flex-end' : 'flex-start', maxWidth: 260 }}>
      <button
        onClick={(e) => { e.stopPropagation(); toggle() }}
        disabled={loading}
        className="flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-medium transition-colors disabled:opacity-60"
        style={{ background: 'rgba(168,85,247,0.14)', color: '#C084FC', border: '1px solid rgba(168,85,247,0.28)' }}
        title="Расшифровать в текст"
      >
        {loading ? <SpinnerIcon /> : <DocIcon />}
        {loading ? 'Распознаю…' : transcript ? (open ? 'Скрыть текст' : 'Показать текст') : 'Расшифровать'}
      </button>
      {error && <span className="text-[11px] px-1" style={{ color: '#f87171' }}>{error}</span>}
      {open && transcript && <TextPanel text={transcript} isOwn={isOwn} />}
    </div>
  )
}
