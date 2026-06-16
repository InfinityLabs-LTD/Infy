import { useEffect, useRef, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, FileText, Download } from 'lucide-react'
import { adminApi, AdminChatSummary, AdminThreadMessage, AdminAttachment } from '@/api/admin'
import { useAuthStore } from '@/store/auth'
import { Avatar } from '@/components/ui/Avatar'
import { Spinner } from '@/components/ui/Spinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { ImageMessage } from '@/components/chat/ImageMessage'
import { VideoMessage } from '@/components/chat/VideoMessage'
import { AudioMessage } from '@/components/chat/AudioMessage'
import { CircleVideoMessage } from '@/components/chat/CircleVideoMessage'

// ── Медиа-URL (как в чате: через /media с токеном) ───────────
function withToken(url: string): string {
  const token = useAuthStore.getState().accessToken
  if (!token) return url
  return `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`
}

function mediaUrl(storageKey: string): string {
  const apiUrl = import.meta.env.VITE_API_URL ?? '/api'
  const encoded = btoa(storageKey).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
  return withToken(`${apiUrl}/media/${encoded}`)
}

function fmtSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`
}

// ── Просмотрщик: список диалогов ⇄ переписка ─────────────────

interface Props {
  userId: string
}

export function AdminDialogViewer({ userId }: Props) {
  const [chats, setChats] = useState<AdminChatSummary[] | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [active, setActive] = useState<AdminChatSummary | null>(null)

  useEffect(() => {
    setChats(null)
    setActive(null)
    adminApi.getUserChats(userId)
      .then(r => setChats(r.data.data.chats))
      .catch(e => setError(e))
  }, [userId])

  if (error !== null) return <ErrorMessage error={error} />

  if (active) {
    return <ThreadView chat={active} ownerId={userId} onBack={() => setActive(null)} />
  }

  if (!chats) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map(i => (
          <div key={i} className="glass rounded-2xl h-[64px] animate-pulse" style={{ opacity: 1 - i * 0.2 }} />
        ))}
      </div>
    )
  }

  if (chats.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-14">
        <p className="text-sm" style={{ color: 'var(--text-low)' }}>Нет диалогов</p>
      </div>
    )
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 32 }} className="space-y-1.5">
      {chats.map(chat => {
        const partner = chat.participants[0]
        const title = chat.type === 'GROUP'
          ? `Группа · ${chat.participants.length + 1} уч.`
          : (partner?.nickname ?? 'Неизвестный')
        return (
          <button key={chat.id} onClick={() => setActive(chat)}
            className="w-full glass rounded-2xl px-3.5 py-3 flex items-center gap-3 text-left transition-colors hover:bg-white/[0.06]">
            {chat.type === 'GROUP'
              ? <div className="w-11 h-11 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: 'rgba(124,58,237,0.18)', color: '#C084FC' }}>#</div>
              : <Avatar url={partner?.avatarUrl ?? null} nickname={partner?.nickname ?? '?'} size={44} />}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{title}</p>
              <p className="text-[13px] truncate" style={{ color: 'var(--text-low)' }}>
                {chat.lastMessage
                  ? (chat.lastMessage.content ?? `[${chat.lastMessage.type.toLowerCase()}]`)
                  : 'Нет сообщений'}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[11px]" style={{ color: 'var(--text-low)' }}>{chat.messageCount} сообщ.</p>
              {chat.lastMessage && (
                <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  {new Date(chat.lastMessage.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                </p>
              )}
            </div>
          </button>
        )
      })}
    </motion.div>
  )
}

// ── Просмотр одной переписки ─────────────────────────────────

function ThreadView({ chat, ownerId, onBack }: {
  chat: AdminChatSummary
  ownerId: string
  onBack: () => void
}) {
  const [messages, setMessages] = useState<AdminThreadMessage[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async (c: string | null) => {
    setLoading(true)
    try {
      const res = await adminApi.getChatThread(chat.id, { cursor: c ?? undefined, limit: 50 })
      const d = res.data.data
      // Старые страницы добавляем сверху (сохраняя хронологию).
      setMessages(prev => c ? [...d.messages, ...prev] : d.messages)
      setCursor(d.nextCursor)
      setHasMore(!!d.nextCursor)
    } catch (e) { setError(e) }
    finally { setLoading(false) }
  }, [chat.id])

  useEffect(() => { setMessages([]); load(null) }, [load])

  const partner = chat.participants[0]
  const title = chat.type === 'GROUP'
    ? `Группа (${chat.participants.length + 1})`
    : (partner?.nickname ?? 'Неизвестный')

  return (
    <motion.div initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 34 }}>
      {/* Заголовок диалога */}
      <div className="flex items-center gap-3 mb-3 sticky top-0 z-10 glass rounded-2xl px-3 py-2.5">
        <button onClick={onBack}
          className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-white/10"
          style={{ color: 'var(--text-low)' }}>
          <ArrowLeft size={18} />
        </button>
        {chat.type === 'GROUP'
          ? <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
              style={{ background: 'rgba(124,58,237,0.18)', color: '#C084FC' }}>#</div>
          : <Avatar url={partner?.avatarUrl ?? null} nickname={partner?.nickname ?? '?'} size={36} />}
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white truncate">{title}</p>
          {partner && <p className="text-[12px] truncate" style={{ color: 'var(--text-low)' }}>@{partner.username}</p>}
        </div>
      </div>

      {error !== null && <div className="mb-3"><ErrorMessage error={error} /></div>}

      <div ref={scrollRef} className="space-y-1">
        {hasMore && (
          <div className="flex justify-center py-2">
            <button onClick={() => load(cursor)} disabled={loading}
              className="btn-ghost py-1 px-4 text-xs disabled:opacity-40">
              {loading ? <Spinner size={12} /> : '↑ Загрузить ранее'}
            </button>
          </div>
        )}

        {loading && messages.length === 0 ? (
          <div className="space-y-2">
            {[0, 1, 2].map(i => <div key={i} className="glass rounded-2xl h-[44px] animate-pulse" style={{ opacity: 1 - i * 0.2 }} />)}
          </div>
        ) : messages.map(m => (
          <ThreadMessage key={m.id} message={m} ownerId={ownerId} />
        ))}
      </div>
    </motion.div>
  )
}

// ── Одно сообщение в переписке ───────────────────────────────

function ThreadMessage({ message, ownerId }: { message: AdminThreadMessage; ownerId: string }) {
  const isOwner = message.sender.id === ownerId

  return (
    <div className={`flex gap-2 ${isOwner ? 'flex-row-reverse' : 'flex-row'}`}>
      <div className="shrink-0 self-end mb-4">
        <Avatar url={message.sender.avatarUrl} nickname={message.sender.nickname} size={28} />
      </div>
      <div className="max-w-[78%] flex flex-col" style={{ alignItems: isOwner ? 'flex-end' : 'flex-start' }}>
        <div className="px-3 py-2 rounded-2xl"
          style={{
            background: isOwner ? 'rgba(124,58,237,0.22)' : 'var(--glass-2, rgba(255,255,255,0.05))',
            border: '1px solid rgba(255,255,255,0.06)',
          }}>
          <p className="text-[11px] font-semibold mb-1" style={{ color: isOwner ? '#C084FC' : 'rgba(255,255,255,0.55)' }}>
            {message.sender.nickname}
          </p>

          {message.replyTo && (
            <div className="mb-1.5 pl-2 py-1 rounded-lg text-[12px]"
              style={{ background: 'rgba(0,0,0,0.18)', borderLeft: '2px solid var(--accent, #7C3AED)' }}>
              <span className="font-semibold" style={{ color: '#C084FC' }}>{message.replyTo.sender.nickname}</span>
              <span className="ml-1 opacity-75">
                {message.replyTo.content ?? `[${message.replyTo.type.toLowerCase()}]`}
              </span>
            </div>
          )}

          {message.attachments.map(att => (
            <div key={att.id} className="mb-1.5">
              <AttachmentView att={att} type={message.type} isOwner={isOwner} />
            </div>
          ))}

          {message.content && (
            <p className="text-sm text-white/90 whitespace-pre-wrap break-words leading-relaxed">{message.content}</p>
          )}
        </div>
        <span className="text-[10px] mt-0.5 px-1" style={{ color: 'rgba(255,255,255,0.3)' }}>
          {new Date(message.createdAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          {message.editedAt && ' · изм.'}
        </span>
      </div>
    </div>
  )
}

// ── Рендер вложения любого типа ──────────────────────────────

function AttachmentView({ att, type, isOwner }: { att: AdminAttachment; type: string; isOwner: boolean }) {
  const url = mediaUrl(att.storageKey)
  const thumb = att.thumbnailKey ? mediaUrl(att.thumbnailKey) : null

  if (type === 'IMAGE' || att.mimeType.startsWith('image/')) {
    return <div className="max-w-[260px]"><ImageMessage url={url} width={att.width} height={att.height} /></div>
  }
  if (type === 'CIRCLE_VIDEO') {
    return <CircleVideoMessage url={url} thumbnailUrl={thumb} durationMs={att.durationMs} />
  }
  if (type === 'VIDEO' || att.mimeType.startsWith('video/')) {
    return <div className="max-w-[260px]"><VideoMessage url={url} thumbnailUrl={thumb} durationMs={att.durationMs} /></div>
  }
  if (type === 'AUDIO' || att.mimeType.startsWith('audio/')) {
    return <AudioMessage url={url} durationMs={att.durationMs} waveform={att.waveform} isOwn={isOwner} />
  }

  // Прочие файлы — карточка со скачиванием
  return (
    <a href={url} target="_blank" rel="noreferrer"
      className="flex items-center gap-2.5 px-3 py-2 rounded-xl transition-colors hover:bg-white/[0.06]"
      style={{ background: 'rgba(0,0,0,0.18)' }}>
      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: 'rgba(124,58,237,0.18)', color: '#C084FC' }}>
        <FileText size={18} />
      </div>
      <div className="min-w-0">
        <p className="text-[13px] text-white/90 truncate">{att.mimeType}</p>
        <p className="text-[11px]" style={{ color: 'var(--text-low)' }}>{fmtSize(att.sizeBytes)}</p>
      </div>
      <Download size={15} className="shrink-0" style={{ color: 'var(--text-low)' }} />
    </a>
  )
}
