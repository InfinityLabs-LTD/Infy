import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
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

export function ChatPage() {
  const { id: chatId } = useParams<{ id: string }>()
  const myUser = useAuthStore(s => s.user)
  const myUsername = myUser?.username

  const { chats, messages, nextCursor, setMessages, prependMessages, setTyping } = useChatStore()
  const chat = chats.find(c => c.id === chatId)
  const chatMessages = chatId ? (messages[chatId] ?? []) : []
  const cursor = chatId ? nextCursor[chatId] : null

  const typingSet = useChatStore(s => chatId ? s.typing[chatId] : undefined)
  const typingNames = typingSet ? [...typingSet].filter(u => u !== myUsername) : []

  const [loading, setLoading] = useState(true)
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

  // Load messages + join socket room
  useEffect(() => {
    if (!chatId) return
    setLoading(true)
    chatApi.getMessages(chatId)
      .then(r => setMessages(chatId, r.data.data.messages, r.data.data.nextCursor))
      .finally(() => setLoading(false))
    joinChatRoom(chatId)
  }, [chatId])

  // Typing events from socket
  useEffect(() => {
    if (!chatId) return
    const socket = getActiveSocket()
    if (!socket) return
    const handler = ({ chatId: cid, username, typing }: { chatId: string; username: string; typing: boolean }) => {
      if (cid === chatId) setTyping(cid, username, typing)
    }
    socket.on('typing', handler)
    return () => { socket.off('typing', handler) }
  }, [chatId])

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
        socket.emit('join_chat', chatId)  // idempotent — ensures room membership
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
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 bg-white border-b border-gray-100 px-4 py-2.5 flex items-center gap-3 shadow-sm z-10">
        <Avatar url={partner?.avatarUrl ?? null} nickname={partner?.nickname ?? '?'} size={38} />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm truncate leading-tight">
            {partner?.nickname ?? <span className="text-gray-400 font-normal">Загрузка…</span>}
          </p>
          {partner && (
            <OnlineIndicator userId={partner.id} lastSeenAt={partner.lastSeenAt} showLabel />
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1"
           style={{ background: 'linear-gradient(180deg, #faf9ff 0%, #f3f0ff 100%)' }}>
        {cursor && (
          <div className="flex justify-center mb-2">
            <button onClick={loadMore} disabled={loadingMore}
              className="text-xs text-primary-500 hover:text-primary-700 bg-primary-50 hover:bg-primary-100 px-4 py-1.5 rounded-full transition-colors flex items-center gap-1.5">
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
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-primary-50 flex items-center justify-center mb-3">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="1.5">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
              </svg>
            </div>
            <p className="text-gray-400 text-sm">Нет сообщений. Начните общение!</p>
          </div>
        ) : (
          chatMessages.map(msg => <MessageBubble key={msg.id} message={msg} />)
        )}
        <TypingIndicator names={typingNames} />
        <div ref={bottomRef} />
      </div>

      {/* ── Input area — dark purple ── */}
      <div className="shrink-0 bg-[#0e001f] border-t border-white/8 px-3 py-2.5">
        {/* Recording bar */}
        {isRecording && (
          <div className="flex items-center gap-2 px-3 py-1.5 mb-2 rounded-lg bg-red-950/60 border border-red-600/25">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
            <span className="text-xs text-red-300 flex-1 font-medium">
              Запись · {Math.floor(voiceRecorder.duration / 60)}:{String(voiceRecorder.duration % 60).padStart(2, '0')}
            </span>
            <button onClick={() => voiceRecorder.cancel()} className="text-xs text-red-400/70 hover:text-red-200 transition-colors">
              Отмена
            </button>
          </div>
        )}

        <div className="flex items-end gap-1">
          {/* Attach buttons */}
          {!isRecording && (
            <div className="flex items-center gap-0.5 shrink-0 pb-0.5">
              <button onClick={() => imageInputRef.current?.click()} disabled={sending} title="Фото"
                className="w-8 h-8 flex items-center justify-center rounded-lg text-primary-400 hover:text-primary-200 hover:bg-primary-500/20 transition-colors disabled:opacity-30">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21,15 16,10 5,21"/>
                </svg>
              </button>
              <button onClick={() => videoInputRef.current?.click()} disabled={sending} title="Видео"
                className="w-8 h-8 flex items-center justify-center rounded-lg text-primary-400 hover:text-primary-200 hover:bg-primary-500/20 transition-colors disabled:opacity-30">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="23,7 16,12 23,17 23,7"/>
                  <rect x="1" y="5" width="15" height="14" rx="2"/>
                </svg>
              </button>
              <button onClick={() => setShowCircle(true)} disabled={sending} title="Кружок"
                className="w-8 h-8 flex items-center justify-center rounded-lg text-primary-400 hover:text-primary-200 hover:bg-primary-500/20 transition-colors disabled:opacity-30">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <polygon points="10,8 16,12 10,16 10,8"/>
                </svg>
              </button>
            </div>
          )}

          {/* Text input */}
          {!isRecording && (
            <textarea ref={inputRef} rows={1}
              className="flex-1 resize-none rounded-xl bg-white/6 border border-white/10 text-white/90 placeholder-white/25
                         px-3 py-2 text-sm leading-relaxed max-h-28
                         focus:outline-none focus:border-primary-500/50 focus:bg-white/9 transition-colors"
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

          {/* Send / Voice */}
          {text.trim() ? (
            <button onClick={sendText} disabled={sending}
              className="shrink-0 w-9 h-9 rounded-xl bg-primary-600 hover:bg-primary-500 text-white flex items-center justify-center transition-colors disabled:opacity-40 shadow-lg mb-px">
              {sending ? <Spinner size={13} /> : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="22" y1="2" x2="11" y2="13"/>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              )}
            </button>
          ) : (
            <button onClick={toggleVoice} disabled={sending}
              title={isRecording ? 'Отправить' : 'Голосовое'}
              className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-colors disabled:opacity-40 shadow-lg mb-px ${
                isRecording ? 'bg-red-500 hover:bg-red-400 text-white' : 'bg-primary-600 hover:bg-primary-500 text-white'
              }`}>
              {sending ? <Spinner size={13} /> : isRecording ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="22" y1="2" x2="11" y2="13"/>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                  <line x1="12" y1="19" x2="12" y2="23"/>
                  <line x1="8" y1="23" x2="16" y2="23"/>
                </svg>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Hidden file inputs */}
      <input ref={imageInputRef} type="file" accept={ALLOWED_IMAGE} className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) sendMediaFile(f, 'IMAGE'); e.target.value = '' }} />
      <input ref={videoInputRef} type="file" accept={ALLOWED_VIDEO} className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) sendMediaFile(f, 'VIDEO'); e.target.value = '' }} />

      {showCircle && <CircleRecorderModal onSend={sendCircle} onClose={() => setShowCircle(false)} />}
    </div>
  )
}
