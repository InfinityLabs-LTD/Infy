import { useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Message, MessageAttachment } from '@/store/chat'
import { useAuthStore } from '@/store/auth'
import { chatApi } from '@/api/chat'
import { useChatStore } from '@/store/chat'
import { ImageMessage } from './ImageMessage'
import { VideoMessage } from './VideoMessage'
import { AudioMessage } from './AudioMessage'
import { CircleVideoMessage } from './CircleVideoMessage'
import { MarkdownText } from './MarkdownText'
import { apiBaseUrl } from '@/lib/origin'
import { TranscriptButton, AudioWithTranscript } from './TranscriptButton'
import { useSwipeReply } from '@/hooks/useSwipeReply'
import { vibrate } from '@/lib/haptics'

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥']

const EMOJI_CATEGORIES: { label: string; icon: string; emojis: string[] }[] = [
  {
    label: 'Часто используемые',
    icon: '🕐',
    emojis: ['😀','😂','🥰','😍','🤩','😎','🥳','🤔','😅','😭','😤','😡','🤯','🥺','😴','🤗','😬','🙄','😏','😒'],
  },
  {
    label: 'Смайлики',
    icon: '😀',
    emojis: [
      '😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','☺️','😚',
      '😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄',
      '😬','🤥','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','🥴','😵','🤯','🤠','🥸','😎',
      '🤓','🧐','😕','😟','🙁','☹️','😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖',
      '😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','☠️','💩','🤡','👹','👺','👻','👽',
    ],
  },
  {
    label: 'Жесты',
    icon: '👋',
    emojis: [
      '👋','🤚','🖐️','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍',
      '👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','✍️','💅','🤳','💪','🦾','🦿','🦵','🦶','👂',
      '🦻','👃','🧠','🫀','🫁','🦷','🦴','👀','👁️','👅','👄','💋','🫦',
    ],
  },
  {
    label: 'Животные',
    icon: '🐶',
    emojis: [
      '🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐻‍❄️','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐒',
      '🐔','🐧','🐦','🐤','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🐛','🦋','🐌','🐞','🐜','🦟','🦗',
      '🐢','🐍','🦎','🦖','🦕','🐙','🦑','🦐','🦞','🦀','🐡','🐟','🐠','🐬','🐳','🐋','🦈','🐊','🐅','🐆',
    ],
  },
  {
    label: 'Еда',
    icon: '🍕',
    emojis: [
      '🍎','🍊','🍋','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🍆','🥑','🥦','🥬','🥒','🌶️',
      '🫑','🧄','🧅','🥔','🍠','🥐','🥯','🍞','🥖','🥨','🧀','🥚','🍳','🧈','🥞','🧇','🥓','🥩','🍗','🍖',
      '🌭','🍔','🍟','🍕','🫓','🥪','🥙','🧆','🌮','🌯','🫔','🥗','🥘','🫕','🍝','🍜','🍲','🍛','🍣','🍱',
      '🥟','🦪','🍤','🍙','🍚','🍘','🍥','🥮','🍢','🧁','🍰','🎂','🍮','🍭','🍬','🍫','🍿','🍩','🍪','🌰',
    ],
  },
  {
    label: 'Активности',
    icon: '⚽',
    emojis: [
      '⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🪀','🏓','🏸','🏒','🥍','🏑','🏏','🪃','🥅','⛳',
      '🪁','🏹','🎣','🤿','🥊','🥋','🎽','🛹','🛼','🛷','⛸️','🥌','🎿','⛷️','🏂','🪂','🏋️','🤼','🤸','⛹️',
      '🤺','🏇','🧘','🏄','🏊','🤽','🚣','🧗','🚵','🚴','🏆','🥇','🥈','🥉','🏅','🎖️','🏵️','🎗️','🎫','🎟️',
    ],
  },
  {
    label: 'Путешествия',
    icon: '✈️',
    emojis: [
      '🚗','🚕','🚙','🚌','🚎','🏎️','🚓','🚑','🚒','🚐','🛻','🚚','🚛','🚜','🏍️','🛵','🛺','🚲','🛴','🛹',
      '🛼','🚏','🛣️','🛤️','⛽','🚨','🚥','🚦','🛑','🚧','⚓','🛟','⛵','🚤','🛥️','🛳️','⛴️','🚢','✈️','🛩️',
      '🛫','🛬','🪂','💺','🚁','🚟','🚠','🚡','🛰️','🚀','🛸','🌍','🌎','🌏','🌐','🗺️','🧭','🏔️','⛰️','🌋',
    ],
  },
  {
    label: 'Предметы',
    icon: '💡',
    emojis: [
      '⌚','📱','💻','⌨️','🖥️','🖨️','🖱️','🖲️','💽','💾','💿','📀','📷','📸','📹','🎥','📽️','🎞️','📞','☎️',
      '📟','📠','📺','📻','🧭','⏱️','⏲️','⏰','🕰️','⌛','⏳','📡','🔋','🔌','💡','🔦','🕯️','🪔','🧯','🛢️',
      '💰','💴','💵','💶','💷','💸','💳','🪙','💹','📈','📉','📊','📋','📌','📍','📎','🖇️','📏','📐','✂️',
      '🗃️','🗄️','🗑️','🔒','🔓','🔏','🔐','🔑','🗝️','🔨','🪓','⛏️','⚒️','🛠️','🗡️','⚔️','🔫','🪃','🏹','🛡️',
    ],
  },
  {
    label: 'Символы',
    icon: '❤️',
    emojis: [
      '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❤️‍🔥','❤️‍🩹','❣️','💕','💞','💓','💗','💖','💘','💝',
      '💟','☮️','✝️','☪️','🕉️','☸️','✡️','🔯','🕎','☯️','☦️','🛐','⛎','♈','♉','♊','♋','♌','♍','♎',
      '♏','♐','♑','♒','♓','🆔','⚛️','🉑','☢️','☣️','📴','📳','🈶','🈚','🈸','🈺','🈷️','✴️','🆚','💮',
      '🉐','㊙️','㊗️','🈴','🈵','🈹','🈲','🅰️','🅱️','🆎','🆑','🅾️','🆘','❌','⭕','🛑','⛔','📛','🚫',
      '✅','☑️','✔️','❎','🔃','🔄','🔙','🔚','🔛','🔜','🔝','🔰','♻️','➿','🌀','⭐','🌟','💫','✨','🎇',
    ],
  },
]

export type GroupPos = 'single' | 'first' | 'middle' | 'last'

interface Props {
  message: Message
  showSenderName?: boolean
  groupPos?: GroupPos
  partnerLastReadMessageId?: string | null
  partnerReadAt?: string | null
  onReply?: (msg: Message) => void
  onEdit?: (msg: Message) => void
  onReactError?: () => void
  onJumpTo?: (msgId: string) => void
  onRetry?: (msg: Message) => void
  onVoiceEnded?: (msgId: string) => void
}

// Каскадные радиусы группы: внешние углы 20px, примыкающие и «хвост» — 6px.
// У своих сообщений (справа) нижний правый угол всегда 6, у чужих — нижний левый.
function bubbleRadius(isOwn: boolean, pos: GroupPos): string {
  const R = '20px'
  const r = '6px'
  if (isOwn) {
    const tr = pos === 'middle' || pos === 'last' ? r : R
    return `${R} ${tr} ${r} ${R}`
  }
  const tl = pos === 'middle' || pos === 'last' ? r : R
  return `${tl} ${R} ${R} ${r}`
}

export function MessageBubble({ message, showSenderName, groupPos = 'single', partnerLastReadMessageId, partnerReadAt, onReply, onEdit, onReactError, onJumpTo, onRetry, onVoiceEnded }: Props) {
  const myId = useAuthStore((s) => s.user?.id)
  const isOwn = message.sender.id === myId
  const { updateMessage, removeMessage, updateAttachmentListened } = useChatStore()

  const handleVoiceListened = useCallback(() => {
    if (isOwn) return
    // Оптимистично убираем точку сразу — не ждём ответа сервера.
    updateAttachmentListened(message.chatId, message.id, new Date().toISOString())
    chatApi.listenVoice(message.id).then(r => {
      updateAttachmentListened(message.chatId, message.id, r.data.data.listenedAt)
    }).catch((err) => {
      console.error('[voice] listen failed:', err?.response?.data ?? err)
    })
  }, [isOwn, message.id, message.chatId, updateAttachmentListened])

  const handleVoiceEnded = useCallback(() => {
    onVoiceEnded?.(message.id)
  }, [message.id, onVoiceEnded])

  const [showMenu, setShowMenu] = useState(false)
  const bubbleRef = useRef<HTMLDivElement>(null)
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const holdStart = useRef<{ x: number; y: number } | null>(null)
  const movedRef = useRef(false)

  function cancelHold() {
    if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null }
    holdStart.current = null
  }

  // Свайп для ответа: свои сообщения тянем влево, чужие — вправо.
  const swipeDir = isOwn ? -1 : 1
  const swipe = useSwipeReply(
    swipeDir,
    () => onReply?.(message),
    cancelHold,  // распознан свайп — снимаем hold-таймер меню
  )

  const time = new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const att = message.attachments?.[0]
  const isAudio = message.type === 'AUDIO'
  // Голосовое всегда в пузыре с внутренними отступами — дорожка не должна
  // упираться в скруглённый край (в отличие от фото/видео «на всю ширину»).
  const isMediaOnly = !message.content && att && !isAudio
  const isCircle = message.type === 'CIRCLE_VIDEO'
  const reactions = message.reactions ?? []
  const isRead = !!(partnerLastReadMessageId && message.id <= partnerLastReadMessageId)
  // Галочки теперь снаружи пузыря, на тёмном фоне: прочитано — фиолетовый акцент
  const tickColor = isRead ? '#A855F7' : 'rgba(255,255,255,0.35)'
  const isEndOfGroup = groupPos === 'last' || groupPos === 'single'

  function openMenu() { setShowMenu(true) }

  // Долгое нажатие (удержание) открывает меню на тач-устройствах + виброотклик.
  function openMenuFromHold() {
    holdTimer.current = null
    holdStart.current = null
    // Виброотклик при появлении меню (если поддерживается)
    vibrate(15)
    openMenu()
  }

  // У медиа-сообщений тап оставляем самому медиа (плей/зум) — меню только по долгому нажатию
  const hasMedia = !!att

  // На тач-устройствах меню открывается только по удержанию — короткий тап игнорируется.
  // Сам свайп-жест обрабатывает хук useSwipeReply; здесь — только hold-таймер меню.
  function onPointerDown(e: React.PointerEvent) {
    movedRef.current = false
    swipe.handlers.onPointerDown(e)
    if (e.pointerType === 'touch') {
      holdStart.current = { x: e.clientX, y: e.clientY }
      if (holdTimer.current) clearTimeout(holdTimer.current)
      holdTimer.current = setTimeout(openMenuFromHold, 500)
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    movedRef.current = true
    // Hold-таймер снимаем только при заметном движении пальца (>10px), иначе
    // микро-дрожание во время удержания отменяло бы меню и его виброотклик.
    if (holdStart.current) {
      const dx = e.clientX - holdStart.current.x
      const dy = e.clientY - holdStart.current.y
      if (Math.hypot(dx, dy) > 10) cancelHold()
    }
    swipe.handlers.onPointerMove(e)
  }

  function onPointerUp(e: React.PointerEvent) {
    // Палец отпустили раньше срабатывания таймера — это короткий тап, меню не открываем
    cancelHold()
    swipe.handlers.onPointerUp(e)
  }

  // На десктопе открываем по обычному клику (если не было выделения текста и это не медиа)
  function onClick() {
    // Неотправленное сообщение — тап повторяет отправку.
    if (message.failed) { onRetry?.(message); return }
    if (hasMedia) return
    if (window.matchMedia('(pointer: fine)').matches && !window.getSelection()?.toString()) {
      openMenu()
    }
  }

  function onContextMenu(e: React.MouseEvent) {
    e.preventDefault()
    openMenu()
  }

  async function handleDelete() {
    setShowMenu(false)
    // Оптимистичное (ещё не отправленное) сообщение — удаляем только локально.
    if (message.pending || message.failed || message.id.startsWith('temp-')) {
      removeMessage(message.chatId, message.id)
      return
    }
    try {
      await chatApi.deleteMessage(message.id)
      removeMessage(message.chatId, message.id)
    } catch {}
  }

  function handleCopy() {
    setShowMenu(false)
    if (message.content) copyText(message.content)
  }

  async function handleReact(emoji: string) {
    setShowMenu(false)
    try {
      const res = await chatApi.reactToMessage(message.id, emoji)
      updateMessage(res.data.data)
    } catch (err) {
      // 409 — превышен лимит реакций
      if ((err as { response?: { status?: number } })?.response?.status === 409) onReactError?.()
    }
  }

  async function handlePin() {
    setShowMenu(false)
    try {
      const res = await chatApi.pinMessage(message.id)
      updateMessage(res.data.data)
    } catch {}
  }

  function handleReply() {
    setShowMenu(false)
    onReply?.(message)
  }

  function handleEdit() {
    setShowMenu(false)
    onEdit?.(message)
  }

  // Мета — время, «изм.» и галочки — живёт снаружи пузыря.
  // Видна у последнего сообщения группы, у остальных проявляется на hover.
  const meta = (
    <span className={`flex items-center gap-1 pb-0.5 shrink-0 select-none ${isEndOfGroup ? '' : 'opacity-0 group-hover:opacity-100 transition-opacity duration-150'}`}>
      {message.editedAt && (
        <span className="text-[10px] italic" style={{ color: 'var(--text-low)' }}>изм.</span>
      )}
      <span className="text-[11px]" style={{ color: 'var(--text-low)' }}>{time}</span>
      {isOwn && message.failed ? (
        // Отправка не удалась — тап по значку повторяет отправку
        <button
          onClick={(e) => { e.stopPropagation(); onRetry?.(message) }}
          title="Не отправлено — нажмите, чтобы повторить"
          className="flex items-center justify-center active:scale-90 transition-transform"
          style={{ color: '#f87171' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
            strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </button>
      ) : isOwn && message.pending ? (
        // Загружается в фоне — значок таймера (как в Telegram)
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/>
        </svg>
      ) : isOwn ? (
        <svg width="16" height="9" viewBox="0 0 18 10" fill="none">
          <path d="M1 5l3 3L11 1" stroke={tickColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M5 5l3 3L15 1" stroke={tickColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ) : null}
    </span>
  )

  const reactBtn = (
    <button
      onClick={openMenu}
      title="Реакция"
      className="hidden md:flex w-7 h-7 mb-0.5 rounded-full items-center justify-center shrink-0 opacity-0 group-hover:opacity-100 transition-all duration-150 hover:bg-white/10 active:scale-90"
      style={{ color: 'rgba(255,255,255,0.45)' }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10"/>
        <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
        <line x1="9" y1="9" x2="9.01" y2="9"/>
        <line x1="15" y1="9" x2="15.01" y2="9"/>
      </svg>
    </button>
  )

  const bubbleContent = isCircle && att ? (
    <div className="flex flex-col gap-0.5" style={{ alignItems: isOwn ? 'flex-end' : 'flex-start' }}>
      <CircleVideoMessage
        url={mediaUrl(att.publicUrl, att.storageKey)}
        thumbnailUrl={att.thumbnailKey ? mediaUrl(null, att.thumbnailKey) : null}
        durationMs={att.durationMs}
        listenedAt={att.listenedAt}
        onListened={handleVoiceListened}
        onEnded={handleVoiceEnded}
      />
      <TranscriptButton message={message} isOwn={isOwn} />
      {reactions.length > 0 && <ReactionBar reactions={reactions} myId={myId} onReact={handleReact} />}
    </div>
  ) : (
    <div className="flex flex-col gap-0.5 min-w-0" style={{ maxWidth: '78%', width: isAudio ? 260 : undefined, alignItems: isOwn ? 'flex-end' : 'flex-start' }}>
      <div
        className={`text-sm overflow-hidden w-full ${isMediaOnly ? '' : 'px-3 py-2'} ${isOwn ? 'bubble-own' : 'bubble-other'}`}
        style={{ borderRadius: bubbleRadius(isOwn, groupPos) }}
      >
        {showSenderName && !isOwn && (groupPos === 'first' || groupPos === 'single') && (
          <p className="text-xs font-semibold mb-0.5 px-3 pt-2" style={{ color: '#C084FC' }}>
            {message.sender.nickname}
          </p>
        )}
        {message.replyTo && (
          <button
            onClick={(e) => { e.stopPropagation(); onJumpTo?.(message.replyTo!.id) }}
            className="flex flex-col items-start text-left w-full mb-1.5 pl-2 pr-2 py-1 rounded-lg"
            style={{ background: 'rgba(0,0,0,0.18)', borderLeft: '2px solid var(--accent)' }}
          >
            <span className="text-[11px] font-semibold leading-tight" style={{ color: '#C084FC' }}>
              {message.replyTo.sender.nickname}
            </span>
            <span className="text-[12px] truncate max-w-full opacity-80" style={{ color: 'rgba(255,255,255,0.75)' }}>
              {replyPreviewText(message.replyTo)}
            </span>
          </button>
        )}
        {message.type === 'ALBUM' && message.attachments && message.attachments.length > 0 && (
          <div className={isMediaOnly ? '' : 'mb-1.5'}>
            <AlbumGrid attachments={message.attachments} />
          </div>
        )}
        {att && message.type !== 'ALBUM' && (
          <div className={isMediaOnly ? '' : 'mb-1.5'}>
            {message.type === 'IMAGE' && (
              <ImageMessage att={att} />
            )}
            {message.type === 'VIDEO' && (
              <VideoMessage
                url={mediaUrl(att.publicUrl, att.storageKey)}
                thumbnailUrl={att.thumbnailKey ? mediaUrl(null, att.thumbnailKey) : null}
                durationMs={att.durationMs}
              />
            )}
            {message.type === 'AUDIO' && (
              <AudioWithTranscript message={message} isOwn={isOwn}>
                <AudioMessage
                  url={mediaUrl(att.publicUrl, att.storageKey)}
                  durationMs={att.durationMs}
                  waveform={att.waveform as number[] | null}
                  isOwn={isOwn}
                  listenedAt={att.listenedAt}
                  onListened={handleVoiceListened}
                  onEnded={handleVoiceEnded}
                />
              </AudioWithTranscript>
            )}
            {message.type === 'FILE' && (
              <FileAttachment att={att} />
            )}
          </div>
        )}
        {message.content && (
          <p className={`whitespace-pre-wrap break-words leading-relaxed ${isMediaOnly ? 'px-3 pb-2' : ''}`}>
            {message.content}
          </p>
        )}
      </div>
      {reactions.length > 0 && <ReactionBar reactions={reactions} myId={myId} onReact={handleReact} />}
    </div>
  )

  // ── AI-сообщения: вопрос к ИИ (AI_QUERY) и ответ ИИ (AI) ──
  // Рендерятся как сообщения (видят оба), но с явной стилизацией под Infy Pulse.
  // На них тоже можно отвечать (свайпом) — это комментирование, на вызов ИИ не влияет.
  if (message.type === 'AI' || message.type === 'AI_QUERY') {
    return <AiMessage message={message} isOwn={isOwn} time={time} onReply={onReply} onJumpTo={onJumpTo} />
  }

  const swipeProgress = swipe.progress

  return (
    <>
      <div className={`relative msg-appear ${groupPos === 'first' || groupPos === 'single' ? 'mt-3' : 'mt-0.5'}`}>
        {/* Иконка ответа, проявляющаяся при свайпе */}
        <div
          className="absolute top-0 bottom-0 flex items-center pointer-events-none"
          style={{
            [isOwn ? 'right' : 'left']: 8,
            opacity: swipeProgress,
            transform: `scale(${0.6 + swipeProgress * 0.4})`,
          }}
        >
          <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'var(--accent)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 14 4 9 9 4" />
              <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
            </svg>
          </div>
        </div>
        <div
          ref={bubbleRef}
          className={`group flex items-end gap-1.5 select-none ${isOwn ? 'justify-end' : 'justify-start'} cursor-pointer`}
          style={{
            ...swipe.transformStyle,
            WebkitUserSelect: 'none',
            WebkitTouchCallout: 'none',
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onClick={onClick}
          onContextMenu={onContextMenu}
        >
          {isOwn && <>{reactBtn}{meta}</>}
          {bubbleContent}
          {!isOwn && <>{meta}{reactBtn}</>}
        </div>
      </div>

      {showMenu && createPortal(
        <MessageContextMenu
          bubbleRef={bubbleRef}
          isOwn={isOwn}
          isText={message.type === 'TEXT' && !!message.content}
          isPinned={!!message.pinnedAt}
          readAt={isOwn && isRead ? (partnerReadAt ?? null) : null}
          onClose={() => setShowMenu(false)}
          onReact={handleReact}
          onReply={onReply ? handleReply : undefined}
          onCopy={message.type === 'TEXT' && message.content ? handleCopy : undefined}
          onEdit={isOwn && message.type === 'TEXT' && onEdit ? handleEdit : undefined}
          onPin={handlePin}
          onDelete={isOwn ? handleDelete : undefined}
        />,
        document.body
      )}
    </>
  )
}

// ── AI-сообщения ──────────────────────────────────────────────
// Вопрос пользователя к Infy Pulse (AI_QUERY) и ответ ассистента (AI).
// Оба видны обоим участникам; вопрос помечен как обращение к ИИ, чтобы
// собеседник не принял его за обычное сообщение.

function AiMessage({ message, isOwn, time, onReply, onJumpTo }: {
  message: Message
  isOwn: boolean
  time: string
  onReply?: (msg: Message) => void
  onJumpTo?: (msgId: string) => void
}) {
  const isQuery = message.type === 'AI_QUERY'
  // Вопрос к ИИ висит на стороне автора, ответ ИИ — всегда слева.
  const swipeDir = isQuery ? (isOwn ? -1 : 1) : 1
  const swipe = useSwipeReply(swipeDir, () => onReply?.(message))

  // Превью цитируемого сообщения (если на это AI-сообщение отвечают через replyTo, оно
  // показывается в обычном пузыре; здесь — если уже сам AI-вопрос был ответом).
  const replyPreview = message.replyTo && (
    <button
      onClick={(e) => { e.stopPropagation(); onJumpTo?.(message.replyTo!.id) }}
      className="flex flex-col items-start text-left w-full mb-1.5 pl-2 pr-2 py-1 rounded-lg"
      style={{ background: 'rgba(0,0,0,0.18)', borderLeft: '2px solid var(--accent)' }}
    >
      <span className="text-[11px] font-semibold leading-tight" style={{ color: '#C084FC' }}>
        {message.replyTo.sender.nickname}
      </span>
      <span className="text-[12px] truncate max-w-full opacity-80" style={{ color: 'rgba(255,255,255,0.75)' }}>
        {replyPreviewText(message.replyTo)}
      </span>
    </button>
  )

  // Индикатор «ответить», проявляющийся при свайпе
  const replyHint = (
    <div
      className="absolute top-0 bottom-0 flex items-center pointer-events-none"
      style={{
        [swipeDir < 0 ? 'right' : 'left']: 8,
        opacity: swipe.progress,
        transform: `scale(${0.6 + swipe.progress * 0.4})`,
      }}
    >
      <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'var(--accent)' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 14 4 9 9 4" />
          <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
        </svg>
      </div>
    </div>
  )

  if (isQuery) {
    // Вопрос к ИИ — на стороне автора, с бейджем «Вопрос Infy Pulse».
    return (
      <div className="relative msg-appear mt-3">
        {replyHint}
        <div
          className={`flex ${isOwn ? 'justify-end' : 'justify-start'} select-none`}
          style={swipe.transformStyle}
          {...swipe.handlers}
          onPointerCancel={swipe.handlers.onPointerUp}
        >
          <div className="flex flex-col gap-0.5" style={{ maxWidth: '78%', alignItems: isOwn ? 'flex-end' : 'flex-start' }}>
            <div
              className="px-3 py-2 text-sm"
              style={{
                borderRadius: isOwn ? '20px 6px 6px 20px' : '6px 20px 20px 6px',
                background: 'rgba(168,85,247,0.10)',
                border: '1px solid rgba(168,85,247,0.35)',
              }}
            >
              {replyPreview}
              <div className="flex items-center gap-1.5 mb-1" style={{ color: '#C084FC' }}>
                <AiGlyph />
                <span className="text-[11px] font-semibold tracking-wide">Вопрос Infy Pulse</span>
              </div>
              <p className="whitespace-pre-wrap break-words leading-relaxed" style={{ color: 'rgba(255,255,255,0.92)' }}>
                {message.content}
              </p>
            </div>
            <span className="text-[11px] px-1" style={{ color: 'var(--text-low)' }}>{time}</span>
          </div>
        </div>
      </div>
    )
  }

  // Ответ ИИ — пузырь Infy Pulse слева, с аватаркой-иконкой и markdown.
  const pending = !message.content
  return (
    <div className="relative msg-appear mt-2">
      {replyHint}
      <div
        className="flex justify-start select-none"
        style={swipe.transformStyle}
        {...swipe.handlers}
        onPointerCancel={swipe.handlers.onPointerUp}
      >
        <div className="flex items-end gap-2" style={{ maxWidth: '85%' }}>
          <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mb-0.5"
            style={{ background: 'linear-gradient(135deg, #A855F7, #7C3AED)' }}>
            <AiGlyph color="white" />
          </div>
          <div className="flex flex-col gap-0.5 min-w-0">
            <div
              className="px-3 py-2 text-sm w-full overflow-hidden"
              style={{
                borderRadius: '6px 18px 18px 18px',
                background: 'var(--glass-2, rgba(255,255,255,0.06))',
                border: '1px solid rgba(168,85,247,0.25)',
              }}
            >
              {replyPreview}
              <div className="flex items-center gap-1.5 mb-1" style={{ color: '#C084FC' }}>
                <span className="text-[11px] font-semibold tracking-wide">Infy Pulse</span>
              </div>
              {pending ? (
                <TypingDots />
              ) : (
                <div className="text-sm" style={{ color: 'rgba(255,255,255,0.92)' }}>
                  <MarkdownText text={message.content ?? ''} />
                </div>
              )}
            </div>
            <span className="text-[11px] px-1" style={{ color: 'var(--text-low)' }}>{time}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function AiGlyph({ color = '#C084FC' }: { color?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l1.6 4.6L18 8l-4.4 1.4L12 14l-1.6-4.6L6 8l4.4-1.4z" />
      <circle cx="18" cy="17" r="2.2" />
    </svg>
  )
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-0.5">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="typing-dot w-1.5 h-1.5 rounded-full"
          style={{ background: '#C084FC' }}
        />
      ))}
    </div>
  )
}

// ── Context menu ──────────────────────────────────────────────

function MessageContextMenu({
  bubbleRef, isOwn, isText, isPinned, readAt, onClose, onReact, onReply, onCopy, onEdit, onPin, onDelete,
}: {
  bubbleRef: React.RefObject<HTMLDivElement>
  isOwn: boolean
  isText: boolean
  isPinned: boolean
  readAt: string | null
  onClose: () => void
  onReact: (emoji: string) => void
  onReply?: () => void
  onCopy?: () => void
  onEdit?: () => void
  onPin?: () => void
  onDelete?: () => void
}) {
  const [showFullPicker, setShowFullPicker] = useState(false)

  const rect = bubbleRef.current?.getBoundingClientRect()
  if (!rect) return null

  const EMOJI_H = 56
  const MENU_W = 220
  const MENU_ITEM_H = 44
  const itemCount =
    (onReply ? 1 : 0) + (onCopy ? 1 : 0) + (onEdit ? 1 : 0) + (onPin ? 1 : 0) + (onDelete ? 1 : 0)
  const MENU_H = itemCount * MENU_ITEM_H + (readAt ? 36 : 0)

  const viewW = window.innerWidth
  const viewH = window.innerHeight

  let menuLeft = isOwn ? rect.right - MENU_W : rect.left
  menuLeft = Math.max(8, Math.min(menuLeft, viewW - MENU_W - 8))

  let menuTop = rect.bottom + 8
  const totalH = EMOJI_H + (itemCount > 0 || readAt ? MENU_H + 4 : 0)
  if (menuTop + totalH > viewH - 8) {
    menuTop = rect.top - totalH - 8
  }
  if (menuTop < 8) menuTop = 8

  const readLabel = readAt
    ? `Прочитано ${new Date(readAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
    : null

  if (showFullPicker) {
    return createPortal(
      <FullEmojiPicker onSelect={onReact} onClose={onClose} />,
      document.body
    )
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(8,11,22,0.55)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
      />

      {/* Emoji bar + expand button */}
      <motion.div
        initial={{ opacity: 0, scale: 0.85, y: 6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 480, damping: 30 }}
        className="glass-pop fixed z-50 flex items-center gap-0.5 px-2 py-1.5 rounded-2xl"
        style={{ left: menuLeft, top: menuTop, transformOrigin: isOwn ? 'top right' : 'top left' }}
      >
        {QUICK_EMOJIS.map((emoji, i) => (
          <button
            key={emoji}
            onPointerDown={e => { e.stopPropagation(); onReact(emoji) }}
            className="pop-in text-2xl leading-none w-9 h-9 flex items-center justify-center rounded-xl transition-colors hover:bg-white/10 active:scale-90"
            style={{ animationDelay: `${i * 30}ms` }}
          >
            {emoji}
          </button>
        ))}
        {/* Кнопка расширенного пикера */}
        <button
          onPointerDown={e => { e.stopPropagation(); setShowFullPicker(true) }}
          className="w-9 h-9 flex items-center justify-center rounded-xl transition-all hover:bg-white/10 active:scale-90 ml-0.5"
          style={{ color: 'rgba(255,255,255,0.5)', fontSize: 20 }}
          title="Все эмодзи"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
            <line x1="9" y1="9" x2="9.01" y2="9"/>
            <line x1="15" y1="9" x2="15.01" y2="9"/>
          </svg>
        </button>
      </motion.div>

      {/* Action list */}
      {(itemCount > 0 || readLabel) && (
        <motion.div
          initial={{ opacity: 0, y: -6, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 480, damping: 32, delay: 0.04 }}
          className="glass-pop fixed z-50 rounded-2xl overflow-hidden"
          style={{ left: menuLeft, top: menuTop + EMOJI_H + 4, width: MENU_W, transformOrigin: 'top center' }}
        >
          {readLabel && (
            <div className="px-4 py-2 text-xs" style={{ color: 'var(--text-low)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              {readLabel}
            </div>
          )}
          {onReply && (
            <CtxItem icon="↩️" label="Ответить" onPointerDown={e => { e.stopPropagation(); onReply() }} />
          )}
          {onCopy && isText && (
            <CtxItem icon="📋" label="Скопировать" onPointerDown={e => { e.stopPropagation(); onCopy() }} />
          )}
          {onEdit && (
            <CtxItem icon="✏️" label="Изменить" onPointerDown={e => { e.stopPropagation(); onEdit() }} />
          )}
          {onPin && (
            <CtxItem icon="📌" label={isPinned ? 'Открепить' : 'Закрепить'} onPointerDown={e => { e.stopPropagation(); onPin() }} />
          )}
          {onDelete && (
            <CtxItem icon="🗑" label="Удалить для всех" onPointerDown={e => { e.stopPropagation(); onDelete() }} danger />
          )}
        </motion.div>
      )}
    </>
  )
}

function CtxItem({ icon, label, onPointerDown, danger }: {
  icon: string
  label: string
  onPointerDown: (e: React.PointerEvent) => void
  danger?: boolean
}) {
  return (
    <button
      onPointerDown={onPointerDown}
      className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left active:bg-white/10"
      style={{ color: danger ? '#EF4444' : 'rgba(255,255,255,0.85)' }}
    >
      <span>{icon}</span>
      {label}
    </button>
  )
}

// ── Full emoji picker ─────────────────────────────────────────

function FullEmojiPicker({ onSelect, onClose }: { onSelect: (emoji: string) => void; onClose: () => void }) {
  const [activeCategory, setActiveCategory] = useState(0)
  const [search, setSearch] = useState('')

  const filteredEmojis = search.trim()
    ? EMOJI_CATEGORIES.flatMap(c => c.emojis).filter((e, i, arr) => arr.indexOf(e) === i)
    : null

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-end" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)' }}>
      {/* Backdrop close */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Panel — макс 480px на десктопе, полная ширина на мобильном */}
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        className="glass-pop relative shrink-0 rounded-t-3xl flex flex-col w-full"
        style={{ maxHeight: '60vh', height: '60vh', maxWidth: 480 }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-2.5 pb-1">
          <div className="w-8 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.15)' }} />
        </div>

        {/* Search */}
        <div className="px-3 pb-1.5">
          <input
            autoFocus
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Поиск эмодзи…"
            className="w-full rounded-xl px-3 py-1.5 text-sm text-white outline-none placeholder-white/30"
            style={{ background: 'var(--glass-2)', border: '1px solid var(--glass-stroke)' }}
          />
        </div>

        {/* Category tabs */}
        {!search.trim() && (
          <div className="flex gap-0.5 px-2 pb-1 overflow-x-auto no-scrollbar shrink-0">
            {EMOJI_CATEGORIES.map((cat, i) => (
              <button
                key={i}
                onClick={() => setActiveCategory(i)}
                className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-lg transition-all"
                style={{ background: activeCategory === i ? 'rgba(168,85,247,0.25)' : 'transparent' }}
              >
                {cat.icon}
              </button>
            ))}
          </div>
        )}

        {/* Emoji grid */}
        <div className="flex-1 overflow-y-auto px-2 pb-3">
          {search.trim() ? (
            <>
              <p className="text-xs px-1 py-1" style={{ color: 'var(--text-low)' }}>Результаты поиска</p>
              <div className="grid" style={{ gridTemplateColumns: 'repeat(9, 1fr)', gap: 2 }}>
                {EMOJI_CATEGORIES.flatMap(c => c.emojis)
                  .filter((e, i, arr) => arr.indexOf(e) === i)
                  .map(emoji => (
                    <EmojiBtn key={emoji} emoji={emoji} onSelect={onSelect} />
                  ))}
              </div>
              {filteredEmojis?.length === 0 && (
                <p className="text-center text-sm py-8" style={{ color: 'var(--text-low)' }}>Ничего не найдено</p>
              )}
            </>
          ) : (
            <>
              <p className="text-xs px-1 py-1 font-medium" style={{ color: 'var(--text-low)' }}>
                {EMOJI_CATEGORIES[activeCategory].label}
              </p>
              <div className="grid" style={{ gridTemplateColumns: 'repeat(9, 1fr)', gap: 2 }}>
                {EMOJI_CATEGORIES[activeCategory].emojis.map(emoji => (
                  <EmojiBtn key={emoji} emoji={emoji} onSelect={onSelect} />
                ))}
              </div>
            </>
          )}
        </div>
      </motion.div>
    </div>
  )
}

function EmojiBtn({ emoji, onSelect }: { emoji: string; onSelect: (e: string) => void }) {
  return (
    <button
      onPointerDown={e => { e.preventDefault(); onSelect(emoji) }}
      className="w-full aspect-square flex items-center justify-center rounded-lg transition-all active:scale-90 hover:bg-white/10"
      style={{ fontSize: 22 }}
    >
      {emoji}
    </button>
  )
}

// ── Reaction bar ──────────────────────────────────────────────

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
            onClick={(e) => { e.stopPropagation(); onReact(r.emoji) }}
            className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-all active:scale-95"
            style={{
              background: reacted ? 'rgba(168,85,247,0.25)' : 'rgba(255,255,255,0.08)',
              border: reacted ? '1px solid rgba(168,85,247,0.55)' : '1px solid rgba(255,255,255,0.1)',
              color: 'white',
            }}
          >
            <span>{r.emoji}</span>
            <span style={{ color: reacted ? '#C084FC' : 'rgba(255,255,255,0.6)' }}>{r.count}</span>
          </button>
        )
      })}
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────

// Копирование текста. Clipboard API доступен только в защищённом контексте
// (HTTPS/localhost); на обычном HTTP падаем в execCommand-фолбэк.
function copyText(text: string) {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).catch(() => fallbackCopy(text))
  } else {
    fallbackCopy(text)
  }
}

function fallbackCopy(text: string) {
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.position = 'fixed'
  ta.style.left = '-9999px'
  ta.setAttribute('readonly', '')
  document.body.appendChild(ta)
  ta.select()
  try { document.execCommand('copy') } catch { /* ignore */ }
  document.body.removeChild(ta)
}

function replyPreviewText(reply: NonNullable<Message['replyTo']>): string {
  if (reply.deleted) return 'Сообщение удалено'
  if (reply.content) return reply.content
  const labels: Record<string, string> = {
    IMAGE: '🖼 Фото', VIDEO: '🎥 Видео', AUDIO: '🎤 Голосовое', CIRCLE_VIDEO: '⭕ Кружок',
    FILE: '📎 Файл', ALBUM: '🖼 Альбом',
  }
  return labels[reply.type] ?? 'Вложение'
}

export function mediaUrl(publicUrl: string | null | undefined, storageKey: string): string {
  if (publicUrl && !publicUrl.includes('minio:') && !publicUrl.includes('localhost:9000')) {
    if (publicUrl.startsWith('/')) return withToken(publicUrl)
    return publicUrl
  }
  const apiUrl = apiBaseUrl()
  const encoded = btoa(storageKey).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
  return withToken(`${apiUrl}/media/${encoded}`)
}

function withToken(url: string): string {
  const token = useAuthStore.getState().accessToken
  if (!token) return url
  return `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`
}

function attKind(a: MessageAttachment): 'image' | 'video' | 'document' {
  if (a.mimeType.startsWith('image/')) return 'image'
  if (a.mimeType.startsWith('video/')) return 'video'
  return 'document'
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`
}

// ── Альбом: сетка вложений (фото/видео/документы) в одном сообщении ──
function AlbumGrid({ attachments }: { attachments: MessageAttachment[] }) {
  const media = attachments.filter(a => attKind(a) !== 'document')
  const docs = attachments.filter(a => attKind(a) === 'document')
  const [lightbox, setLightbox] = useState<number | null>(null)

  const n = media.length
  const cols = n === 1 ? 1 : n === 2 ? 2 : n <= 4 ? 2 : 3

  return (
    <div className="flex flex-col gap-1.5" style={{ width: 260, maxWidth: '100%' }}>
      {n > 0 && (
        <div className="grid gap-0.5 rounded-xl overflow-hidden" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {media.map((a, i) => {
            const kind = attKind(a)
            const thumb = a.thumbnailKey ? mediaUrl(null, a.thumbnailKey) : mediaUrl(a.publicUrl, a.storageKey)
            // Последняя ячейка в неполном ряду из одного элемента растягивается
            const span = n === 3 && i === 0 ? 'col-span-2 row-span-2' : ''
            return (
              <button
                key={a.id}
                onClick={(e) => { e.stopPropagation(); setLightbox(i) }}
                className={`relative overflow-hidden bg-black/20 ${span}`}
                style={{ aspectRatio: n === 1 ? undefined : '1 / 1', minHeight: n === 1 ? undefined : 0 }}
              >
                <img src={thumb} alt="" className="w-full h-full object-cover" loading="lazy"
                  style={n === 1 ? { maxHeight: 320, width: '100%', objectFit: 'cover' } : undefined} />
                {kind === 'video' && (
                  <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="w-9 h-9 rounded-full bg-black/50 flex items-center justify-center">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><polygon points="8,5 19,12 8,19"/></svg>
                    </span>
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
      {docs.map(a => <FileAttachment key={a.id} att={a} />)}

      {createPortal(
        <AnimatePresence>
          {lightbox !== null && (
            <MediaLightbox items={media} index={lightbox} onClose={() => setLightbox(null)} onIndex={setLightbox} />
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  )
}

// ── Одиночный документ/файл ──
function FileAttachment({ att }: { att: MessageAttachment }) {
  const url = mediaUrl(att.publicUrl, att.storageKey)
  const name = att.fileName ?? 'Файл'
  return (
    <a
      href={url}
      download={name}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-white/5 transition-colors"
      style={{ minWidth: 200, maxWidth: 280 }}
    >
      <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'rgba(251,191,36,0.18)' }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="1.8">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm truncate text-white">{name}</p>
        {att.sizeBytes ? <p className="text-[11px]" style={{ color: 'var(--text-low)' }}>{formatBytes(att.sizeBytes)}</p> : null}
      </div>
    </a>
  )
}

// ── Лайтбокс на почти весь экран с навигацией по альбому ──
// Используется и альбомом (несколько вложений), и одиночным фото/видео.
export function MediaLightbox({ items, index, onClose, onIndex }: {
  items: MessageAttachment[]
  index: number
  onClose: () => void
  onIndex: (i: number) => void
}) {
  const a = items[index]
  if (!a) return null
  const url = mediaUrl(a.publicUrl, a.storageKey)
  const kind = attKind(a)
  const hasPrev = index > 0
  const hasNext = index < items.length - 1

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[60] bg-black/95 flex flex-col"
      onClick={onClose}
    >
      {/* Верхняя панель с крестиком (учитываем вырез/safe-area сверху) */}
      <div
        className="flex items-center justify-between px-4 py-3 shrink-0"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-sm text-white/70 select-none">{items.length > 1 ? `${index + 1} / ${items.length}` : ''}</span>
        <button
          onClick={onClose}
          className="w-11 h-11 rounded-full flex items-center justify-center text-white bg-white/10 hover:bg-white/20 active:scale-90 transition-all"
          title="Закрыть"
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {/* Контент */}
      <div className="flex-1 flex items-center justify-center px-2 pb-4 min-h-0 relative" onClick={(e) => e.stopPropagation()}>
        {kind === 'video' ? (
          <video src={url} controls autoPlay className="max-w-full max-h-full rounded-lg" />
        ) : (
          <img src={url} alt="" className="max-w-full max-h-full object-contain rounded-lg" />
        )}

        {hasPrev && (
          <button
            onClick={() => onIndex(index - 1)}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full flex items-center justify-center bg-black/40 text-white hover:bg-black/60 transition-colors"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
        )}
        {hasNext && (
          <button
            onClick={() => onIndex(index + 1)}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full flex items-center justify-center bg-black/40 text-white hover:bg-black/60 transition-colors"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        )}
      </div>
    </motion.div>
  )
}
