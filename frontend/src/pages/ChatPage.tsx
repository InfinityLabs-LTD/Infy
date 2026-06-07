import { Fragment, useEffect, useRef, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { chatApi } from '@/api/chat'
import { mediaApi } from '@/api/media'
import { useChatStore } from '@/store/chat'
import { useAuthStore } from '@/store/auth'
import { getActiveSocket, joinChatRoom } from '@/lib/socket'
import { Avatar } from '@/components/ui/Avatar'
import { OnlineIndicator } from '@/components/ui/OnlineIndicator'
import { TypingIndicator } from '@/components/ui/TypingIndicator'
import { MessageBubble } from '@/components/chat/MessageBubble'
import { CircleRecorderModal } from '@/components/chat/CircleRecorderModal'
import { Spinner } from '@/components/ui/Spinner'
import { useMediaRecorder } from '@/hooks/useMediaRecorder'

const TYPING_DEBOUNCE_MS = 1500
const ALLOWED_IMAGE = 'image/jpeg,image/png,image/gif,image/webp'
const ALLOWED_VIDEO = 'video/mp4,video/webm,video/quicktime'

function formatDateLabel(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return 'Сегодня'
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return 'Вчера'
  return d.toLocaleDateString('ru-RU', {
    day: 'numeric', month: 'long',
    ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  })
}

function DateSeparator({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center my-3">
      <span className="px-3 py-1 rounded-full text-xs font-medium"
        style={{ background: 'rgba(23,33,43,0.85)', color: '#6c8998' }}>
        {label}
      </span>
    </div>
  )
}

function IconBtn({ onClick, title, disabled, children, color = 'rgba(255,255,255,0.4)' }: {
  onClick?: () => void; title?: string; disabled?: boolean; children: React.ReactNode; color?: string
}) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className="w-9 h-9 flex items-center justify-center rounded-full transition-colors disabled:opacity-30 shrink-0"
      style={{ color, background: hov ? 'rgba(255,255,255,0.08)' : 'transparent' }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      {children}
    </button>
  )
}

export function ChatPage() {
  const { id: partnerId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const myUser = useAuthStore(s => s.user)
  const myUsername = myUser?.username

  const { chats, messages, nextCursor, socketReady, setMessages, prependMessages, setTyping, upsertChat, resetUnread } = useChatStore()

  // ── Resolve partnerId → chatId ──────────────────────────────
  const [chatId, setChatId] = useState<string | null>(() => {
    const found = useChatStore.getState().chats.find(c => c.partner?.id === partnerId)
    return found?.id ?? null
  })
  const [resolving, setResolving] = useState(!chatId)

  useEffect(() => {
    if (!partnerId) return
    const found = useChatStore.getState().chats.find(c => c.partner?.id === partnerId)
    if (found) { setChatId(found.id); setResolving(false); return }
    setResolving(true)
    chatApi.getOrCreateChat(partnerId)
      .then(r => { upsertChat(r.data.data); setChatId(r.data.data.id) })
      .catch(() => navigate('/'))
      .finally(() => setResolving(false))
  }, [partnerId])

  // When chats load later (listChats finishes after mount)
  useEffect(() => {
    if (chatId) return
    const found = chats.find(c => c.partner?.id === partnerId)
    if (found) { setChatId(found.id); setResolving(false) }
  }, [chats, partnerId, chatId])

  // ── Derived state ────────────────────────────────────────────
  const chat = chatId ? chats.find(c => c.id === chatId) : chats.find(c => c.partner?.id === partnerId)
  const chatMessages = chatId ? (messages[chatId] ?? []) : []
  const cursor = chatId ? nextCursor[chatId] : null

  const typingSet = useChatStore(s => chatId ? s.typing[chatId] : undefined)
  const typingNames = typingSet ? [...typingSet].filter(u => u !== myUsername) : []

  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [showCircle, setShowCircle] = useState(false)

  const bottomRef = useRef<HTMLDivElement>(null)
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isTypingRef = useRef(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)

  const voiceRecorder = useMediaRecorder()
  const isRecording = voiceRecorder.state === 'recording'

  // Load messages once chatId is known; mark read after load
  useEffect(() => {
    if (!chatId) return
    resetUnread(chatId)
    setLoading(true)
    chatApi.getMessages(chatId)
      .then(r => {
        setMessages(chatId, r.data.data.messages, r.data.data.nextCursor)
        const msgs = r.data.data.messages
        const lastId = msgs.at(-1)?.id
        if (lastId) {
          const socket = getActiveSocket()
          socket?.emit('mark_read', { chatId, messageId: lastId })
        }
      })
      .finally(() => setLoading(false))
  }, [chatId])

  // Mark read when new messages arrive while chat is open
  const chatMessagesLen = chatMessages.length
  useEffect(() => {
    if (!chatId || chatMessagesLen === 0) return
    const lastId = chatMessages.at(-1)?.id
    if (!lastId) return
    const lastMsg = chatMessages.at(-1)!
    const myId = useAuthStore.getState().user?.id
    if (lastMsg.sender.id === myId) return  // own message, no need to mark
    const socket = getActiveSocket()
    socket?.emit('mark_read', { chatId, messageId: lastId })
    resetUnread(chatId)
  }, [chatMessagesLen, chatId])

  useEffect(() => {
    if (!chatId || !socketReady) return
    joinChatRoom(chatId)
  }, [chatId, socketReady])

  useEffect(() => {
    if (!chatId || !socketReady) return
    const socket = getActiveSocket()
    if (!socket) return
    const handler = ({ chatId: cid, username, typing }: { chatId: string; username: string; typing: boolean }) => {
      if (cid === chatId) setTyping(cid, username, typing)
    }
    socket.on('typing', handler)
    return () => { socket.off('typing', handler) }
  }, [chatId, socketReady])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages.length])

  async function loadMore() {
    if (!chatId || !cursor || loadingMore) return
    setLoadingMore(true)
    try {
      const r = await chatApi.getMessages(chatId, cursor)
      prependMessages(chatId, r.data.data.messages, r.data.data.nextCursor)
    } finally { setLoadingMore(false) }
  }

  async function sendText() {
    if (!text.trim() || !chatId || sending) return
    const content = text.trim()
    setText('')
    setSending(true)
    stopTyping()
    try {
      const socket = getActiveSocket()
      if (socket?.connected) {
        socket.emit('join_chat', chatId)
        socket.emit('send_message', { chatId, content }, (res: { ok: boolean }) => {
          if (!res?.ok) chatApi.sendMessage(chatId, content).catch(() => {})
        })
      } else {
        await chatApi.sendMessage(chatId, content)
      }
    } finally { setSending(false); inputRef.current?.focus() }
  }

  async function sendMediaFile(file: File, msgType: 'IMAGE' | 'VIDEO') {
    if (!chatId) return
    setSending(true)
    try {
      const { data: { data: upload } } = await mediaApi.upload(file)
      await chatApi.sendMedia(chatId, msgType, upload)
    } finally { setSending(false) }
  }

  async function sendCircle(blob: Blob) {
    if (!chatId) return
    setShowCircle(false); setSending(true)
    try {
      const file = new File([blob], 'circle.webm', { type: blob.type })
      const { data: { data: upload } } = await mediaApi.upload(file, 'circle_video')
      await chatApi.sendMedia(chatId, 'CIRCLE_VIDEO', upload)
    } finally { setSending(false) }
  }

  async function toggleVoice() {
    if (voiceRecorder.state === 'idle') {
      await voiceRecorder.start()
    } else {
      const blob = await voiceRecorder.stop()
      if (!blob || blob.size < 1000 || !chatId) return
      setSending(true)
      try {
        const file = new File([blob], 'voice.webm', { type: blob.type })
        const { data: { data: upload } } = await mediaApi.upload(file)
        await chatApi.sendMedia(chatId, 'AUDIO', upload)
      } finally { setSending(false) }
    }
  }

  function startTyping() {
    const socket = getActiveSocket()
    if (!socket || !chatId) return
    if (!isTypingRef.current) { isTypingRef.current = true; socket.emit('typing_start', chatId) }
    if (typingTimer.current) clearTimeout(typingTimer.current)
    typingTimer.current = setTimeout(stopTyping, TYPING_DEBOUNCE_MS)
  }

  function stopTyping() {
    const socket = getActiveSocket()
    if (!socket || !chatId) return
    if (isTypingRef.current) { isTypingRef.current = false; socket.emit('typing_stop', chatId) }
    if (typingTimer.current) { clearTimeout(typingTimer.current); typingTimer.current = null }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText() }
  }

  const partner = chat?.partner

  return (
    <div className="flex flex-col flex-1 min-h-0" style={{ background: '#0e1621' }}>
      {/* ── Header ── */}
      <div className="shrink-0 flex items-center gap-2 px-2 py-2 z-10"
        style={{ background: '#17212b', borderBottom: '1px solid rgba(0,0,0,0.3)' }}>
        <Link to="/" className="md:hidden shrink-0">
          <IconBtn color="rgba(255,255,255,0.6)">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </IconBtn>
        </Link>

        <button className="flex items-center gap-3 flex-1 min-w-0 text-left rounded-lg px-1 py-0.5 hover:bg-white/5 transition-colors">
          <Avatar url={partner?.avatarUrl ?? null} nickname={partner?.nickname ?? '?'} size={38} />
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-white truncate leading-tight">
              {resolving
                ? <span style={{ color: 'rgba(255,255,255,0.3)' }}>Загрузка…</span>
                : (partner?.nickname ?? '—')}
            </p>
            {partner && (
              <OnlineIndicator userId={partner.id} lastSeenAt={partner.lastSeenAt} showLabel />
            )}
          </div>
        </button>

        <div className="flex items-center shrink-0">
          <IconBtn color="rgba(255,255,255,0.5)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </IconBtn>
          <IconBtn color="rgba(255,255,255,0.5)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>
            </svg>
          </IconBtn>
        </div>
      </div>

      {/* ── Messages ── */}
      <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2 chat-bg">
        {resolving ? (
          <div className="flex justify-center py-12"><Spinner size={28} /></div>
        ) : (
          <>
            {cursor && (
              <div className="flex justify-center mb-2">
                <button onClick={loadMore} disabled={loadingMore}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs transition-colors"
                  style={{ background: 'rgba(23,33,43,0.8)', color: '#2aabee' }}>
                  {loadingMore ? <Spinner size={11} /> : (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="18 15 12 9 6 15"/>
                    </svg>
                  )}
                  Загрузить ранее
                </button>
              </div>
            )}

            {loading ? (
              <div className="flex justify-center py-12"><Spinner size={28} /></div>
            ) : chatMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="w-14 h-14 rounded-full flex items-center justify-center mb-3"
                  style={{ background: 'rgba(42,171,238,0.12)' }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2aabee" strokeWidth="1.5">
                    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                  </svg>
                </div>
                <p className="text-sm" style={{ color: '#6c8998' }}>Нет сообщений. Начните общение!</p>
              </div>
            ) : (
              chatMessages.map((msg, idx) => {
                const prev = chatMessages[idx - 1]
                const showDate = !prev || new Date(msg.createdAt).toDateString() !== new Date(prev.createdAt).toDateString()
                return (
                  <Fragment key={msg.id}>
                    {showDate && <DateSeparator label={formatDateLabel(msg.createdAt)} />}
                    <MessageBubble message={msg} partnerLastReadMessageId={chat?.partnerLastReadMessageId} />
                  </Fragment>
                )
              })
            )}
            <TypingIndicator names={typingNames} />
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* ── Input bar ── */}
      <div className="shrink-0 px-2 py-2" style={{ background: '#17212b' }}>
        {isRecording && (
          <div className="flex items-center gap-2 px-3 py-1.5 mb-2 rounded-xl"
            style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
            <span className="text-xs text-red-300 flex-1">
              Запись · {Math.floor(voiceRecorder.duration / 60)}:{String(voiceRecorder.duration % 60).padStart(2, '0')}
            </span>
            <button onClick={() => voiceRecorder.cancel()} className="text-xs text-red-400 hover:text-red-200 transition-colors">
              Отмена
            </button>
          </div>
        )}

        <div className="flex items-end gap-1.5">
          {!isRecording && (
            <div className="flex shrink-0 pb-0.5">
              <IconBtn onClick={() => imageInputRef.current?.click()} disabled={sending} title="Фото/видео">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66L9.41 17.41a2 2 0 01-2.83-2.83l8.49-8.48"/>
                </svg>
              </IconBtn>
            </div>
          )}

          {!isRecording && (
            <textarea
              ref={inputRef}
              rows={1}
              className="flex-1 resize-none rounded-2xl px-4 py-2.5 text-sm text-white placeholder-white/30 outline-none leading-relaxed max-h-32 transition-none"
              style={{ background: '#242f3d', caretColor: '#2aabee' }}
              placeholder="Сообщение…"
              value={text}
              onChange={e => {
                setText(e.target.value)
                startTyping()
                e.target.style.height = 'auto'
                e.target.style.height = `${e.target.scrollHeight}px`
              }}
              onKeyDown={handleKeyDown}
              onBlur={stopTyping}
            />
          )}

          {text.trim() ? (
            <button
              onClick={sendText}
              disabled={sending}
              className="shrink-0 w-11 h-11 rounded-full flex items-center justify-center transition-all disabled:opacity-40 active:scale-95"
              style={{ background: '#2aabee' }}
            >
              {sending ? <Spinner size={14} /> : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2"
                  style={{ transform: 'rotate(45deg)', marginLeft: '2px' }}>
                  <line x1="22" y1="2" x2="11" y2="13"/>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              )}
            </button>
          ) : (
            <button
              onClick={toggleVoice}
              disabled={sending}
              title={isRecording ? 'Отправить' : 'Голосовое'}
              className="shrink-0 w-11 h-11 rounded-full flex items-center justify-center transition-all disabled:opacity-40 active:scale-95"
              style={{ background: isRecording ? '#ef4444' : '#2aabee' }}
            >
              {sending ? <Spinner size={14} /> : isRecording ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2"
                  style={{ transform: 'rotate(45deg)', marginLeft: '2px' }}>
                  <line x1="22" y1="2" x2="11" y2="13"/>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                  <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/>
                  <path d="M19 10v2a7 7 0 01-14 0v-2"/>
                  <line x1="12" y1="19" x2="12" y2="23"/>
                  <line x1="8" y1="23" x2="16" y2="23"/>
                </svg>
              )}
            </button>
          )}
        </div>

        {!isRecording && (
          <div className="flex items-center gap-1 mt-1 px-0.5">
            <button onClick={() => videoInputRef.current?.click()} disabled={sending} title="Видео"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs transition-colors disabled:opacity-30"
              style={{ color: 'rgba(255,255,255,0.35)' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#2aabee')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.35)')}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="23,7 16,12 23,17 23,7"/><rect x="1" y="5" width="15" height="14" rx="2"/>
              </svg>
              Видео
            </button>
            <button onClick={() => setShowCircle(true)} disabled={sending} title="Кружок"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs transition-colors disabled:opacity-30"
              style={{ color: 'rgba(255,255,255,0.35)' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#2aabee')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.35)')}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><polygon points="10,8 16,12 10,16 10,8"/>
              </svg>
              Кружок
            </button>
          </div>
        )}
      </div>

      <input ref={imageInputRef} type="file" accept={ALLOWED_IMAGE} className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) sendMediaFile(f, 'IMAGE'); e.target.value = '' }} />
      <input ref={videoInputRef} type="file" accept={ALLOWED_VIDEO} className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) sendMediaFile(f, 'VIDEO'); e.target.value = '' }} />

      {showCircle && <CircleRecorderModal onSend={sendCircle} onClose={() => setShowCircle(false)} />}
    </div>
  )
}
