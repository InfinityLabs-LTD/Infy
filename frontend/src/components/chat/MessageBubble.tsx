import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { Message } from '@/store/chat'
import { useAuthStore } from '@/store/auth'
import { chatApi } from '@/api/chat'
import { useChatStore } from '@/store/chat'
import { ImageMessage } from './ImageMessage'
import { VideoMessage } from './VideoMessage'
import { AudioMessage } from './AudioMessage'
import { CircleVideoMessage } from './CircleVideoMessage'
import { MarkdownText } from './MarkdownText'

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

export function MessageBubble({ message, showSenderName, groupPos = 'single', partnerLastReadMessageId, partnerReadAt, onReply, onEdit, onReactError, onJumpTo }: Props) {
  const myId = useAuthStore((s) => s.user?.id)
  const isOwn = message.sender.id === myId
  const { updateMessage, removeMessage } = useChatStore()

  const [showMenu, setShowMenu] = useState(false)
  const bubbleRef = useRef<HTMLDivElement>(null)
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const movedRef = useRef(false)

  const time = new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const att = message.attachments?.[0]
  const isMediaOnly = !message.content && att
  const isCircle = message.type === 'CIRCLE_VIDEO'
  const reactions = message.reactions ?? []
  const isRead = !!(partnerLastReadMessageId && message.id <= partnerLastReadMessageId)
  // Галочки теперь снаружи пузыря, на тёмном фоне: прочитано — фиолетовый акцент
  const tickColor = isRead ? '#A855F7' : 'rgba(255,255,255,0.35)'
  const isEndOfGroup = groupPos === 'last' || groupPos === 'single'

  function openMenu() { setShowMenu(true) }

  // Тап по сообщению открывает меню действий; долгое нажатие — тоже (на тач).
  function onPointerDown(e: React.PointerEvent) {
    movedRef.current = false
    if (e.pointerType === 'touch') {
      holdTimer.current = setTimeout(() => { holdTimer.current = null; openMenu() }, 450)
    }
  }

  function onPointerMove() {
    movedRef.current = true
    if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null }
  }

  // У медиа-сообщений тап оставляем самому медиа (плей/зум) — меню только по долгому нажатию
  const hasMedia = !!att

  function onPointerUp() {
    if (holdTimer.current) {
      // короткое нажатие — считаем это тапом
      clearTimeout(holdTimer.current)
      holdTimer.current = null
      if (!movedRef.current && !hasMedia) openMenu()
    }
  }

  // На десктопе открываем по обычному клику (если не было выделения текста и это не медиа)
  function onClick() {
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
      {isOwn && (
        <svg width="16" height="9" viewBox="0 0 18 10" fill="none">
          <path d="M1 5l3 3L11 1" stroke={tickColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M5 5l3 3L15 1" stroke={tickColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
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
      />
      {reactions.length > 0 && <ReactionBar reactions={reactions} myId={myId} onReact={handleReact} />}
    </div>
  ) : (
    <div className="flex flex-col gap-0.5 min-w-0" style={{ maxWidth: '78%', alignItems: isOwn ? 'flex-end' : 'flex-start' }}>
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
        {att && (
          <div className={isMediaOnly ? '' : 'mb-1.5'}>
            {message.type === 'IMAGE' && (
              <ImageMessage url={mediaUrl(att.publicUrl, att.storageKey)} width={att.width} height={att.height} />
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
      </div>
      {reactions.length > 0 && <ReactionBar reactions={reactions} myId={myId} onReact={handleReact} />}
    </div>
  )

  // ── AI-сообщения: вопрос к ИИ (AI_QUERY) и ответ ИИ (AI) ──
  // Рендерятся как сообщения (видят оба), но с явной стилизацией под Infy AI.
  if (message.type === 'AI' || message.type === 'AI_QUERY') {
    return <AiMessage message={message} isOwn={isOwn} time={time} />
  }

  return (
    <>
      <div
        ref={bubbleRef}
        className={`group flex items-end gap-1.5 ${isOwn ? 'justify-end' : 'justify-start'} ${groupPos === 'first' || groupPos === 'single' ? 'mt-3' : 'mt-0.5'} msg-appear cursor-pointer`}
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
// Вопрос пользователя к Infy AI (AI_QUERY) и ответ ассистента (AI).
// Оба видны обоим участникам; вопрос помечен как обращение к ИИ, чтобы
// собеседник не принял его за обычное сообщение.

function AiMessage({ message, isOwn, time }: { message: Message; isOwn: boolean; time: string }) {
  const isQuery = message.type === 'AI_QUERY'

  if (isQuery) {
    // Вопрос к ИИ — на стороне автора, с бейджем «Вопрос Infy AI».
    return (
      <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mt-3 msg-appear`}>
        <div className="flex flex-col gap-0.5" style={{ maxWidth: '78%', alignItems: isOwn ? 'flex-end' : 'flex-start' }}>
          <div
            className="px-3 py-2 text-sm"
            style={{
              borderRadius: isOwn ? '20px 6px 6px 20px' : '6px 20px 20px 6px',
              background: 'rgba(168,85,247,0.10)',
              border: '1px solid rgba(168,85,247,0.35)',
            }}
          >
            <div className="flex items-center gap-1.5 mb-1" style={{ color: '#C084FC' }}>
              <AiGlyph />
              <span className="text-[11px] font-semibold tracking-wide">Вопрос Infy AI</span>
            </div>
            <p className="whitespace-pre-wrap break-words leading-relaxed" style={{ color: 'rgba(255,255,255,0.92)' }}>
              {message.content}
            </p>
          </div>
          <span className="text-[11px] px-1" style={{ color: 'var(--text-low)' }}>{time}</span>
        </div>
      </div>
    )
  }

  // Ответ ИИ — пузырь Infy AI слева, с аватаркой-иконкой и markdown.
  const pending = !message.content
  return (
    <div className="flex justify-start mt-2 msg-appear">
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
            <div className="flex items-center gap-1.5 mb-1" style={{ color: '#C084FC' }}>
              <span className="text-[11px] font-semibold tracking-wide">Infy AI</span>
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
  }
  return labels[reply.type] ?? 'Вложение'
}

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
