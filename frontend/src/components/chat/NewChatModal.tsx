import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { profileApi, PublicProfile } from '@/api/auth'
import { Avatar } from '@/components/ui/Avatar'
import { Spinner } from '@/components/ui/Spinner'

interface Props {
  onClose: () => void
}

export function NewChatModal({ onClose }: Props) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [user, setUser] = useState<PublicProfile | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [searching, setSearching] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  function handleChange(val: string) {
    setQuery(val)
    setUser(null)
    setNotFound(false)
    if (timerRef.current) clearTimeout(timerRef.current)
    const trimmed = val.trim().replace(/^@/, '')
    if (trimmed.length < 3) return
    timerRef.current = setTimeout(() => search(trimmed), 400)
  }

  async function search(username: string) {
    setSearching(true)
    try {
      const res = await profileApi.getByUsername(username)
      setUser(res.data.data)
      setNotFound(false)
    } catch {
      setUser(null)
      setNotFound(true)
    } finally {
      setSearching(false)
    }
  }

  function openChat() {
    if (!user) return
    onClose()
    navigate(`/chat/${user.id}`)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="glass-pop w-full max-w-sm rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <h2 className="font-semibold text-white text-base">Новый диалог</h2>
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl transition-colors"
            style={{ color: 'rgba(255,255,255,0.4)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="p-4">
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: 'rgba(255,255,255,0.3)' }}>
              {searching
                ? <Spinner size={15} />
                : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              }
            </span>
            <input
              ref={inputRef}
              className="input pl-10"
              placeholder="Поиск по @username"
              value={query}
              onChange={e => handleChange(e.target.value)}
            />
          </div>

          <div className="mt-3 min-h-[64px]">
            {user && (
              <button
                onClick={openChat}
                className="w-full flex items-center gap-3 p-3 rounded-xl transition-colors"
                style={{ color: 'white' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <Avatar url={user.avatarUrl} nickname={user.nickname} size={44} />
                <div className="flex-1 text-left">
                  <p className="font-semibold text-white text-sm">{user.nickname}</p>
                  <p className="text-xs" style={{ color: 'var(--text-low)' }}>@{user.username}</p>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A855F7" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              </button>
            )}
            {notFound && (
              <p className="text-center text-sm py-4" style={{ color: 'var(--text-low)' }}>
                Пользователь <span className="text-white/60">@{query.replace(/^@/, '')}</span> не найден
              </p>
            )}
            {!user && !notFound && !searching && query.length >= 3 && (
              <p className="text-center text-sm py-4" style={{ color: 'var(--text-low)' }}>Введите имя пользователя</p>
            )}
            {!user && !notFound && !searching && query.length < 3 && (
              <p className="text-center text-sm py-4" style={{ color: 'var(--text-low)' }}>Введите минимум 3 символа</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
