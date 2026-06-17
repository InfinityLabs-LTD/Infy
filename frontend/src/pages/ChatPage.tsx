import { Fragment, useEffect, useRef, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { chatApi } from '@/api/chat'
import { aiApi } from '@/api/ai'
import { mediaApi } from '@/api/media'
import { useChatStore, type Message, type MessageAttachment } from '@/store/chat'
import { useAuthStore } from '@/store/auth'
import { getActiveSocket, joinChatRoom } from '@/lib/socket'
import { Avatar } from '@/components/ui/Avatar'
import { OnlineIndicator } from '@/components/ui/OnlineIndicator'
import { TypingIndicator } from '@/components/ui/TypingIndicator'
import { MessageBubble } from '@/components/chat/MessageBubble'
import { CircleRecorderModal } from '@/components/chat/CircleRecorderModal'
import { PartnerInfoPanel } from '@/components/chat/PartnerInfoPanel'
import { ReportModal } from '@/components/chat/ReportModal'
import { CalendarPanel } from '@/components/chat/calendar/CalendarPanel'
import { AiPanel } from '@/components/chat/AiPanel'
import { Spinner } from '@/components/ui/Spinner'
import { useMediaRecorder } from '@/hooks/useMediaRecorder'
import { callController } from '@/lib/callController'
import { useCallStore } from '@/store/call'
import {
  addPendingJob, getPendingJob, removePendingJob, setPendingExpireHandler,
  startPendingSweeper, sweepExpired, type PendingJob, type PendingLocal,
} from '@/lib/pendingMedia'

const TYPING_DEBOUNCE_MS = 1500
const GROUP_WINDOW_MS = 60_000
const ALLOWED_IMAGE = 'image/jpeg,image/png,image/gif,image/webp'
const ALLOWED_VIDEO = 'video/mp4,video/webm,video/quicktime'
const ALLOWED_FILE = '*/*'
const MAX_ALBUM = 10

interface StagedFile {
  id: string
  file: File
  previewUrl?: string  // object URL для фото/видео
  kind: 'image' | 'video' | 'document'
}

function stagedKind(file: File): StagedFile['kind'] {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  return 'document'
}

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

function pinnedLabel(type: string): string {
  const m: Record<string, string> = {
    IMAGE: '🖼 Фото', VIDEO: '🎥 Видео', AUDIO: '🎤 Голосовое', CIRCLE_VIDEO: '⭕ Кружок',
    FILE: '📎 Файл', ALBUM: '🖼 Альбом',
  }
  return m[type] ?? 'Вложение'
}

function SystemNotice({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center my-2">
      <span className="px-3 py-1 rounded-full text-xs font-medium text-center"
        style={{ background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.06)', color: 'var(--text-mid)' }}>
        {text}
      </span>
    </div>
  )
}

function DateSeparator({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center my-3">
      <span className="px-3 py-1 rounded-full text-xs font-medium"
        style={{ background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.06)', color: 'var(--text-mid)' }}>
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

  const { chats, messages, nextCursor, socketReady, setMessages, prependMessages, setTyping, upsertChat, resetUnread, updateMessage, removeChat, addMessage, replaceMessage, setMessageFailed, setMessageStatus, removeMessage } = useChatStore()

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

  // Закреплённое сообщение чата (загружается отдельно — может быть вне окна истории)
  const [pinned, setPinned] = useState<Message | null>(null)

  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [showCircle, setShowCircle] = useState(false)
  const [showPanel, setShowPanel] = useState(false)
  const [showCalendar, setShowCalendar] = useState(false)
  const [showAi, setShowAi] = useState(false)
  const [showAttachMenu, setShowAttachMenu] = useState(false)
  const [showHeaderMenu, setShowHeaderMenu] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [shortRecordToast, setShortRecordToast] = useState(false)
  const [searchMode, setSearchMode] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null)
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [editing, setEditing] = useState<Message | null>(null)
  const [reactLimitToast, setReactLimitToast] = useState(false)
  // Сообщение о муте — показывается в композере, если отправка отклонена санкцией.
  const [mutedNotice, setMutedNotice] = useState<string | null>(null)
  // Файлы, выбранные для отправки альбомом (до 10). Превью показывается над композером.
  const [staged, setStaged] = useState<StagedFile[]>([])
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [recordMode, setRecordMode] = useState<'voice' | 'circle'>('voice')
  const [recordLocked, setRecordLocked] = useState(false)
  const [circleAutoSend, setCircleAutoSend] = useState(false)

  // ── Infy Pulse: подсказки ответов над полем ввода ──
  // Грузятся по кнопке-искре. Показываются только если пользователь включил их в настройках
  // и последнее сообщение в чате — от собеседника.
  const [suggestions, setSuggestions] = useState<string[] | null>(null)
  const [suggestLoading, setSuggestLoading] = useState(false)

  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const prevMsgLengthRef = useRef(0)
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isTypingRef = useRef(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const holdStartY = useRef(0)
  const holdStartX = useRef(0)
  // Жест отмены: свайп влево по незафиксированной записи удаляет её.
  const [recordCancelHint, setRecordCancelHint] = useState(0)  // 0..1 прогресс свайпа влево
  const isHoldingRef = useRef(false)
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Рефы для актуального состояния в нативных обработчиках (без stale closure)
  const recordModeRef = useRef<'voice' | 'circle'>('voice')
  const recordLockedRef = useRef(false)
  const globalListenersCleanupRef = useRef<(() => void) | null>(null)

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

  // Досинхронизация при возврате в приложение (из уведомления / из фона).
  // Пока вкладка свёрнута, сообщение по сокету могло не дойти; при фокусе
  // дочитываем актуальную историю и помечаем прочитанным — иначе нового
  // сообщения не видно, пока не перезайти в чат.
  useEffect(() => {
    if (!chatId) return
    const resync = () => {
      if (document.hidden) return
      chatApi.getMessages(chatId)
        .then(r => {
          setMessages(chatId, r.data.data.messages, r.data.data.nextCursor)
          const lastId = r.data.data.messages.at(-1)?.id
          if (lastId) {
            getActiveSocket()?.emit('mark_read', { chatId, messageId: lastId })
            resetUnread(chatId)
          }
        })
        .catch(() => { /* не критично */ })
    }
    document.addEventListener('visibilitychange', resync)
    window.addEventListener('focus', resync)
    return () => {
      document.removeEventListener('visibilitychange', resync)
      window.removeEventListener('focus', resync)
    }
  }, [chatId])

  // Сбрасываем выбранные файлы при смене чата и освобождаем object URL'ы
  useEffect(() => {
    return () => { setStaged(prev => { prev.forEach(s => s.previewUrl && URL.revokeObjectURL(s.previewUrl)); return [] }) }
  }, [chatId])

  // Реестр оптимистичных отправок: если задание истекло (прошло больше суток),
  // убираем неотправленное сообщение из ленты. Чистку запускаем на маунте.
  useEffect(() => {
    setPendingExpireHandler((job) => {
      useChatStore.getState().removeMessage(job.chatId, job.tempId)
    })
    startPendingSweeper()
    sweepExpired()
  }, [])

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

  // Загружаем закреплённое сообщение
  useEffect(() => {
    if (!chatId) { setPinned(null); return }
    chatApi.getPinned(chatId).then(r => setPinned(r.data.data)).catch(() => setPinned(null))
  }, [chatId])

  // Держим закреплённое в синхроне с обновлениями загруженных сообщений
  // (реакции/пин приходят по сокету через updateMessage → меняется chatMessages).
  useEffect(() => {
    if (!chatId) return
    const pinnedInList = chatMessages.find(m => m.pinnedAt)
    if (pinnedInList) {
      setPinned(pinnedInList)
    } else if (pinned && chatMessages.some(m => m.id === pinned.id && !m.pinnedAt)) {
      // Текущее закреплённое было откреплено
      setPinned(null)
    }
  }, [chatMessages, chatId])

  // Синхронизируем рефы со state для нативных обработчиков
  useEffect(() => { recordModeRef.current = recordMode }, [recordMode])
  useEffect(() => { recordLockedRef.current = recordLocked }, [recordLocked])

  // Освобождаем аудио-стрим при уходе со страницы
  useEffect(() => {
    return () => { (voiceRecorder as ReturnType<typeof useMediaRecorder> & { releaseStream?: () => void }).releaseStream?.() }
  }, [])

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

  // Instant scroll to bottom after initial load (or chat switch)
  useEffect(() => {
    if (loading) return
    // double rAF ensures the browser has painted the messages before scrolling
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = scrollContainerRef.current
        if (el) el.scrollTop = el.scrollHeight
        prevMsgLengthRef.current = chatMessages.length
      })
    })
    return () => cancelAnimationFrame(raf)
  }, [loading, chatId])

  // Smooth scroll only for a single newly appended message (incoming/sent)
  useEffect(() => {
    if (loading) return
    const prev = prevMsgLengthRef.current
    prevMsgLengthRef.current = chatMessages.length
    if (prev > 0 && chatMessages.length === prev + 1) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
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

    // Команда /ask <вопрос> — вызов Infy Pulse в чате (вопрос и ответ видны обоим).
    // Не блокируем поле ввода: вопрос публикуется сразу, ответ ИИ придёт
    // асинхронно по сокету как отдельное сообщение.
    if (/^\/ask\b/i.test(content) && !editing) {
      const question = content.replace(/^\/ask\b\s*/i, '').trim()
      if (!question) return
      setText('')
      setReplyTo(null)
      setMutedNotice(null)
      stopTyping()
      aiApi.ask(chatId, question).catch((err) => {
        const e = err as { response?: { status?: number; data?: { error?: { message?: string } } } }
        setMutedNotice(e.response?.status === 503
          ? 'AI-функции не настроены на сервере'
          : (e.response?.data?.error?.message ?? 'Не удалось отправить запрос AI'))
        setText(content)
      })
      inputRef.current?.focus()
      return
    }

    // Режим редактирования — PATCH вместо отправки
    if (editing) {
      const target = editing
      setText('')
      setEditing(null)
      setSending(true)
      stopTyping()
      try {
        const res = await chatApi.editMessage(target.id, content)
        updateMessage(res.data.data)
      } finally { setSending(false); inputRef.current?.focus() }
      return
    }

    const replyToId = replyTo?.id
    setText('')
    setReplyTo(null)
    setSending(true)
    setMutedNotice(null)
    stopTyping()
    try {
      const socket = getActiveSocket()
      // Ответ всегда уходит через REST — у сокет-обработчика нет replyToId
      if (socket?.connected && !replyToId) {
        socket.emit('join_chat', chatId)
        socket.emit('send_message', { chatId, content }, (res: { ok: boolean; error?: string; code?: string }) => {
          if (res?.ok) return
          // Санкция (мут/бан) — показываем причину, не уходим в REST-фолбэк.
          if (res?.code === 'MOD_ACCOUNT_MUTED' || res?.code === 'MOD_ACCOUNT_BANNED') {
            setMutedNotice(res.error ?? 'Вы не можете отправлять сообщения')
            setText(content)
            return
          }
          chatApi.sendMessage(chatId, content).catch(handleSendError)
        })
      } else {
        await chatApi.sendMessage(chatId, content, replyToId)
      }
    } catch (err) {
      handleSendError(err)
      setText(content)
    } finally { setSending(false); inputRef.current?.focus() }
  }

  // Показывает причину, если отправка отклонена санкцией модерации.
  function handleSendError(err: unknown) {
    const e = err as { response?: { status?: number; data?: { error?: { code?: string; message?: string } } } }
    const code = e.response?.data?.error?.code
    if (code === 'MOD_ACCOUNT_MUTED' || code === 'MOD_ACCOUNT_BANNED') {
      setMutedNotice(e.response?.data?.error?.message ?? 'Вы не можете отправлять сообщения')
    }
  }

  function startReply(msg: Message) {
    setEditing(null)
    setReplyTo(msg)
    inputRef.current?.focus()
  }

  function startEdit(msg: Message) {
    setReplyTo(null)
    setEditing(msg)
    setText(msg.content ?? '')
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  function cancelComposerExtra() {
    setReplyTo(null)
    if (editing) { setEditing(null); setText('') }
  }

  // ── Infy Pulse: подсказки ответов ──
  // Последнее сообщение в чате — от собеседника? Только тогда есть смысл подсказывать ответ.
  const lastMsg = chatMessages.length ? chatMessages[chatMessages.length - 1] : null
  const lastFromPartner = !!lastMsg && lastMsg.sender.id !== myUser?.id &&
    lastMsg.type !== 'SYSTEM' && lastMsg.type !== 'AI_QUERY'
  // Кнопку-искру показываем, если подсказки включены в настройках, ИИ-функции в принципе
  // доступны, поле ввода пустое и последним писал собеседник.
  const canSuggest = (myUser?.aiSuggestReplies ?? true) && lastFromPartner && !text.trim() && !staged.length

  async function loadSuggestions() {
    if (!chatId || suggestLoading) return
    setSuggestLoading(true)
    try {
      const r = await aiApi.replies(chatId)
      const got = r.data.data.replies
      // Пусто (модель не вернула вариантов / промах парсинга) — оставляем кнопку
      // видимой (suggestions = null), чтобы можно было повторить, а не «глухой» экран.
      setSuggestions(got.length > 0 ? got : null)
    } catch {
      setSuggestions(null)
    } finally { setSuggestLoading(false) }
  }

  function applySuggestion(s: string) {
    setText(s)
    setSuggestions(null)
    setTimeout(() => {
      const el = inputRef.current
      if (!el) return
      el.focus()
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight}px`
    }, 0)
  }

  // Сбрасываем подсказки при смене чата или когда последним стал не собеседник
  // (например, пользователь только что отправил сообщение).
  useEffect(() => { setSuggestions(null) }, [chatId])
  useEffect(() => { if (!lastFromPartner) setSuggestions(null) }, [lastFromPartner])

  // ── Фоновая отправка медиа ──────────────────────────────────
  // Сообщение сразу появляется у отправителя (со значком таймера), поле
  // ввода остаётся доступным, а файл(ы) грузятся в фоне. По завершении
  // оптимистичный плейсхолдер заменяется реальным сообщением с сервера.
  // При ошибке сообщение помечается как неотправленное — повтор по тапу;
  // исходные файлы хранятся в памяти сутки (см. lib/pendingMedia).

  function buildOptimisticAttachment(la: PendingLocal, idx: number): MessageAttachment {
    return {
      id: `temp-att-${idx}`,
      storageKey: '',
      fileName: la.kind === 'document' ? la.file.name : undefined,
      thumbnailKey: null,
      mimeType: la.file.type,
      sizeBytes: la.file.size,
      width: null,
      height: null,
      durationMs: null,
      waveform: null,
      // Локальный object URL — мгновенный предпросмотр до завершения загрузки.
      publicUrl: la.previewUrl,
    }
  }

  // Загружает файлы задания и отправляет сообщение. На успехе — заменяет
  // плейсхолдер реальным сообщением и снимает задание из реестра; на ошибке —
  // помечает сообщение как неотправленное (задание остаётся для повтора).
  async function runJob(job: PendingJob, optimistic: Message) {
    try {
      const uploads = await Promise.all(
        job.locals.map(l => mediaApi.upload(l.file, l.hint, l.durationMs).then(r => r.data.data)),
      )
      // Помечаем плейсхолдер реальными storageKey'ями: если широковещание
      // по сокету придёт раньше REST-ответа, addMessage сопоставит его с
      // плейсхолдером и не покажет дубль.
      updateMessage({
        ...optimistic,
        pending: true,
        failed: false,
        attachments: (optimistic.attachments ?? []).map((a, i) => ({
          ...a, storageKey: uploads[i]?.storageKey ?? a.storageKey,
        })),
      })
      let real: Message
      if (job.msgType === 'ALBUM') {
        const res = await chatApi.sendAlbum(job.chatId, uploads, job.caption || undefined, job.replyToId)
        real = res.data.data
      } else {
        const res = await chatApi.sendMedia(job.chatId, job.msgType, uploads[0])
        real = res.data.data
      }
      replaceMessage(job.chatId, job.tempId, real)
      removePendingJob(job.tempId)  // освобождает и object URL'ы предпросмотра
    } catch (err) {
      setMessageFailed(job.chatId, job.tempId, true)
      handleSendError(err)
    }
  }

  // Создаёт оптимистичное сообщение, регистрирует задание и запускает отправку.
  function backgroundSendMedia(
    targetChatId: string,
    msgType: PendingJob['msgType'],
    locals: PendingLocal[],
    opts?: { caption?: string; replyToId?: string },
  ) {
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const optimistic: Message = {
      id: tempId,
      chatId: targetChatId,
      content: opts?.caption || null,
      type: msgType,
      createdAt: new Date().toISOString(),
      editedAt: null,
      sender: {
        id: myUser?.id ?? '',
        username: myUser?.username ?? '',
        nickname: myUser?.nickname ?? '',
        avatarUrl: myUser?.avatarUrl ?? null,
      },
      attachments: locals.map(buildOptimisticAttachment),
      pending: true,
    }
    addMessage(optimistic)

    const job: PendingJob = {
      tempId, chatId: targetChatId, msgType, locals,
      caption: opts?.caption, replyToId: opts?.replyToId, createdAt: Date.now(),
    }
    addPendingJob(job)
    void runJob(job, optimistic)
  }

  // Повтор отправки по тапу на неотправленном сообщении.
  function retrySend(msg: Message) {
    const job = getPendingJob(msg.id)
    if (!job) {
      // Задание истекло (прошло больше суток) — просто убираем плашку.
      removeMessage(msg.chatId, msg.id)
      return
    }
    setMessageStatus(msg.chatId, msg.id, { pending: true, failed: false })
    void runJob(job, msg)
  }

  function sendMediaFile(file: File, msgType: 'IMAGE' | 'VIDEO') {
    if (!chatId) return
    const kind = msgType === 'IMAGE' ? 'image' : 'video'
    backgroundSendMedia(chatId, msgType, [{ file, kind, previewUrl: URL.createObjectURL(file) }])
  }

  // Добавляет выбранные файлы в очередь отправки (альбом). Лимит — 10.
  function stageFiles(files: FileList | File[]) {
    const list = Array.from(files)
    setStaged(prev => {
      const room = MAX_ALBUM - prev.length
      const next = list.slice(0, Math.max(0, room)).map(file => {
        const kind = stagedKind(file)
        return {
          id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 8)}`,
          file,
          kind,
          previewUrl: kind === 'document' ? undefined : URL.createObjectURL(file),
        } satisfies StagedFile
      })
      return [...prev, ...next]
    })
  }

  function removeStaged(id: string) {
    setStaged(prev => {
      const item = prev.find(s => s.id === id)
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl)
      return prev.filter(s => s.id !== id)
    })
  }

  function clearStaged() {
    setStaged(prev => { prev.forEach(s => s.previewUrl && URL.revokeObjectURL(s.previewUrl)); return [] })
  }

  // Отправляет очередь файлов одним сообщением-альбомом (или одиночным медиа, если файл один).
  // Текст из композера идёт общей подписью. Отправка — в фоне, композер сразу свободен.
  function sendStaged() {
    if (!chatId || staged.length === 0) return
    const caption = text.trim()
    const replyToId = replyTo?.id
    const items = staged

    const locals: PendingLocal[] = items.map(s => ({
      file: s.file,
      kind: s.kind,
      hint: s.kind === 'document' ? 'document' : undefined,
      previewUrl: s.previewUrl,  // переносим владение object URL оптимистичному сообщению
    }))

    if (locals.length === 1 && !caption) {
      const k = locals[0].kind
      const type = k === 'image' ? 'IMAGE' : k === 'video' ? 'VIDEO' : 'FILE'
      backgroundSendMedia(chatId, type, locals, { replyToId })
    } else {
      backgroundSendMedia(chatId, 'ALBUM', locals, { caption, replyToId })
    }

    // Очищаем очередь, НЕ освобождая object URL'ы — ими теперь владеет
    // оптимистичное сообщение (revoke после успешной отправки).
    setStaged([])
    setText('')
    setReplyTo(null)
    setMutedNotice(null)
  }

  function sendCircle(blob: Blob) {
    if (!chatId) return
    setShowCircle(false); setCircleAutoSend(false)
    const file = new File([blob], 'circle.webm', { type: blob.type })
    backgroundSendMedia(chatId, 'CIRCLE_VIDEO', [
      { file, kind: 'video', hint: 'circle_video', previewUrl: URL.createObjectURL(blob) },
    ])
  }

  async function sendVoiceBlob() {
    const blob = await voiceRecorder.stop()
    // Точная длительность фиксируется в момент stop() (в мс), а не по
    // целочисленному счётчику секунд — иначе запись ~1.8с занижалась до 1с.
    const elapsedMs = voiceRecorder.getElapsedMs()
    recordLockedRef.current = false
    setRecordLocked(false)
    isHoldingRef.current = false
    if (!blob || blob.size < 1000 || !chatId) return
    if (elapsedMs < 1000) {
      setShortRecordToast(true)
      setTimeout(() => setShortRecordToast(false), 2500)
      return
    }
    const file = new File([blob], 'voice.webm', { type: blob.type })
    backgroundSendMedia(chatId, 'AUDIO', [
      { file, kind: 'document', previewUrl: URL.createObjectURL(blob), durationMs: elapsedMs },
    ])
  }

  function cancelRecord() {
    if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null }
    globalListenersCleanupRef.current?.()
    isHoldingRef.current = false
    if (recordModeRef.current === 'voice') voiceRecorder.cancel()
    else { setShowCircle(false); setCircleAutoSend(false) }
    recordLockedRef.current = false
    setRecordLocked(false)
    setRecordCancelHint(0)
  }

  function onRecordPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (text.trim() || sending || recordLockedRef.current) return
    e.preventDefault()
    isHoldingRef.current = true
    holdStartY.current = e.clientY
    holdStartX.current = e.clientX

    // Запускаем запись только через 250мс — до этого считается одиночным нажатием
    holdTimerRef.current = setTimeout(() => {
      holdTimerRef.current = null
      if (!isHoldingRef.current) return
      if (recordModeRef.current === 'voice') voiceRecorder.start()
      else setShowCircle(true)
    }, 250)

    // Порог свайпа влево для отмены (удаления) незафиксированной записи.
    const CANCEL_DX = 120

    // Нативные обработчики на document — надёжно на мобильном
    function onMove(ev: PointerEvent) {
      if (!isHoldingRef.current || recordLockedRef.current) return
      const dy = holdStartY.current - ev.clientY
      const dx = holdStartX.current - ev.clientX  // >0 — влево

      // Свайп влево — отмена/удаление записи. Показываем прогресс-подсказку.
      if (dx > 0) {
        setRecordCancelHint(Math.min(1, dx / CANCEL_DX))
        if (dx > CANCEL_DX) {
          setRecordCancelHint(0)
          cleanup()
          cancelRecord()
          return
        }
      } else if (dx <= 0) {
        if (recordCancelHint !== 0) setRecordCancelHint(0)
      }

      // Свайп вверх — фиксация (только если не уводим влево заметно).
      if (dy > 120 && dx < 60) {
        recordLockedRef.current = true
        setRecordLocked(true)
        setRecordCancelHint(0)
      }
    }

    function onUp() {
      cleanup()
      setRecordCancelHint(0)
      if (!isHoldingRef.current) return
      isHoldingRef.current = false

      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current)
        holdTimerRef.current = null
        const next = recordModeRef.current === 'voice' ? 'circle' : 'voice'
        recordModeRef.current = next
        setRecordMode(next)
        return
      }

      if (recordLockedRef.current) return
      if (recordModeRef.current === 'voice') sendVoiceBlob()
      else setCircleAutoSend(true)
    }

    function onCancel() {
      cleanup()
      cancelRecord()
    }

    function cleanup() {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onCancel)
      document.removeEventListener('touchend', onUp)
      globalListenersCleanupRef.current = null
    }

    globalListenersCleanupRef.current = cleanup
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onCancel)
    document.addEventListener('touchend', onUp)  // fallback для iOS
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
    // На мобильных (тач/сенсор) Enter переносит строку — отправка только кнопкой.
    const isTouch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
    if (e.key === 'Enter' && !e.shiftKey && !isTouch) { e.preventDefault(); sendText() }
  }

  function scrollToMessage(msgId: string) {
    const el = document.getElementById(`msg-${msgId}`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setHighlightedMsgId(msgId)
    setTimeout(() => setHighlightedMsgId(null), 1800)
  }

  const searchResults = searchQuery.trim().length > 1
    ? chatMessages.filter(m =>
        m.type !== 'SYSTEM' && m.content?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : []

  const partner = chat?.partner

  // Звонок уже идёт — блокируем повторную инициацию.
  const callBusy = useCallStore(s => s.phase !== 'idle')

  function startCall(media: 'AUDIO' | 'VIDEO') {
    if (!partner || callBusy || !chatId) return
    void callController.startCall(chatId, media, {
      id: partner.id,
      username: partner.username,
      nickname: partner.nickname,
      avatarUrl: partner.avatarUrl,
    })
  }

  async function handleDeleteChat() {
    if (!chatId || deleting) return
    setDeleting(true)
    try {
      await chatApi.deleteChat(chatId)
      removeChat(chatId)
      navigate('/')
    } finally {
      setDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  // Чат удалён собеседником (по сокету) — уходим на список, если открыт именно он.
  useEffect(() => {
    function onChatDeleted(e: Event) {
      const detail = (e as CustomEvent<{ chatId: string }>).detail
      if (detail?.chatId && detail.chatId === chatId) navigate('/')
    }
    window.addEventListener('chat:deleted', onChatDeleted)
    return () => window.removeEventListener('chat:deleted', onChatDeleted)
  }, [chatId, navigate])

  return (
    <div className="flex flex-col flex-1 min-h-0" style={{ background: 'var(--bg-base)' }}>
      {/* ── Header ── */}
      <div className="shrink-0 z-10" style={{
        background: 'rgba(255,255,255,0.04)',
        backdropFilter: 'blur(24px) saturate(140%)',
        WebkitBackdropFilter: 'blur(24px) saturate(140%)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        {searchMode ? (
          /* Режим поиска */
          <div className="flex items-center gap-2 px-2 py-2">
            <IconBtn onClick={() => { setSearchMode(false); setSearchQuery('') }} color="rgba(255,255,255,0.6)">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </IconBtn>
            <input
              ref={searchInputRef}
              autoFocus
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Поиск по сообщениям…"
              className="flex-1 bg-transparent text-sm text-white outline-none placeholder-white/30"
            />
            {searchQuery && (
              <IconBtn onClick={() => setSearchQuery('')} color="rgba(255,255,255,0.4)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </IconBtn>
            )}
          </div>
        ) : (
          /* Обычный хедер */
          <div className="flex items-center gap-2 px-2 py-2">
            <Link to="/" className="md:hidden shrink-0">
              <IconBtn color="rgba(255,255,255,0.6)">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <polyline points="15 18 9 12 15 6"/>
                </svg>
              </IconBtn>
            </Link>

            <button
              className="flex items-center gap-3 flex-1 min-w-0 text-left rounded-lg px-1 py-0.5 hover:bg-white/5 transition-colors"
              onClick={() => partner && !resolving && setShowPanel(true)}
            >
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
              {/* Infy Pulse — AI: акцентная кнопка с плавной пульсацией */}
              <button
                onClick={() => chatId && setShowAi(true)}
                title="Infy Pulse — AI"
                className="puls-btn relative w-9 h-9 mr-0.5 flex items-center justify-center rounded-full shrink-0 active:scale-90 transition-transform"
              >
                {/* Пульсирующее кольцо-ореол */}
                <span className="puls-ring" aria-hidden />
                <span className="relative z-[1] flex items-center justify-center text-white" style={{ transform: 'translateY(1.5px)' }}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z"/>
                  </svg>
                </span>
              </button>

              {/* Сэндвич-меню действий чата */}
              <div className="relative">
                <IconBtn
                  onClick={() => setShowHeaderMenu(v => !v)}
                  title="Меню"
                  color={showHeaderMenu ? '#A855F7' : 'rgba(255,255,255,0.5)'}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <line x1="3" y1="6" x2="21" y2="6"/>
                    <line x1="3" y1="12" x2="21" y2="12"/>
                    <line x1="3" y1="18" x2="21" y2="18"/>
                  </svg>
                </IconBtn>

                {showHeaderMenu && (
                  <>
                    {/* Клик вне меню — закрыть */}
                    <div className="fixed inset-0 z-10" onClick={() => setShowHeaderMenu(false)} />
                    <div className="glass-pop absolute top-12 right-0 z-20 rounded-2xl overflow-hidden"
                      style={{ minWidth: 230 }}>

                      {/* Группа: связь */}
                      <div className="px-4 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider"
                        style={{ color: 'var(--text-low)' }}>Связь</div>
                      <button
                        className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-white hover:bg-white/5 transition-colors disabled:opacity-30"
                        disabled={!partner || resolving || !chatId || callBusy}
                        onClick={() => { setShowHeaderMenu(false); startCall('AUDIO') }}
                      >
                        <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                          style={{ background: 'rgba(52,211,153,0.15)' }}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>
                          </svg>
                        </div>
                        Аудиозвонок
                      </button>
                      <button
                        className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-white hover:bg-white/5 transition-colors disabled:opacity-30"
                        disabled={!partner || resolving || !chatId || callBusy}
                        onClick={() => { setShowHeaderMenu(false); startCall('VIDEO') }}
                      >
                        <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                          style={{ background: 'rgba(96,165,250,0.15)' }}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
                          </svg>
                        </div>
                        Видеозвонок
                      </button>

                      {/* Группа: чат */}
                      <div className="px-4 pt-2.5 pb-1 mt-1 text-[10px] font-semibold uppercase tracking-wider"
                        style={{ color: 'var(--text-low)', borderTop: '1px solid rgba(255,255,255,0.06)' }}>Чат</div>
                      <button
                        className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-white hover:bg-white/5 transition-colors"
                        onClick={() => { setShowHeaderMenu(false); setSearchMode(true) }}
                      >
                        <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                          style={{ background: 'rgba(167,139,250,0.15)' }}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2">
                            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                          </svg>
                        </div>
                        Поиск по диалогу
                      </button>
                      <button
                        className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-white hover:bg-white/5 transition-colors disabled:opacity-30"
                        disabled={!chatId}
                        onClick={() => { setShowHeaderMenu(false); setShowCalendar(true) }}
                      >
                        <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                          style={{ background: 'rgba(124,58,237,0.18)' }}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#A855F7" strokeWidth="2">
                            <rect x="3" y="4" width="18" height="18" rx="2"/>
                            <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
                            <line x1="3" y1="10" x2="21" y2="10"/>
                          </svg>
                        </div>
                        Календарь
                      </button>

                      {/* Группа: опасная зона */}
                      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} className="mt-1">
                        <button
                          className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-white hover:bg-white/5 transition-colors disabled:opacity-30"
                          disabled={!partner}
                          onClick={() => { setShowHeaderMenu(false); setShowReport(true) }}
                        >
                          <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                            style={{ background: 'rgba(245,158,11,0.15)' }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2"
                              strokeLinecap="round" strokeLinejoin="round">
                              <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" />
                            </svg>
                          </div>
                          Пожаловаться
                        </button>
                        <button
                          className="flex items-center gap-3 w-full px-4 py-2.5 text-sm hover:bg-red-500/10 transition-colors disabled:opacity-30"
                          style={{ color: '#f87171' }}
                          disabled={!chatId}
                          onClick={() => { setShowHeaderMenu(false); setShowDeleteConfirm(true) }}
                        >
                          <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                            style={{ background: 'rgba(239,68,68,0.12)' }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2">
                              <polyline points="3 6 5 6 21 6"/>
                              <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                              <path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                            </svg>
                          </div>
                          Удалить диалог
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Результаты поиска */}
        {searchMode && searchQuery.trim().length > 1 && (
          <div className="border-t border-white/5 overflow-y-auto" style={{ maxHeight: 240 }}>
            {searchResults.length === 0 ? (
              <p className="text-xs text-center py-3" style={{ color: 'var(--text-low)' }}>Ничего не найдено</p>
            ) : (
              searchResults.map(msg => (
                <button
                  key={msg.id}
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-white/5 transition-colors"
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                  onClick={() => { setSearchMode(false); setSearchQuery(''); scrollToMessage(msg.id) }}
                >
                  <p className="text-white truncate">{msg.content}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-low)' }}>
                    {new Date(msg.createdAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* ── Закреплённое сообщение ── */}
      {pinned && !searchMode && (
        <button
          onClick={() => scrollToMessage(pinned.id)}
          className="shrink-0 flex items-center gap-2 px-3 py-1.5 text-left z-[5]"
          style={{
            background: 'rgba(168,85,247,0.10)',
            borderBottom: '1px solid rgba(168,85,247,0.18)',
            backdropFilter: 'blur(12px)',
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#C084FC" strokeWidth="2" className="shrink-0">
            <path d="M12 17v5M9 3h6l-1 7 3 2v2H7v-2l3-2-1-7z"/>
          </svg>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold leading-tight" style={{ color: '#C084FC' }}>Закреплённое сообщение</p>
            <p className="text-xs truncate" style={{ color: 'rgba(255,255,255,0.7)' }}>
              {pinned.content ?? pinnedLabel(pinned.type)}
            </p>
          </div>
        </button>
      )}

      {/* ── Messages ── */}
      <div ref={scrollContainerRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-2 py-2 chat-bg">
        {resolving ? (
          <div className="flex justify-center py-12"><Spinner size={28} /></div>
        ) : (
          <div className="mx-auto w-full max-w-[880px]">
            {cursor && (
              <div className="flex justify-center mb-2">
                <button onClick={loadMore} disabled={loadingMore}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs transition-colors"
                  style={{ background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(8px)', color: '#C084FC' }}>
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
                  style={{ background: 'rgba(124,58,237,0.15)' }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#A855F7" strokeWidth="1.5">
                    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                  </svg>
                </div>
                <p className="text-sm" style={{ color: 'var(--text-low)' }}>Нет сообщений. Начните общение!</p>
              </div>
            ) : (
              chatMessages.map((msg, idx) => {
                const prev = chatMessages[idx - 1]
                const next = chatMessages[idx + 1]
                const showDate = !prev || new Date(msg.createdAt).toDateString() !== new Date(prev.createdAt).toDateString()
                const isHighlighted = highlightedMsgId === msg.id

                // Системное сообщение — центрированная плашка, без пузыря и меню
                if (msg.type === 'SYSTEM') {
                  return (
                    <Fragment key={msg.id}>
                      {showDate && <DateSeparator label={formatDateLabel(msg.createdAt)} />}
                      <SystemNotice text={msg.content ?? ''} />
                    </Fragment>
                  )
                }

                // Группировка: тот же автор, тот же день, разрыв ≤ 60 сек.
                // Системные и AI-сообщения (запрос/ответ) разрывают группу —
                // у них своя стилизация и они не должны сливаться с обычными.
                const isPlain = (t: string) => t !== 'SYSTEM' && t !== 'AI' && t !== 'AI_QUERY'
                const groupWithPrev = !!prev && isPlain(prev.type) && isPlain(msg.type) && !showDate &&
                  prev.sender.id === msg.sender.id &&
                  new Date(msg.createdAt).getTime() - new Date(prev.createdAt).getTime() < GROUP_WINDOW_MS
                const groupWithNext = !!next && isPlain(next.type) && isPlain(msg.type) &&
                  new Date(next.createdAt).toDateString() === new Date(msg.createdAt).toDateString() &&
                  next.sender.id === msg.sender.id &&
                  new Date(next.createdAt).getTime() - new Date(msg.createdAt).getTime() < GROUP_WINDOW_MS
                const groupPos = groupWithPrev
                  ? (groupWithNext ? 'middle' : 'last')
                  : (groupWithNext ? 'first' : 'single')

                return (
                  <Fragment key={msg.id}>
                    {showDate && <DateSeparator label={formatDateLabel(msg.createdAt)} />}
                    <div
                      id={`msg-${msg.id}`}
                      className="transition-all duration-300 rounded-xl"
                      style={isHighlighted ? { background: 'rgba(168,85,247,0.18)' } : {}}
                    >
                      <MessageBubble
                        message={msg}
                        groupPos={groupPos}
                        partnerLastReadMessageId={chat?.partnerLastReadMessageId}
                        partnerReadAt={chat?.partnerReadAt ?? null}
                        onReply={startReply}
                        onEdit={startEdit}
                        onRetry={retrySend}
                        onJumpTo={scrollToMessage}
                        onReactError={() => {
                          setReactLimitToast(true)
                          setTimeout(() => setReactLimitToast(false), 2500)
                        }}
                      />
                    </div>
                  </Fragment>
                )
              })
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Индикатор «печатает» — отдельной плашкой над полем ввода, вне зоны
          прокрутки, чтобы он не уходил под композер и не требовал листать вниз. */}
      {typingNames.length > 0 && (
        <div className="shrink-0 px-2">
          <div className="mx-auto w-full max-w-[880px]">
            <TypingIndicator names={typingNames} />
          </div>
        </div>
      )}

      {/* Тост: запись слишком короткая */}
      {shortRecordToast && (
        <div className="glass-pop fixed bottom-28 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl text-sm text-white">
          Минимальная длина записи — 1 секунда
        </div>
      )}

      {/* Тост: превышен лимит реакций */}
      {reactLimitToast && (
        <div className="glass-pop fixed bottom-28 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl text-sm text-white">
          Можно поставить не более 3 реакций на сообщение
        </div>
      )}

      {/* ── Input bar ── */}
      <div className="shrink-0 px-2 pt-2 pb-[max(4px,calc(env(safe-area-inset-bottom)-16px))]" style={{
        background: 'rgba(255,255,255,0.04)',
        backdropFilter: 'blur(24px) saturate(140%)',
        WebkitBackdropFilter: 'blur(24px) saturate(140%)',
        borderTop: '1px solid rgba(255,255,255,0.06)',
      }}>
       <div className="mx-auto w-full max-w-[880px]">
        {/* Уведомление о муте/бане — отправка заблокирована модерацией */}
        {mutedNotice && (
          <div className="flex items-start gap-2 px-3 py-2 mb-2 rounded-xl"
            style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2"
              className="shrink-0 mt-0.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <p className="text-xs flex-1" style={{ color: '#FCD34D' }}>{mutedNotice}</p>
            <button onClick={() => setMutedNotice(null)} className="shrink-0 text-white/40 hover:text-white transition-colors">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        )}

        {/* Infy Pulse — подсказки ответов над полем ввода.
            Видны, когда последним писал собеседник, поле пустое и подсказки включены. */}
        {canSuggest && !isRecording && suggestions !== null && suggestions.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2.5 mb-2.5 px-0.5">
            {suggestions.map((s, i) => (
              <button key={i} onClick={() => applySuggestion(s)}
                className="suggest-chip text-left text-[13px] leading-snug px-3.5 py-2 rounded-2xl transition-transform active:scale-[0.98]"
                style={{ color: 'rgba(255,255,255,0.92)' }}>
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Превью ответа / редактирования */}
        {(replyTo || editing) && !isRecording && (
          <div className="flex items-center gap-2 px-3 py-1.5 mb-2 rounded-xl"
            style={{ background: 'rgba(168,85,247,0.10)', borderLeft: '3px solid var(--accent)' }}>
            <span className="shrink-0" style={{ color: '#C084FC' }}>
              {editing ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 00-4-4H4"/>
                </svg>
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold leading-tight" style={{ color: '#C084FC' }}>
                {editing ? 'Редактирование' : `Ответ ${replyTo?.sender.nickname ?? ''}`}
              </p>
              <p className="text-xs truncate" style={{ color: 'rgba(255,255,255,0.7)' }}>
                {editing
                  ? (editing.content ?? '')
                  : (replyTo?.content ?? pinnedLabel(replyTo?.type ?? 'TEXT'))}
              </p>
            </div>
            <button onClick={cancelComposerExtra} className="shrink-0 text-white/50 hover:text-white transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        )}

        {/* Превью выбранных файлов (альбом) */}
        {staged.length > 0 && !isRecording && (
          <div className="mb-2">
            <div className="flex items-center justify-between mb-1.5 px-1">
              <span className="text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>
                Выбрано {staged.length} из {MAX_ALBUM}
              </span>
              <button onClick={clearStaged} className="text-xs text-white/50 hover:text-white transition-colors">
                Очистить
              </button>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {staged.map(s => (
                <div key={s.id} className="relative shrink-0 w-20 h-20 rounded-xl overflow-hidden"
                  style={{ background: 'var(--glass-2)', border: '1px solid var(--glass-stroke)' }}>
                  {s.kind === 'image' && s.previewUrl && (
                    <img src={s.previewUrl} alt="" className="w-full h-full object-cover" />
                  )}
                  {s.kind === 'video' && s.previewUrl && (
                    <video src={s.previewUrl} className="w-full h-full object-cover" muted />
                  )}
                  {s.kind === 'document' && (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-1 px-1.5">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="1.8">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                      </svg>
                      <span className="text-[9px] text-white/70 text-center leading-tight truncate w-full">{s.file.name}</span>
                    </div>
                  )}
                  {s.kind === 'video' && (
                    <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="rgba(255,255,255,0.85)"><polygon points="8,5 19,12 8,19"/></svg>
                    </span>
                  )}
                  <button
                    onClick={() => removeStaged(s.id)}
                    className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full flex items-center justify-center bg-black/60 text-white hover:bg-black/80 transition-colors"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Запись голосового — индикатор (не зафиксировано) */}
        {isRecording && !recordLocked && (
          <div className="flex items-center gap-2 px-3 py-1.5 mb-2 rounded-xl"
            style={{
              background: 'rgba(239,68,68,0.12)',
              border: '1px solid rgba(239,68,68,0.2)',
              // Сдвигаем строку влево по мере свайпа отмены — визуальный отклик.
              transform: `translateX(-${recordCancelHint * 24}px)`,
              opacity: 1 - recordCancelHint * 0.5,
              transition: recordCancelHint === 0 ? 'transform 0.15s, opacity 0.15s' : 'none',
            }}>
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
            <span className="text-xs text-red-300 flex-1">
              Запись · {Math.floor(voiceRecorder.duration / 60)}:{String(voiceRecorder.duration % 60).padStart(2, '0')}
            </span>
            {/* Подсказка: смахните влево для отмены (на тач), плюс фиксация вверх */}
            <span className="text-xs flex items-center gap-1" style={{ color: '#f87171', opacity: 0.5 + recordCancelHint * 0.5 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
              отмена
            </span>
            <span className="text-xs flex items-center gap-1 opacity-40">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                <path d="M12 19V5M5 12l7-7 7 7"/>
              </svg>
              зафиксировать
            </span>
            <button onClick={cancelRecord} className="text-xs text-red-400 hover:text-red-200 transition-colors ml-1">
              Отмена
            </button>
          </div>
        )}

        {/* Запись голосового — зафиксировано */}
        {isRecording && recordLocked && (
          <div className="flex items-center gap-2 px-3 py-1.5 mb-2 rounded-xl"
            style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <button onClick={cancelRecord} className="text-red-400 hover:text-red-200 transition-colors shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                <path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
              </svg>
            </button>
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
            <span className="text-xs text-red-300 flex-1">
              Запись · {Math.floor(voiceRecorder.duration / 60)}:{String(voiceRecorder.duration % 60).padStart(2, '0')}
            </span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#A855F7" strokeWidth="2.5">
              <rect x="3" y="11" width="18" height="11" rx="2"/>
              <path d="M7 11V7a5 5 0 0110 0v4"/>
            </svg>
            {/* Кнопка отправки справа от дорожки */}
            <button
              onClick={sendVoiceBlob}
              disabled={sending}
              className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all disabled:opacity-40 active:scale-95 ml-1"
              style={{ background: 'var(--grad-own)', boxShadow: 'var(--glow-primary)' }}
            >
              {sending ? <Spinner size={12} /> : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2"
                  style={{ transform: 'rotate(45deg)', marginLeft: '2px' }}>
                  <line x1="22" y1="2" x2="11" y2="13"/>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              )}
            </button>
          </div>
        )}

        <div className="relative flex items-end gap-1.5">
          {/* Скрепочка — вложения */}
          {!isRecording && (
            <div className="shrink-0 pb-0.5 relative">
              <IconBtn
                onClick={() => setShowAttachMenu(v => !v)}
                disabled={sending}
                title="Вложение"
                color={showAttachMenu ? '#A855F7' : 'rgba(255,255,255,0.4)'}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66L9.41 17.41a2 2 0 01-2.83-2.83l8.49-8.48"/>
                </svg>
              </IconBtn>

              {/* Выпадающее меню */}
              {showAttachMenu && (
                <>
                  {/* Затемнение для закрытия по клику вне */}
                  <div className="fixed inset-0 z-10" onClick={() => setShowAttachMenu(false)} />
                  <div className="glass-pop absolute bottom-12 left-0 z-20 rounded-2xl overflow-hidden"
                    style={{ minWidth: 200 }}>
                    <button
                      className="flex items-center gap-3 w-full px-4 py-3 text-sm text-white hover:bg-white/5 transition-colors"
                      onClick={() => { setShowAttachMenu(false); imageInputRef.current?.click() }}
                    >
                      <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                        style={{ background: 'rgba(124,58,237,0.18)' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#A855F7" strokeWidth="2">
                          <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
                          <polyline points="21 15 16 10 5 21"/>
                        </svg>
                      </div>
                      Фото
                    </button>
                    <button
                      className="flex items-center gap-3 w-full px-4 py-3 text-sm text-white hover:bg-white/5 transition-colors"
                      onClick={() => { setShowAttachMenu(false); videoInputRef.current?.click() }}
                    >
                      <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                        style={{ background: 'rgba(167,139,250,0.15)' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2">
                          <polygon points="23,7 16,12 23,17 23,7"/><rect x="1" y="5" width="15" height="14" rx="2"/>
                        </svg>
                      </div>
                      Видео
                    </button>
                    <button
                      className="flex items-center gap-3 w-full px-4 py-3 text-sm text-white hover:bg-white/5 transition-colors"
                      onClick={() => { setShowAttachMenu(false); fileInputRef.current?.click() }}
                    >
                      <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                        style={{ background: 'rgba(251,191,36,0.15)' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2">
                          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                          <polyline points="14 2 14 8 20 8"/>
                        </svg>
                      </div>
                      Файл
                    </button>
                    <button
                      className="flex items-center gap-3 w-full px-4 py-3 text-sm text-white hover:bg-white/5 transition-colors"
                      onClick={() => { setShowAttachMenu(false); cameraInputRef.current?.click() }}
                    >
                      <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                        style={{ background: 'rgba(52,211,153,0.15)' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2">
                          <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
                          <circle cx="12" cy="13" r="4"/>
                        </svg>
                      </div>
                      Камера
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Infy Pulse — искра: подобрать варианты ответа на сообщение собеседника */}
          {!isRecording && canSuggest && suggestions === null && (
            <div className="shrink-0 pb-0.5">
              <IconBtn
                onClick={loadSuggestions}
                disabled={suggestLoading}
                title="Infy Pulse — подсказать ответ"
                color="#C084FC"
              >
                {suggestLoading ? <Spinner size={16} /> : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
                  </svg>
                )}
              </IconBtn>
            </div>
          )}

          {!isRecording && (
            <textarea
              ref={inputRef}
              rows={1}
              className="composer-input flex-1 resize-none rounded-2xl px-4 py-2.5 text-sm text-white placeholder-white/30 outline-none leading-relaxed max-h-32"
              style={{ background: 'var(--glass-2)', border: '1px solid var(--glass-stroke)', caretColor: '#A855F7' }}
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

          {/* Кнопка отправки — когда есть текст или выбранные файлы */}
          {(text.trim() || staged.length > 0) && !isRecording && (
            <button
              onClick={staged.length > 0 ? sendStaged : sendText}
              disabled={sending}
              className="shrink-0 w-11 h-11 rounded-full flex items-center justify-center transition-all disabled:opacity-40 active:scale-95"
              style={{ background: 'var(--grad-own)', boxShadow: 'var(--glow-primary)' }}
            >
              {sending ? <Spinner size={14} /> : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2"
                  style={{ transform: 'rotate(45deg)', marginLeft: '2px' }}>
                  <line x1="22" y1="2" x2="11" y2="13"/>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              )}
            </button>
          )}

          {/* Кнопка записи. При зафиксированной записи отправка — в полоске
              выше (см. блок «Запись голосового — зафиксировано»), здесь ничего. */}
          {recordLocked ? null : (text.trim() || staged.length > 0) ? null : (
            <button
              onPointerDown={onRecordPointerDown}
              disabled={sending}
              title={recordMode === 'voice' ? 'Голосовое (удержать)' : 'Кружок (удержать)'}
              className="shrink-0 w-11 h-11 rounded-full flex items-center justify-center transition-all disabled:opacity-40 select-none touch-none"
              style={{
                background: isRecording ? '#EF4444' : 'var(--grad-own)',
                boxShadow: isRecording ? '0 0 24px rgba(239,68,68,0.4)' : 'var(--glow-primary)',
                cursor: 'pointer',
              }}
            >
              {sending ? <Spinner size={14} /> : recordMode === 'voice' ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                  <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/>
                  <path d="M19 10v2a7 7 0 01-14 0v-2"/>
                  <line x1="12" y1="19" x2="12" y2="23"/>
                  <line x1="8" y1="23" x2="16" y2="23"/>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <polygon points="10,8 16,12 10,16 10,8"/>
                </svg>
              )}
            </button>
          )}
        </div>
       </div>
      </div>

      <input ref={imageInputRef} type="file" accept={ALLOWED_IMAGE} multiple className="hidden"
        onChange={e => { if (e.target.files?.length) stageFiles(e.target.files); e.target.value = '' }} />
      <input ref={videoInputRef} type="file" accept={ALLOWED_VIDEO} multiple className="hidden"
        onChange={e => { if (e.target.files?.length) stageFiles(e.target.files); e.target.value = '' }} />
      <input ref={fileInputRef} type="file" accept={ALLOWED_FILE} multiple className="hidden"
        onChange={e => { if (e.target.files?.length) stageFiles(e.target.files); e.target.value = '' }} />
      <input ref={cameraInputRef} type="file" accept="image/*,video/*" capture="environment" className="hidden"
        onChange={e => {
          const f = e.target.files?.[0]
          if (!f) { e.target.value = ''; return }
          const msgType = f.type.startsWith('image/') ? 'IMAGE' : 'VIDEO'
          sendMediaFile(f, msgType)
          e.target.value = ''
        }} />

      {showCircle && (
        <CircleRecorderModal
          onSend={sendCircle}
          onClose={() => { setShowCircle(false); setCircleAutoSend(false); setRecordLocked(false); isHoldingRef.current = false }}
          autoSend={circleAutoSend}
          locked={recordLocked}
        />
      )}

      {showPanel && partner && chatId && (
        <PartnerInfoPanel chatId={chatId} partner={partner} onClose={() => setShowPanel(false)} />
      )}

      {/* Подтверждение удаления диалога */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
          onClick={() => !deleting && setShowDeleteConfirm(false)}
        >
          <div className="glass-pop w-full max-w-sm rounded-2xl p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-center w-12 h-12 rounded-full mx-auto mb-4"
              style={{ background: 'rgba(239,68,68,0.12)' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                <path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
              </svg>
            </div>
            <h3 className="text-center text-lg font-semibold text-white">Удалить диалог?</h3>
            <p className="text-center text-sm mt-2" style={{ color: 'var(--text-mid)' }}>
              Вся переписка с {partner?.nickname ?? 'собеседником'} будет удалена безвозвратно
              у <span className="text-white/90">обоих участников</span>. Это действие нельзя отменить.
            </p>
            <div className="flex gap-3 mt-6">
              <button
                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white transition-colors hover:bg-white/5 disabled:opacity-40"
                style={{ background: 'var(--glass-2)', border: '1px solid var(--glass-stroke)' }}
                disabled={deleting}
                onClick={() => setShowDeleteConfirm(false)}
              >
                Отмена
              </button>
              <button
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center"
                style={{ background: '#dc2626' }}
                disabled={deleting}
                onClick={handleDeleteChat}
              >
                {deleting ? <Spinner size={14} /> : 'Удалить'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCalendar && chatId && (
        <CalendarPanel
          chatId={chatId}
          partnerNickname={partner?.nickname ?? 'Партнёр'}
          onClose={() => setShowCalendar(false)}
        />
      )}

      <AnimatePresence>
        {showReport && partner && (
          <ReportModal
            target={partner}
            chatId={chatId ?? undefined}
            onClose={() => setShowReport(false)}
            onSent={() => setShowReport(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAi && chatId && (
          <AiPanel
            chatId={chatId}
            onClose={() => setShowAi(false)}
            onUseReply={(t) => { setText(t); inputRef.current?.focus() }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
