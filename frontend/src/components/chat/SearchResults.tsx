import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { chatApi, MessageSearchResult } from '@/api/chat'
import { profileApi, UserSearchResult } from '@/api/auth'
import { useChatStore, Chat } from '@/store/chat'
import { Avatar } from '@/components/ui/Avatar'
import { Spinner } from '@/components/ui/Spinner'

interface Props {
  query: string
}

function highlight(text: string, q: string) {
  const idx = text.toLowerCase().indexOf(q.toLowerCase())
  if (idx < 0) return text
  return (
    <>
      {text.slice(0, idx)}
      <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{text.slice(idx, idx + q.length)}</span>
      {text.slice(idx + q.length)}
    </>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide"
      style={{ color: 'var(--text-low)' }}>
      {children}
    </p>
  )
}

function RowButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 mx-2 px-3 py-2.5 rounded-2xl transition-colors text-left"
      style={{ width: 'calc(100% - 1rem)' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-hover)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      {children}
    </button>
  )
}

/**
 * Результаты основного поиска: три группы — существующие диалоги, найденные
 * сообщения и новые контакты по username/имени. Диалоги фильтруются локально,
 * сообщения и пользователи подгружаются с дебаунсом.
 */
export function SearchResults({ query }: Props) {
  const navigate = useNavigate()
  const chats = useChatStore(s => s.chats)
  const q = query.trim()

  const [messages, setMessages] = useState<MessageSearchResult[]>([])
  const [users, setUsers] = useState<UserSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Локальная фильтрация уже существующих диалогов
  const chatMatches: Chat[] = chats.filter(c => {
    const ql = q.toLowerCase()
    return (
      (c.partner?.nickname ?? '').toLowerCase().includes(ql) ||
      (c.partner?.username ?? '').toLowerCase().includes(ql)
    )
  })

  // id партнёров, с кем диалог уже есть — чтобы не дублировать их в «новых контактах»
  const existingPartnerIds = new Set(chats.map(c => c.partner?.id).filter(Boolean) as string[])

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (q.length < 2) {
      setMessages([]); setUsers([]); setLoading(false)
      return
    }
    setLoading(true)
    timerRef.current = setTimeout(async () => {
      try {
        const [msgRes, userRes] = await Promise.allSettled([
          chatApi.searchMessages(q),
          profileApi.searchUsers(q),
        ])
        setMessages(msgRes.status === 'fulfilled' ? msgRes.value.data.data : [])
        setUsers(userRes.status === 'fulfilled' ? userRes.value.data.data : [])
      } finally {
        setLoading(false)
      }
    }, 350)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [q])

  // Новые контакты: найденные пользователи без существующего диалога
  const newContacts = users.filter(u => !existingPartnerIds.has(u.id))

  const nothing =
    !loading && chatMatches.length === 0 && messages.length === 0 && newContacts.length === 0

  if (q.length < 2) {
    return (
      <p className="text-center text-sm py-10" style={{ color: 'var(--text-low)' }}>
        Введите минимум 2 символа
      </p>
    )
  }

  return (
    <div className="pb-2">
      {/* Диалоги */}
      {chatMatches.length > 0 && (
        <>
          <SectionTitle>Чаты</SectionTitle>
          {chatMatches.map(c => (
            <RowButton key={`chat-${c.id}`} onClick={() => navigate(`/chat/${c.partner?.id ?? c.id}`)}>
              <Avatar url={c.partner?.avatarUrl ?? null} nickname={c.partner?.nickname ?? '?'} size={44} />
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-medium truncate" style={{ color: 'var(--text-hi)' }}>
                  {highlight(c.partner?.nickname ?? 'Неизвестный', q)}
                </p>
                <p className="text-[12px] truncate" style={{ color: 'var(--text-low)' }}>
                  @{c.partner?.username}
                </p>
              </div>
            </RowButton>
          ))}
        </>
      )}

      {/* Сообщения */}
      {messages.length > 0 && (
        <>
          <SectionTitle>Сообщения</SectionTitle>
          {messages.map(m => (
            <RowButton key={`msg-${m.messageId}`} onClick={() => navigate(`/chat/${m.partner?.id ?? m.chatId}`)}>
              <Avatar url={m.partner?.avatarUrl ?? null} nickname={m.partner?.nickname ?? '?'} size={44} />
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-medium truncate" style={{ color: 'var(--text-hi)' }}>
                  {m.partner?.nickname ?? 'Неизвестный'}
                </p>
                <p className="text-[12px] truncate" style={{ color: 'var(--preview-read)' }}>
                  {m.isOwn ? 'Вы: ' : ''}{highlight(m.content ?? '', q)}
                </p>
              </div>
            </RowButton>
          ))}
        </>
      )}

      {/* Новые контакты */}
      {newContacts.length > 0 && (
        <>
          <SectionTitle>Глобальный поиск</SectionTitle>
          {newContacts.map(u => (
            <RowButton key={`user-${u.id}`} onClick={() => navigate(`/chat/${u.id}`)}>
              <Avatar url={u.avatarUrl} nickname={u.nickname} size={44} />
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-medium truncate" style={{ color: 'var(--text-hi)' }}>
                  {highlight(u.nickname, q)}
                </p>
                <p className="text-[12px] truncate" style={{ color: 'var(--text-low)' }}>
                  @{u.username}
                </p>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2"
                className="shrink-0">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </RowButton>
          ))}
        </>
      )}

      {loading && (
        <div className="flex justify-center py-6"><Spinner size={18} /></div>
      )}

      {nothing && (
        <p className="text-center text-sm py-10" style={{ color: 'var(--text-low)' }}>
          Ничего не найдено
        </p>
      )}
    </div>
  )
}
