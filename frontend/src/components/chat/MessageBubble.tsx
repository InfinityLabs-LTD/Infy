import { useRef, useState } from 'react'
import { Message } from '@/store/chat'
import { useAuthStore } from '@/store/auth'
import { chatApi } from '@/api/chat'
import { useChatStore } from '@/store/chat'
import { ImageMessage } from './ImageMessage'
import { VideoMessage } from './VideoMessage'
import { AudioMessage } from './AudioMessage'
import { CircleVideoMessage } from './CircleVideoMessage'

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥']

interface Props {
  message: Message
  showSenderName?: boolean
  partnerLastReadMessageId?: string | null
  partnerReadAt?: string | null
  onScrollTo?: (messageId: string) => void
}

export function MessageBubble({ message, showSenderName, partnerLastReadMessageId, partnerReadAt }: Props) {
  const myId = useAuthStore((s) => s.user?.id)
  const isOwn = message.sender.id === myId
  const { updateMessage, removeMessage } = useChatStore()

  const [showMenu, setShowMenu] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 })
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const time = new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  const att = message.attachments?.[0]
  const isMediaOnly = !message.content && att
  const isCircle = message.type === 'CIRCLE_VIDEO'

  function openMenu(clientX: number, clientY: number) {
    setMenuPos({ x: clientX, y: clientY })
    setShowMenu(true)
  }

  function onPointerDown(e: React.PointerEvent) {
    if (e.pointerType === 'touch') {
      holdTimer.current = setTimeout(() => openMenu(e.clientX, e.clientY), 500)
    }
  }

  function onPointerUp() {
    if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null }
  }

  function onContextMenu(e: React.MouseEvent) {
    e.preventDefault()
    openMenu(e.clientX, e.clientY)
  }

  async function handleDelete() {
    setShowMenu(false)
    try {
      await chatApi.deleteMessage(message.id)
      removeMessage(message.chatId, message.id)
    } catch {}
  }

  function handleCopy() {
    setShowMenu(false)
    if (message.content) navigator.clipboard.writeText(message.content).catch(() => {})
  }

  async function handleReact(emoji: string) {
    setShowEmojiPicker(false)
    setShowMenu(false)
    try {
      const res = await chatApi.reactToMessage(message.id, emoji)
      updateMessage(res.data.data)
    } catch {}
  }

  const isRead = !!(partnerLastReadMessageId && message.id <= partnerLastReadMessageId)
  const tickColor = isRead ? '#2aabee' : 'rgba(255,255,255,0.55)'

  const reactions = message.reactions ?? []

  if (isCircle && att) {
    return (
      <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-0.5 msg-appear`}
        onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
        onContextMenu={onContextMenu}>
        <div className="flex flex-col items-end gap-0.5">
          <CircleVideoMessage
            url={mediaUrl(att.publicUrl, att.storageKey)}
            thumbnailUrl={att.thumbnailKey ? mediaUrl(null, att.thumbnailKey) : null}
            durationMs={att.durationMs}
          />
          {reactions.length > 0 && (
            <ReactionBar reactions={reactions} myId={myId} onReact={handleReact} />
          )}
          <span className="text-[11px] px-1" style={{ color: '#6c8998' }}>{time}</span>
        </div>
        {showMenu && (
          <ContextMenu
            ref={menuRef}
            pos={menuPos}
            isOwn={isOwn}
            isText={false}
            readAt={isRead ? partnerReadAt : null}
            onClose={() => setShowMenu(false)}
            onDelete={isOwn ? handleDelete : undefined}
            onReact={() => { setShowMenu(false); setShowEmojiPicker(true) }}
          />
        )}
        {showEmojiPicker && (
          <EmojiPicker onSelect={handleReact} onClose={() => setShowEmojiPicker(false)} isOwn={isOwn} />
        )}
      </div>
    )
  }

  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-0.5 msg-appear`}
      onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
      onContextMenu={onContextMenu}>
      <div className="flex flex-col items-end gap-0.5" style={{ maxWidth: '78%' }}>
        <div className={`
          text-sm overflow-hidden w-full
          ${isMediaOnly ? '' : 'px-3 py-2'}
          ${isOwn ? 'bubble-own' : 'bubble-other'}
        `}>
          {showSenderName && !isOwn && (
            <p className="text-xs font-semibold mb-0.5 px-3 pt-2" style={{ color: '#2aabee' }}>
              {message.sender.nickname}
            </p>
          )}

          {att && (
            <div className={isMediaOnly ? '' : 'mb-1.5'}>
              {message.type === 'IMAGE' && (
                <ImageMessage
                  url={mediaUrl(att.publicUrl, att.storageKey)}
                  width={att.width}
                  height={att.height}
                />
              )}
              {message.type === 'VIDEO' && (
                <VideoMessage
                  url={mediaUrl(att.publicUrl, att.storageKey)}
                  thumbnailUrl={att.thumbnailKey ? mediaUrl(null, att.thumbnailKey) : null}
                  durationMs={att.durationMs}
                />
              )}
              {message.type === 'AUDIO' && (
                <AudioMessage
                  url={mediaUrl(att.publicUrl, att.storageKey)}
                  durationMs={att.durationMs}
                  waveform={att.waveform as number[] | null}
                  isOwn={isOwn}
                />
              )}
            </div>
          )}

          {message.content && (
            <p className={`whitespace-pre-wrap break-words leading-relaxed ${isMediaOnly ? 'px-3 pb-2' : ''}`}>
              {message.content}
            </p>
          )}

          <div className={`flex items-center justify-end gap-1 mt-0.5 ${isMediaOnly ? 'px-3 pb-2' : ''}`}>
            {message.editedAt && (
              <span className="text-[10px] italic" style={{ color: isOwn ? 'rgba(255,255,255,0.5)' : '#6c8998' }}>изм.</span>
            )}
            <span className="text-[11px]" style={{ color: isOwn ? 'rgba(255,255,255,0.55)' : '#6c8998' }}>
              {time}
            </span>
            {isOwn && (
              <svg width="18" height="10" viewBox="0 0 18 10" fill="none">
                <path d="M1 5l3 3L11 1" stroke={tickColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M5 5l3 3L15 1" stroke={tickColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </div>
        </div>

        {reactions.length > 0 && (
          <ReactionBar reactions={reactions} myId={myId} onReact={handleReact} />
        )}
      </div>

      {showMenu && (
        <ContextMenu
          ref={menuRef}
          pos={menuPos}
          isOwn={isOwn}
          isText={message.type === 'TEXT' && !!message.content}
          readAt={isRead ? partnerReadAt : null}
          onClose={() => setShowMenu(false)}
          onDelete={isOwn ? handleDelete : undefined}
          onCopy={message.type === 'TEXT' && message.content ? handleCopy : undefined}
          onReact={() => { setShowMenu(false); setShowEmojiPicker(true) }}
        />
      )}
      {showEmojiPicker && (
        <EmojiPicker onSelect={handleReact} onClose={() => setShowEmojiPicker(false)} isOwn={isOwn} />
      )}
    </div>
  )
}

// ── Reaction bar ─────────────────────────────────────────────

function ReactionBar({ reactions, myId, onReact }: {
  reactions: NonNullable<Message['reactions']>
  myId: string | undefined
  onReact: (emoji: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-1 px-1">
      {reactions.map(r => {
        const reacted = myId ? r.userIds.includes(myId) : false
        return (
          <button
            key={r.emoji}
            onClick={() => onReact(r.emoji)}
            className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-all active:scale-95"
            style={{
              background: reacted ? 'rgba(42,171,238,0.2)' : 'rgba(255,255,255,0.08)',
              border: reacted ? '1px solid rgba(42,171,238,0.5)' : '1px solid rgba(255,255,255,0.1)',
              color: 'white',
            }}
          >
            <span>{r.emoji}</span>
            <span style={{ color: reacted ? '#2aabee' : 'rgba(255,255,255,0.6)' }}>{r.count}</span>
          </button>
        )
      })}
    </div>
  )
}

// ── Emoji picker (quick) ─────────────────────────────────────

function EmojiPicker({ onSelect, onClose, isOwn }: {
  onSelect: (emoji: string) => void
  onClose: () => void
  isOwn: boolean
}) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className={`fixed bottom-24 z-50 flex gap-1.5 px-3 py-2 rounded-2xl shadow-2xl`}
        style={{
          background: '#1e2c3a',
          border: '1px solid rgba(255,255,255,0.1)',
          [isOwn ? 'right' : 'left']: 16,
        }}
      >
        {QUICK_EMOJIS.map(emoji => (
          <button
            key={emoji}
            onClick={() => onSelect(emoji)}
            className="text-2xl leading-none p-1 rounded-xl transition-all hover:scale-125 active:scale-95"
          >
            {emoji}
          </button>
        ))}
      </div>
    </>
  )
}

// ── Context menu ─────────────────────────────────────────────

import { forwardRef } from 'react'

const ContextMenu = forwardRef<HTMLDivElement, {
  pos: { x: number; y: number }
  isOwn: boolean
  isText: boolean
  readAt: string | null | undefined
  onClose: () => void
  onDelete?: () => void
  onCopy?: () => void
  onReact: () => void
}>(({ pos, isOwn, isText, readAt, onClose, onDelete, onCopy, onReact }, ref) => {
  const viewW = window.innerWidth
  const viewH = window.innerHeight
  const menuW = 200
  const menuH = 200

  const x = Math.min(pos.x, viewW - menuW - 8)
  const y = pos.y + menuH > viewH ? pos.y - menuH : pos.y

  const readLabel = readAt
    ? `Прочитано ${new Date(readAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
    : null

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        ref={ref}
        className="fixed z-50 rounded-2xl overflow-hidden shadow-2xl min-w-[180px]"
        style={{ left: x, top: y, background: '#1e2c3a', border: '1px solid rgba(255,255,255,0.1)' }}
      >
        {readLabel && (
          <div className="px-4 py-2.5 text-xs" style={{ color: '#6c8998', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            {readLabel}
          </div>
        )}
        <MenuItem icon="😊" label="Реакция" onClick={onReact} />
        {onCopy && isText && <MenuItem icon="📋" label="Скопировать" onClick={onCopy} />}
        {onDelete && <MenuItem icon="🗑" label="Удалить" onClick={onDelete} danger />}
      </div>
    </>
  )
})

function MenuItem({ icon, label, onClick, danger }: {
  icon: string; label: string; onClick: () => void; danger?: boolean
}) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors text-left"
      style={{
        color: danger ? '#fc8181' : 'rgba(255,255,255,0.85)',
        background: hov ? 'rgba(255,255,255,0.06)' : 'transparent',
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <span>{icon}</span>
      {label}
    </button>
  )
}

// ── Helpers ──────────────────────────────────────────────────

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
