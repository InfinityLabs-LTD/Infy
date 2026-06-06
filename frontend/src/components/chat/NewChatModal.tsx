import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { profileApi, User } from '@/api/auth'
import { chatApi } from '@/api/chat'
import { Avatar } from '@/components/ui/Avatar'
import { Spinner } from '@/components/ui/Spinner'

interface Props {
  onClose: () => void
}

export function NewChatModal({ onClose }: Props) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [user, setUser] = useState<User | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [searching, setSearching] = useState(false)
  const [creating, setCreating] = useState(false)
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

  async function openChat() {
    if (!user) return
    setCreating(true)
    try {
      const res = await chatApi.createChat(user.id)
      onClose()
      navigate(`/chat/${res.data.data.id}`)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
         onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Новый чат</h2>
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="p-4">
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
              {searching
                ? <Spinner size={15} />
                : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
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

          {/* Result */}
          <div className="mt-3 min-h-[64px]">
            {user && (
              <button
                onClick={openChat}
                disabled={creating}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-primary-50 transition-colors group"
              >
                <Avatar url={user.avatarUrl} nickname={user.nickname} size={44} />
                <div className="flex-1 text-left">
                  <p className="font-semibold text-gray-900 group-hover:text-primary-700">{user.nickname}</p>
                  <p className="text-sm text-gray-400">@{user.username}</p>
                </div>
                {creating
                  ? <Spinner size={16} />
                  : <svg className="text-primary-400 opacity-0 group-hover:opacity-100 transition-opacity" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M5 12h14M12 5l7 7-7 7"/>
                    </svg>
                }
              </button>
            )}
            {notFound && (
              <p className="text-center text-sm text-gray-400 py-4">
                Пользователь <span className="font-medium text-gray-600">@{query.replace(/^@/, '')}</span> не найден
              </p>
            )}
            {!user && !notFound && !searching && query.length >= 3 && (
              <p className="text-center text-sm text-gray-400 py-4">Введите имя пользователя для поиска</p>
            )}
            {!user && !notFound && !searching && query.length < 3 && (
              <p className="text-center text-sm text-gray-400 py-4">Введите минимум 3 символа</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
