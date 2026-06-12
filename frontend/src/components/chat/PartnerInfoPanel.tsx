import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { chatApi } from '@/api/chat'
import { useAuthStore } from '@/store/auth'
import { useChatStore } from '@/store/chat'
import type { Message, ChatPartner } from '@/store/chat'
import { Avatar } from '@/components/ui/Avatar'
import { OnlineIndicator } from '@/components/ui/OnlineIndicator'
import { Spinner } from '@/components/ui/Spinner'

interface Props {
  chatId: string
  partner: ChatPartner
  onClose: () => void
}

type Tab = 'media' | 'audio'

function mediaUrl(publicUrl: string | null | undefined, storageKey: string): string {
  if (publicUrl && !publicUrl.includes('minio:') && !publicUrl.includes('localhost:9000')) {
    if (publicUrl.startsWith('/')) return withToken(publicUrl)
    return publicUrl
  }
  const apiUrl = import.meta.env.VITE_API_URL ?? '/api'
  const encoded = btoa(storageKey).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
  return withToken(`${apiUrl}/media/${encoded}`)
}

function withToken(url: string): string {
  const token = useAuthStore.getState().accessToken
  if (!token) return url
  return `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`
}

function formatDuration(ms: number | null | undefined): string {
  if (!ms) return '0:00'
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function LightboxImage({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
      onClick={onClose}>
      <img src={src} alt="" className="max-w-full max-h-full rounded-xl object-contain"
        onClick={e => e.stopPropagation()} />
      <button onClick={onClose} className="absolute top-4 right-4 text-white/70 hover:text-white">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  )
}

export function PartnerInfoPanel({ chatId, partner, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('media')
  const [messages, setMessages] = useState<Message[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [lightbox, setLightbox] = useState<string | null>(null)

  const onlineUsers = useChatStore(s => s.onlineUsers)
  const isOnline = onlineUsers.has(partner.id)

  useEffect(() => {
    setLoading(true)
    setMessages([])
    setNextCursor(null)
    chatApi.getChatMedia(chatId)
      .then(r => {
        setMessages(r.data.data.messages)
        setNextCursor(r.data.data.nextCursor)
      })
      .finally(() => setLoading(false))
  }, [chatId])

  async function loadMore() {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const r = await chatApi.getChatMedia(chatId, nextCursor)
      setMessages(prev => [...prev, ...r.data.data.messages])
      setNextCursor(r.data.data.nextCursor)
    } finally { setLoadingMore(false) }
  }

  const mediaMessages = messages.filter(m => m.type === 'IMAGE' || m.type === 'VIDEO')
  const audioMessages = messages.filter(m => m.type === 'AUDIO' || m.type === 'CIRCLE_VIDEO')

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-20 bg-black/50" onClick={onClose} />

      {/* Panel */}
      <div
        className="fixed right-0 top-0 bottom-0 z-30 flex flex-col w-80 max-w-full overflow-hidden panel-slide-in"
        style={{
          background: 'rgba(13,17,35,0.85)',
          backdropFilter: 'blur(40px) saturate(150%)',
          WebkitBackdropFilter: 'blur(40px) saturate(150%)',
          borderLeft: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        {/* Header */}
        <div className="shrink-0 flex items-center gap-2 px-3 py-3"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full transition-colors shrink-0"
            style={{ color: 'rgba(255,255,255,0.5)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
          <span className="text-sm font-semibold text-white flex-1">Профиль</span>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {/* Profile card */}
          <div className="px-4 py-5 flex flex-col items-center text-center"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <Link to={`/u/${partner.username}`} onClick={onClose} className="block mb-3 hover:opacity-90 transition-opacity">
              <Avatar url={partner.avatarUrl} nickname={partner.nickname} size={72} />
            </Link>
            <Link to={`/u/${partner.username}`} onClick={onClose}
              className="text-[17px] font-bold text-white hover:underline leading-tight mb-1">
              {partner.nickname}
            </Link>
            <p className="text-sm mb-2" style={{ color: 'var(--text-low)' }}>@{partner.username}</p>
            <OnlineIndicator userId={partner.id} lastSeenAt={partner.lastSeenAt} showLabel />
          </div>

          {/* Tabs */}
          <div className="flex shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            {(['media', 'audio'] as Tab[]).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className="flex-1 py-3 text-xs font-semibold uppercase tracking-wider transition-colors"
                style={{
                  color: tab === t ? '#C084FC' : 'var(--text-low)',
                  borderBottom: tab === t ? '2px solid #A855F7' : '2px solid transparent',
                }}>
                {t === 'media' ? 'Медиа' : 'Аудио'}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {loading ? (
            <div className="flex justify-center py-10"><Spinner size={24} /></div>
          ) : tab === 'media' ? (
            <MediaTab
              messages={mediaMessages}
              onImageClick={setLightbox}
              nextCursor={nextCursor}
              onLoadMore={loadMore}
              loadingMore={loadingMore}
            />
          ) : (
            <AudioTab messages={audioMessages} nextCursor={nextCursor} onLoadMore={loadMore} loadingMore={loadingMore} />
          )}
        </div>
      </div>

      {lightbox && <LightboxImage src={lightbox} onClose={() => setLightbox(null)} />}

      <style>{`
        @keyframes slideInRight { from { transform: translateX(100%) } to { transform: translateX(0) } }
        .panel-slide-in { animation: slideInRight 0.22s ease-out both; }
      `}</style>
    </>
  )
}

function MediaTab({
  messages, onImageClick, nextCursor, onLoadMore, loadingMore,
}: {
  messages: Message[]
  onImageClick: (url: string) => void
  nextCursor: string | null
  onLoadMore: () => void
  loadingMore: boolean
}) {
  if (messages.length === 0) {
    return <EmptyState label="Нет фото и видео" />
  }

  return (
    <div className="p-1">
      <div className="grid grid-cols-3 gap-0.5">
        {messages.map(msg => {
          const att = msg.attachments?.[0]
          if (!att) return null
          const isVideo = msg.type === 'VIDEO'
          const thumbSrc = att.thumbnailKey
            ? mediaUrl(att.thumbnailUrl, att.thumbnailKey)
            : mediaUrl(att.publicUrl, att.storageKey)

          return (
            <button key={msg.id}
              onClick={() => {
                if (isVideo) return
                onImageClick(mediaUrl(att.publicUrl, att.storageKey))
              }}
              className="relative aspect-square overflow-hidden bg-black/20 hover:opacity-85 transition-opacity"
              style={{ cursor: isVideo ? 'default' : 'pointer' }}>
              <img src={thumbSrc} alt="" className="w-full h-full object-cover" loading="lazy" />
              {isVideo && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-7 h-7 rounded-full bg-black/60 flex items-center justify-center">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="white">
                      <polygon points="5,3 19,12 5,21"/>
                    </svg>
                  </div>
                  {att.durationMs && (
                    <span className="absolute bottom-1 right-1 text-[10px] text-white bg-black/60 px-1 rounded">
                      {formatDuration(att.durationMs)}
                    </span>
                  )}
                </div>
              )}
            </button>
          )
        })}
      </div>
      <LoadMoreButton nextCursor={nextCursor} onLoadMore={onLoadMore} loading={loadingMore} />
    </div>
  )
}

function AudioTab({
  messages, nextCursor, onLoadMore, loadingMore,
}: {
  messages: Message[]
  nextCursor: string | null
  onLoadMore: () => void
  loadingMore: boolean
}) {
  if (messages.length === 0) {
    return <EmptyState label="Нет аудио и кружков" />
  }

  return (
    <div className="py-1">
      {messages.map(msg => {
        const att = msg.attachments?.[0]
        if (!att) return null
        const isCircle = msg.type === 'CIRCLE_VIDEO'
        const date = new Date(msg.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })

        return (
          <div key={msg.id} className="flex items-center gap-3 px-4 py-2.5"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
              style={{ background: 'rgba(124,58,237,0.18)' }}>
              {isCircle ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#A855F7" strokeWidth="1.8">
                  <circle cx="12" cy="12" r="10"/>
                  <polygon points="10,8 16,12 10,16" fill="#A855F7" stroke="none"/>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#A855F7" strokeWidth="1.8">
                  <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/>
                  <path d="M19 10v2a7 7 0 01-14 0v-2"/>
                  <line x1="12" y1="19" x2="12" y2="23"/>
                </svg>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {isCircle ? 'Кружок' : 'Голосовое'}
              </p>
              <p className="text-xs" style={{ color: 'var(--text-low)' }}>
                {formatDuration(att.durationMs)} · {msg.sender.nickname} · {date}
              </p>
            </div>
          </div>
        )
      })}
      <LoadMoreButton nextCursor={nextCursor} onLoadMore={onLoadMore} loading={loadingMore} />
    </div>
  )
}

function LoadMoreButton({ nextCursor, onLoadMore, loading }: {
  nextCursor: string | null; onLoadMore: () => void; loading: boolean
}) {
  if (!nextCursor) return null
  return (
    <div className="flex justify-center py-3">
      <button onClick={onLoadMore} disabled={loading}
        className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs transition-colors"
        style={{ background: 'rgba(168,85,247,0.12)', color: '#C084FC' }}>
        {loading ? <Spinner size={10} /> : 'Загрузить ещё'}
      </button>
    </div>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4">
      <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3"
        style={{ background: 'rgba(124,58,237,0.15)' }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#A855F7" strokeWidth="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <polyline points="21 15 16 10 5 21"/>
        </svg>
      </div>
      <p className="text-sm text-center" style={{ color: 'var(--text-low)' }}>{label}</p>
    </div>
  )
}
