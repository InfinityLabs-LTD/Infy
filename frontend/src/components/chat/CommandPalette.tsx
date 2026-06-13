import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useChatStore } from '@/store/chat'
import { profileApi } from '@/api/auth'
import { chatApi } from '@/api/chat'
import { Avatar } from '@/components/ui/Avatar'
import { Spinner } from '@/components/ui/Spinner'

interface Props {
  onClose: () => void
}

type Result =
  | { kind: 'chat'; id: string; partnerId: string; nickname: string; username: string; avatarUrl: string | null; online: boolean }
  | { kind: 'newchat'; username: string }

export function CommandPalette({ onClose }: Props) {
  const navigate = useNavigate()
  const chats = useChatStore(s => s.chats)
  const onlineUsers = useChatStore(s => s.onlineUsers)
  const upsertChat = useChatStore(s => s.upsertChat)

  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [opening, setOpening] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  // Локальный фильтр по уже существующим чатам
  const results = useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase().replace(/^@/, '')
    const chatResults: Result[] = chats
      .filter(c => c.partner)
      .filter(c => {
        if (!q) return true
        return (
          c.partner!.nickname.toLowerCase().includes(q) ||
          c.partner!.username.toLowerCase().includes(q)
        )
      })
      .slice(0, 8)
      .map(c => ({
        kind: 'chat' as const,
        id: c.id,
        partnerId: c.partner!.id,
        nickname: c.partner!.nickname,
        username: c.partner!.username,
        avatarUrl: c.partner!.avatarUrl,
        online: onlineUsers.has(c.partner!.id),
      }))

    // Если запрос похож на username и точного совпадения среди чатов нет —
    // предложить «начать чат с @username»
    const exactExists = chatResults.some(r => r.kind === 'chat' && r.username.toLowerCase() === q)
    if (q.length >= 3 && !exactExists) {
      chatResults.push({ kind: 'newchat', username: q })
    }
    return chatResults
  }, [query, chats, onlineUsers])

  // Сброс активного индекса при изменении списка
  useEffect(() => { setActive(0) }, [query])

  async function choose(r: Result) {
    if (r.kind === 'chat') {
      onClose()
      navigate(`/chat/${r.partnerId}`)
      return
    }
    // newchat: найти пользователя и открыть/создать чат
    setOpening(true)
    try {
      const u = await profileApi.getByUsername(r.username)
      const chat = await chatApi.getOrCreateChat(u.data.data.id)
      upsertChat(chat.data.data)
      onClose()
      navigate(`/chat/${u.data.data.id}`)
    } catch {
      setOpening(false)
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive(a => Math.min(a + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(a => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (results[active]) choose(results[active])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  // Прокрутка активного элемента в зону видимости
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${active}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [active])

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center pt-[12vh] px-4"
      onClick={onClose}>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="absolute inset-0"
        style={{ background: 'rgba(8,11,22,0.6)', backdropFilter: 'blur(6px)' }}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: -8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: -8 }}
        transition={{ type: 'spring', stiffness: 420, damping: 32 }}
        className="glass-pop relative w-full max-w-lg rounded-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Поле ввода */}
        <div className="flex items-center gap-3 px-4 py-3.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <span style={{ color: 'var(--text-low)' }}>
            {opening ? <Spinner size={16} /> : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            )}
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Поиск чатов и людей…"
            className="flex-1 bg-transparent text-[15px] text-white outline-none placeholder-white/30"
          />
          <kbd className="px-1.5 py-0.5 rounded-md text-[10px] font-mono shrink-0"
            style={{ background: 'var(--glass-2)', border: '1px solid var(--glass-stroke)', color: 'var(--text-low)' }}>
            ESC
          </kbd>
        </div>

        {/* Результаты */}
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-2">
          {results.length === 0 ? (
            <p className="text-center text-sm py-8" style={{ color: 'var(--text-low)' }}>
              {query.trim().length < 3 ? 'Введите имя или @username' : 'Ничего не найдено'}
            </p>
          ) : (
            results.map((r, i) => (
              <button
                key={r.kind === 'chat' ? r.id : `new-${r.username}`}
                data-idx={i}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(r)}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
                style={{ background: active === i ? 'var(--glass-2)' : 'transparent' }}
              >
                {r.kind === 'chat' ? (
                  <>
                    <div className="relative shrink-0">
                      <Avatar url={r.avatarUrl} nickname={r.nickname} size={36} />
                      {r.online && (
                        <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full"
                          style={{ background: '#22C55E', boxShadow: '0 0 0 2px #0B1020' }} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{r.nickname}</p>
                      <p className="text-xs truncate" style={{ color: 'var(--text-low)' }}>@{r.username}</p>
                    </div>
                    <span className="text-[10px] shrink-0" style={{ color: 'var(--text-low)' }}>чат</span>
                  </>
                ) : (
                  <>
                    <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                      style={{ background: 'rgba(124,58,237,0.18)' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A855F7" strokeWidth="2">
                        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">Начать чат с @{r.username}</p>
                      <p className="text-xs" style={{ color: 'var(--text-low)' }}>найти и открыть диалог</p>
                    </div>
                  </>
                )}
              </button>
            ))
          )}
        </div>

        {/* Подсказка по навигации */}
        <div className="flex items-center gap-3 px-4 py-2 text-[11px]"
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)', color: 'var(--text-low)' }}>
          <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> навигация</span>
          <span className="flex items-center gap-1"><Kbd>↵</Kbd> открыть</span>
        </div>
      </motion.div>
    </div>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded text-[10px] font-mono"
      style={{ background: 'var(--glass-2)', border: '1px solid var(--glass-stroke)' }}>
      {children}
    </kbd>
  )
}
