import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { chatApi } from '@/api/chat'
import { mediaApi } from '@/api/media'
import { useChatStore } from '@/store/chat'
import { useAuthStore } from '@/store/auth'
import { useSocket } from '@/hooks/useSocket'
import { useMediaRecorder } from '@/hooks/useMediaRecorder'
import { Avatar } from '@/components/ui/Avatar'
import { OnlineIndicator } from '@/components/ui/OnlineIndicator'
import { TypingIndicator } from '@/components/ui/TypingIndicator'
import { MessageBubble } from '@/components/chat/MessageBubble'
import { CircleRecorderModal } from '@/components/chat/CircleRecorderModal'
import { Spinner } from '@/components/ui/Spinner'

const TYPING_DEBOUNCE_MS = 1500
const ALLOWED_IMAGE = 'image/jpeg,image/png,image/gif,image/webp'
const ALLOWED_VIDEO = 'video/mp4,video/webm,video/quicktime'

export function ChatPage() {
  const { id: chatId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const socket = useSocket()
  const myUsername = useAuthStore((s) => s.user?.username)

  const { chats, messages, nextCursor, setMessages, prependMessages, setTyping } = useChatStore()
  const chat = chats.find((c) => c.id === chatId)
  const chatMessages = chatId ? (messages[chatId] ?? []) : []
  const cursor = chatId ? nextCursor[chatId] : null

  const typingSet = useChatStore((s) => (chatId ? s.typing[chatId] : undefined))
  const typingNames = typingSet ? [...typingSet].filter((u) => u !== myUsername) : []

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

  // Load history
  useEffect(() => {
    if (!chatId) return
    setLoading(true)
    chatApi.getMessages(chatId)
      .then((r) => setMessages(chatId, r.data.data.messages, r.data.data.nextCursor))
      .finally(() => setLoading(false))
    socket?.emit('join_chat', chatId)
  }, [chatId])

  // Typing events from socket
  useEffect(() => {
    if (!socket || !chatId) return
    const handler = ({ chatId: cid, username, typing }: { chatId: string; username: string; typing: boolean }) => {
      if (cid === chatId) setTyping(cid, username, typing)
    }
    socket.on('typing', handler)
    return () => { socket.off('typing', handler) }
  }, [socket, chatId])

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages.length])

  async function loadMore() {
    if (!chatId || !cursor || loadingMore) return
    setLoadingMore(true)
    try {
      const r = await chatApi.getMessages(chatId, cursor)
      prependMessages(chatId, r.data.data.messages, r.data.data.nextCursor)
    } finally {
      setLoadingMore(false)
    }
  }

  // ── Send helpers ───────────────────────────────────────────

  async function sendText() {
    if (!text.trim() || !chatId || sending) return
    const content = text.trim()
    setText('')
    setSending(true)
    stopTyping()
    try {
      if (socket?.connected) {
        socket.emit('send_message', { chatId, content })
      } else {
        await chatApi.sendMessage(chatId, content)
      }
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }

  async function sendMediaFile(file: File, msgType: 'IMAGE' | 'VIDEO') {
    if (!chatId) return
    setSending(true)
    try {
      const { data: { data: upload } } = await mediaApi.upload(file)
      await chatApi.sendMedia(chatId, msgType, upload)
    } finally {
      setSending(false)
    }
  }

  async function sendCircle(blob: Blob) {
    if (!chatId) return
    setShowCircle(false)
    setSending(true)
    try {
      const file = new File([blob], 'circle.webm', { type: blob.type })
      const { data: { data: upload } } = await mediaApi.upload(file, 'circle_video')
      await chatApi.sendMedia(chatId, 'CIRCLE_VIDEO', upload)
    } finally {
      setSending(false)
    }
  }

  // Voice recording
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
      } finally {
        setSending(false)
      }
    }
  }

  // Typing signals
  function startTyping() {
    if (!socket || !chatId) return
    if (!isTypingRef.current) { isTypingRef.current = true; socket.emit('typing_start', chatId) }
    if (typingTimer.current) clearTimeout(typingTimer.current)
    typingTimer.current = setTimeout(stopTyping, TYPING_DEBOUNCE_MS)
  }

  function stopTyping() {
    if (!socket || !chatId) return
    if (isTypingRef.current) { isTypingRef.current = false; socket.emit('typing_stop', chatId) }
    if (typingTimer.current) { clearTimeout(typingTimer.current); typingTimer.current = null }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText() }
  }

  const partner = chat?.partner
  const isRecording = voiceRecorder.state === 'recording'

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => navigate('/')} className="btn-ghost p-1 -ml-1">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
        </button>
        <Avatar url={partner?.avatarUrl ?? null} nickname={partner?.nickname ?? '?'} size={40} />
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate">{partner?.nickname ?? 'Chat'}</p>
          {partner && (
            <OnlineIndicator userId={partner.id} lastSeenAt={partner.lastSeenAt} showLabel />
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {cursor && (
          <div className="flex justify-center mb-4">
            <button onClick={loadMore} disabled={loadingMore} className="btn-ghost text-xs text-gray-400">
              {loadingMore ? <Spinner size={14} /> : 'Load older messages'}
            </button>
          </div>
        )}
        {loading ? (
          <div className="flex justify-center py-16"><Spinner size={32} /></div>
        ) : chatMessages.length === 0 ? (
          <p className="text-center text-gray-400 py-16">No messages yet. Say hello!</p>
        ) : (
          chatMessages.map((msg) => <MessageBubble key={msg.id} message={msg} />)
        )}
        <TypingIndicator names={typingNames} />
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="bg-white border-t px-3 py-2.5">
        {/* Voice recording bar */}
        {isRecording && (
          <div className="flex items-center gap-3 px-2 py-2 mb-2 rounded-xl bg-red-50 border border-red-200">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-sm text-red-600 flex-1 font-medium">
              Recording {Math.floor(voiceRecorder.duration / 60)}:{(voiceRecorder.duration % 60).toString().padStart(2, '0')}
            </span>
            <button onClick={() => voiceRecorder.cancel()} className="text-xs text-red-400 hover:text-red-600">
              Cancel
            </button>
          </div>
        )}

        <div className="flex items-end gap-2">
          {/* Attach image */}
          {!isRecording && (
            <button
              onClick={() => imageInputRef.current?.click()}
              disabled={sending}
              className="shrink-0 p-2 text-gray-400 hover:text-primary-600 transition-colors disabled:opacity-40"
              title="Send image"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21,15 16,10 5,21"/>
              </svg>
            </button>
          )}

          {/* Attach video */}
          {!isRecording && (
            <button
              onClick={() => videoInputRef.current?.click()}
              disabled={sending}
              className="shrink-0 p-2 text-gray-400 hover:text-primary-600 transition-colors disabled:opacity-40"
              title="Send video"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="23,7 16,12 23,17 23,7"/>
                <rect x="1" y="5" width="15" height="14" rx="2"/>
              </svg>
            </button>
          )}

          {/* Circle video */}
          {!isRecording && (
            <button
              onClick={() => setShowCircle(true)}
              disabled={sending}
              className="shrink-0 p-2 text-gray-400 hover:text-primary-600 transition-colors disabled:opacity-40"
              title="Record circle video"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <polygon points="10,8 16,12 10,16 10,8"/>
              </svg>
            </button>
          )}

          {/* Text input */}
          {!isRecording && (
            <textarea
              ref={inputRef}
              rows={1}
              className="input flex-1 resize-none max-h-32 py-2.5 leading-relaxed"
              placeholder="Message…"
              value={text}
              onChange={(e) => {
                setText(e.target.value)
                startTyping()
                e.target.style.height = 'auto'
                e.target.style.height = `${e.target.scrollHeight}px`
              }}
              onKeyDown={handleKeyDown}
              onBlur={stopTyping}
            />
          )}

          {/* Voice / send button */}
          {text.trim() ? (
            <button
              onClick={sendText}
              disabled={sending}
              className="shrink-0 btn-primary px-3.5 py-2.5 disabled:opacity-40"
            >
              {sending ? <Spinner size={16} /> : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="22" y1="2" x2="11" y2="13"/>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              )}
            </button>
          ) : (
            <button
              onClick={toggleVoice}
              disabled={sending}
              className={`shrink-0 w-11 h-11 rounded-full flex items-center justify-center transition-colors disabled:opacity-40 ${
                isRecording
                  ? 'bg-red-500 text-white hover:bg-red-600'
                  : 'bg-primary-600 text-white hover:bg-primary-700'
              }`}
              title={isRecording ? 'Send voice' : 'Record voice'}
            >
              {sending ? <Spinner size={16} /> : isRecording ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="22" y1="2" x2="11" y2="13"/>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
      <input
        ref={imageInputRef}
        type="file"
        accept={ALLOWED_IMAGE}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) sendMediaFile(file, 'IMAGE')
          e.target.value = ''
        }}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept={ALLOWED_VIDEO}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) sendMediaFile(file, 'VIDEO')
          e.target.value = ''
        }}
      />

      {/* Circle video recorder modal */}
      {showCircle && (
        <CircleRecorderModal
          onSend={sendCircle}
          onClose={() => setShowCircle(false)}
        />
      )}
    </div>
  )
}
