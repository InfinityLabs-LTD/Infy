import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Avatar } from '@/components/ui/Avatar'
import { OnlineIndicator } from '@/components/ui/OnlineIndicator'
import { useChatStore, Chat } from '@/store/chat'

function formatTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000)
  if (diffDays < 7) return d.toLocaleDateString('ru-RU', { weekday: 'short' })
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

function mediaLabel(type: string): string {
  const m: Record<string, string> = {
    IMAGE: '🖼 Фото', VIDEO: '🎥 Видео',
    AUDIO: '🎤 Голосовое', CIRCLE_VIDEO: '⭕ Кружок',
    FILE: '📎 Файл', ALBUM: '🖼 Альбом',
  }
  return m[type] ?? type
}

function previewText(last: Chat['lastMessage']): string {
  if (!last) return 'Нет сообщений'
  if (last.type === 'TEXT')
    return last.isOwn ? `Вы: ${last.content ?? ''}` : (last.content ?? '')
  if (last.type === 'SYSTEM') return last.content ?? ''
  if (last.type === 'AI') return last.content || 'Infy Pulse печатает…'
  if (last.type === 'AI_QUERY') return 'Вопрос Infy Pulse'
  return mediaLabel(last.type)
}

/** Статус доставки своего сообщения: одна галочка (отправлено) / две (прочитано). */
function DeliveryTick({ read }: { read: boolean }) {
  const c = read ? 'var(--status-read)' : 'var(--status-sent)'
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.4"
      strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d="M1 13l4.5 4.5L14 7" />
      {read && <path d="M9 16.5L9.5 17 18 7" />}
    </svg>
  )
}

export function ChatCard({ chat, active }: { chat: Chat; active: boolean }) {
  // typing хранится по chatId → Set<username>; партнёр печатает, если набор непуст
  const isTyping = useChatStore(s => (s.typing[chat.id]?.size ?? 0) > 0)
  const unread = !active && chat.unreadCount > 0
  const last = chat.lastMessage
  const isAi = last?.type === 'AI' || last?.type === 'AI_QUERY'
  // Партнёр прочитал моё последнее сообщение → двойная галочка
  const readByPartner = !!last?.isOwn && chat.partnerLastReadMessageId === last.id

  return (
    <motion.div layout transition={{ type: 'spring', stiffness: 520, damping: 42 }}>
      <Link
        to={`/chat/${chat.partner?.id ?? chat.id}`}
        className="group flex items-center gap-3 mx-2 px-3 py-2.5 rounded-2xl transition-colors duration-150 active:scale-[.985]"
        style={{
          background: active ? 'var(--surface-press)' : 'transparent',
          boxShadow: active ? 'inset 2px 0 0 var(--accent)' : 'none',
        }}
        onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--surface-hover)' }}
        onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
      >
        {/* Аватар + онлайн-точка + кольцо непрочитанного */}
        <div
          className="relative shrink-0 rounded-full"
          style={{ boxShadow: unread ? '0 0 0 2px var(--brand-ring)' : 'none' }}
        >
          <Avatar url={chat.partner?.avatarUrl ?? null} nickname={chat.partner?.nickname ?? '?'} size={52} />
          {chat.partner && (
            <span className="absolute bottom-0 right-0">
              <OnlineIndicator userId={chat.partner.id} />
            </span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          {/* Строка имени + время/статус */}
          <div className="flex items-baseline justify-between gap-2">
            <p
              className="truncate leading-tight text-[15px]"
              style={{ color: 'var(--text-hi)', fontWeight: unread ? 600 : 500 }}
            >
              {chat.partner?.nickname ?? 'Неизвестный'}
            </p>
            <div className="flex items-center gap-1 shrink-0">
              {last?.isOwn && <DeliveryTick read={readByPartner} />}
              {last && (
                <span className="text-[11px]" style={{ color: 'var(--text-low)' }}>
                  {formatTime(last.createdAt)}
                </span>
              )}
            </div>
          </div>

          {/* Строка превью + бейдж непрочитанного */}
          <div className="flex items-center justify-between gap-2 mt-0.5">
            <p
              className="truncate text-[13px] leading-snug"
              style={{
                color: isTyping || isAi
                  ? 'var(--accent)'
                  : unread ? 'var(--text-hi)' : 'var(--preview-read)',
                fontWeight: unread ? 500 : 400,
              }}
            >
              {isTyping
                ? 'печатает…'
                : isAi
                  ? `∞ ${previewText(last)}`
                  : previewText(last)}
            </p>
            {unread && (
              <span
                className="badge-pop min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-semibold text-white flex items-center justify-center shrink-0"
                style={{ background: 'var(--grad-own)', boxShadow: 'var(--glow-ai)' }}
              >
                {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
              </span>
            )}
          </div>
        </div>
      </Link>
    </motion.div>
  )
}
