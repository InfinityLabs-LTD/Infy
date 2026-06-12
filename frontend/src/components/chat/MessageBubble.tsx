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

export function MessageBubble({ message, showSenderName, groupPos = 'single', partnerLastReadMessageId, partnerReadAt }: Props) {
  const myId = useAuthStore((s) => s.user?.id)
  const isOwn = message.sender.id === myId
  const { updateMessage, removeMessage } = useChatStore()

  const [showMenu, setShowMenu] = useState(false)
  const bubbleRef = useRef<HTMLDivElement>(null)
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  function onPointerDown(e: React.PointerEvent) {
    if (e.pointerType === 'touch') {
      holdTimer.current = setTimeout(openMenu, 500)
    }
  }

  function onPointerUp() {
    if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null }
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
    if (message.content) navigator.clipboard.writeText(message.content).catch(() => {})
  }

  async function handleReact(emoji: string) {
    setShowMenu(false)
    try {
      const res = await chatApi.reactToMessage(message.id, emoji)
      updateMessage(res.data.data)
    } catch {}
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

  return (
    <>
      <div
        ref={bubbleRef}
        className={`group flex items-end gap-1.5 ${isOwn ? 'justify-end' : 'justify-start'} ${groupPos === 'first' || groupPos === 'single' ? 'mt-3' : 'mt-0.5'} msg-appear`}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
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
          readAt={isRead ? (partnerReadAt ?? null) : null}
          onClose={() => setShowMenu(false)}
          onReact={handleReact}
          onCopy={message.type === 'TEXT' && message.content ? handleCopy : undefined}
          onDelete={isOwn ? handleDelete : undefined}
        />,
        document.body
      )}
    </>
  )
}

// ── Context menu ──────────────────────────────────────────────

function MessageContextMenu({
  bubbleRef, isOwn, isText, readAt, onClose, onReact, onCopy, onDelete,
}: {
  bubbleRef: React.RefObject<HTMLDivElement>
  isOwn: boolean
  isText: boolean
  readAt: string | null
  onClose: () => void
  onReact: (emoji: string) => void
  onCopy?: () => void
  onDelete?: () => void
}) {
  const [showFullPicker, setShowFullPicker] = useState(false)

  const rect = bubbleRef.current?.getBoundingClientRect()
  if (!rect) return null

  const EMOJI_H = 56
  const MENU_W = 220
  const MENU_ITEM_H = 44
  const itemCount = (onCopy ? 1 : 0) + (onDelete ? 1 : 0)
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
          {onCopy && isText && (
            <CtxItem icon="📋" label="Скопировать" onPointerDown={e => { e.stopPropagation(); onCopy() }} />
          )}
          {onDelete && (
            <CtxItem icon="🗑" label="Удалить" onPointerDown={e => { e.stopPropagation(); onDelete() }} danger />
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
            onClick={() => onReact(r.emoji)}
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
