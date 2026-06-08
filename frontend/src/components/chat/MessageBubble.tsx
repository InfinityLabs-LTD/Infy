import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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

interface Props {
  message: Message
  showSenderName?: boolean
  partnerLastReadMessageId?: string | null
  partnerReadAt?: string | null
}

export function MessageBubble({ message, showSenderName, partnerLastReadMessageId, partnerReadAt }: Props) {
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
  const tickColor = isRead ? '#2aabee' : 'rgba(255,255,255,0.55)'

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

  const bubbleContent = isCircle && att ? (
    <div className="flex flex-col items-end gap-0.5">
      <CircleVideoMessage
        url={mediaUrl(att.publicUrl, att.storageKey)}
        thumbnailUrl={att.thumbnailKey ? mediaUrl(null, att.thumbnailKey) : null}
        durationMs={att.durationMs}
      />
      {reactions.length > 0 && <ReactionBar reactions={reactions} myId={myId} onReact={handleReact} />}
      <span className="text-[11px] px-1" style={{ color: '#6c8998' }}>{time}</span>
    </div>
  ) : (
    <div className="flex flex-col items-end gap-0.5" style={{ maxWidth: '78%' }}>
      <div className={`text-sm overflow-hidden w-full ${isMediaOnly ? '' : 'px-3 py-2'} ${isOwn ? 'bubble-own' : 'bubble-other'}`}>
        {showSenderName && !isOwn && (
          <p className="text-xs font-semibold mb-0.5 px-3 pt-2" style={{ color: '#2aabee' }}>
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
        <div className={`flex items-center justify-end gap-1 mt-0.5 ${isMediaOnly ? 'px-3 pb-2' : ''}`}>
          {message.editedAt && (
            <span className="text-[10px] italic" style={{ color: isOwn ? 'rgba(255,255,255,0.5)' : '#6c8998' }}>изм.</span>
          )}
          <span className="text-[11px]" style={{ color: isOwn ? 'rgba(255,255,255,0.55)' : '#6c8998' }}>{time}</span>
          {isOwn && (
            <svg width="18" height="10" viewBox="0 0 18 10" fill="none">
              <path d="M1 5l3 3L11 1" stroke={tickColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M5 5l3 3L15 1" stroke={tickColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </div>
      </div>
      {reactions.length > 0 && <ReactionBar reactions={reactions} myId={myId} onReact={handleReact} />}
    </div>
  )

  return (
    <>
      <div
        ref={bubbleRef}
        className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-0.5 msg-appear`}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onContextMenu={onContextMenu}
      >
        {bubbleContent}
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
      <div
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
        onClick={onClose}
      />

      {/* Emoji bar + expand button */}
      <div
        className="fixed z-50 flex items-center gap-0.5 px-2 py-1.5 rounded-2xl shadow-2xl"
        style={{
          left: menuLeft,
          top: menuTop,
          background: '#1e2c3a',
          border: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        {QUICK_EMOJIS.map(emoji => (
          <button
            key={emoji}
            onPointerDown={e => { e.stopPropagation(); onReact(emoji) }}
            className="text-2xl leading-none w-9 h-9 flex items-center justify-center rounded-xl transition-all hover:bg-white/10 active:scale-90"
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
      </div>

      {/* Action list */}
      {(itemCount > 0 || readLabel) && (
        <div
          className="fixed z-50 rounded-2xl overflow-hidden shadow-2xl"
          style={{
            left: menuLeft,
            top: menuTop + EMOJI_H + 4,
            width: MENU_W,
            background: '#1e2c3a',
            border: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          {readLabel && (
            <div className="px-4 py-2 text-xs" style={{ color: '#6c8998', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              {readLabel}
            </div>
          )}
          {onCopy && isText && (
            <CtxItem icon="📋" label="Скопировать" onPointerDown={e => { e.stopPropagation(); onCopy() }} />
          )}
          {onDelete && (
            <CtxItem icon="🗑" label="Удалить" onPointerDown={e => { e.stopPropagation(); onDelete() }} danger />
          )}
        </div>
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
      style={{ color: danger ? '#fc8181' : 'rgba(255,255,255,0.85)' }}
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
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)' }}>
      {/* Backdrop close */}
      <div className="flex-1" onClick={onClose} />

      {/* Panel */}
      <div
        className="shrink-0 rounded-t-3xl flex flex-col"
        style={{ background: '#17212b', maxHeight: '70vh', height: '70vh' }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.15)' }} />
        </div>

        {/* Search */}
        <div className="px-3 pb-2">
          <input
            autoFocus
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Поиск эмодзи…"
            className="w-full rounded-xl px-3 py-2 text-sm text-white outline-none placeholder-white/30"
            style={{ background: '#242f3d' }}
          />
        </div>

        {/* Category tabs */}
        {!search.trim() && (
          <div className="flex gap-0.5 px-2 pb-1 overflow-x-auto no-scrollbar shrink-0">
            {EMOJI_CATEGORIES.map((cat, i) => (
              <button
                key={i}
                onClick={() => setActiveCategory(i)}
                className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl text-xl transition-all"
                style={{ background: activeCategory === i ? 'rgba(42,171,238,0.2)' : 'transparent' }}
              >
                {cat.icon}
              </button>
            ))}
          </div>
        )}

        {/* Emoji grid */}
        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {search.trim() ? (
            <>
              <p className="text-xs px-1 py-1.5" style={{ color: '#6c8998' }}>Результаты поиска</p>
              <div className="grid gap-0.5" style={{ gridTemplateColumns: 'repeat(8, 1fr)' }}>
                {EMOJI_CATEGORIES.flatMap(c => c.emojis)
                  .filter((e, i, arr) => arr.indexOf(e) === i)
                  .map(emoji => (
                    <EmojiBtn key={emoji} emoji={emoji} onSelect={onSelect} />
                  ))}
              </div>
              {filteredEmojis?.length === 0 && (
                <p className="text-center text-sm py-8" style={{ color: '#6c8998' }}>Ничего не найдено</p>
              )}
            </>
          ) : (
            <>
              <p className="text-xs px-1 py-1.5 font-medium" style={{ color: '#6c8998' }}>
                {EMOJI_CATEGORIES[activeCategory].label}
              </p>
              <div className="grid gap-0.5" style={{ gridTemplateColumns: 'repeat(8, 1fr)' }}>
                {EMOJI_CATEGORIES[activeCategory].emojis.map(emoji => (
                  <EmojiBtn key={emoji} emoji={emoji} onSelect={onSelect} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function EmojiBtn({ emoji, onSelect }: { emoji: string; onSelect: (e: string) => void }) {
  return (
    <button
      onPointerDown={e => { e.preventDefault(); onSelect(emoji) }}
      className="w-full aspect-square flex items-center justify-center text-2xl rounded-xl transition-all active:scale-90 hover:bg-white/10"
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
