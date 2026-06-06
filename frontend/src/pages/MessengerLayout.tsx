import { useEffect, useState } from 'react'
import { Link, Outlet, useNavigate, useMatch } from 'react-router-dom'
import { chatApi } from '@/api/chat'
import { useChatStore } from '@/store/chat'
import { useAuthStore } from '@/store/auth'
import { useSocket } from '@/hooks/useSocket'
import { Avatar } from '@/components/ui/Avatar'
import { OnlineIndicator } from '@/components/ui/OnlineIndicator'
import { Spinner } from '@/components/ui/Spinner'
import { NewChatModal } from '@/components/chat/NewChatModal'

function formatTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

function mediaLabel(type: string): string {
  const m: Record<string, string> = {
    IMAGE: '🖼 Фото', VIDEO: '🎥 Видео',
    AUDIO: '🎤 Голосовое', CIRCLE_VIDEO: '⭕ Кружок',
  }
  return m[type] ?? type
}

export function MessengerLayout() {
  const navigate = useNavigate()
  const chatMatch = useMatch('/chat/:id')
  const activeChatId = chatMatch?.params.id

  const user = useAuthStore(s => s.user)
  const logout = useAuthStore(s => s.logout)
  const { chats, setChats } = useChatStore()
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showNewChat, setShowNewChat] = useState(false)

  useSocket()

  useEffect(() => {
    chatApi.listChats()
      .then(r => setChats(r.data.data))
      .finally(() => setLoading(false))
  }, [])

  const filtered = chats.filter(c => {
    const q = search.toLowerCase()
    return (
      (c.partner?.nickname ?? '').toLowerCase().includes(q) ||
      (c.partner?.username ?? '').toLowerCase().includes(q)
    )
  })

  return (
    <div className="h-screen flex overflow-hidden">
      {/* ── Sidebar ── */}
      <aside className="w-[280px] shrink-0 flex flex-col bg-sidebar border-r border-sidebar-border">

        {/* Header */}
        <div className="px-3 pt-4 pb-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-primary-500/25 flex items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2">
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                </svg>
              </div>
              <span className="font-bold text-white text-sm tracking-tight">Infy</span>
            </div>
            <div className="flex items-center gap-0.5">
              <button onClick={() => setShowNewChat(true)} title="Новый чат"
                className="w-7 h-7 flex items-center justify-center rounded-lg text-white/40 hover:bg-white/10 hover:text-white transition-colors">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M12 5v14M5 12h14"/>
                </svg>
              </button>
              <button onClick={() => navigate('/profile')} title="Профиль"
                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors">
                <Avatar url={user?.avatarUrl ?? null} nickname={user?.nickname ?? '?'} size={24} />
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/>
                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            </span>
            <input className="input-dark pl-7 py-1.5 text-xs"
              placeholder="Поиск по имени…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* New chat */}
          <button onClick={() => setShowNewChat(true)}
            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary-600/15 hover:bg-primary-600/25 text-primary-300/80 hover:text-primary-200 border border-primary-600/20 transition-all text-xs font-semibold">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 5v14M5 12h14"/>
            </svg>
            Начать новый чат
          </button>
        </div>

        {/* Label */}
        <div className="px-3 pb-1">
          <span className="text-[9px] font-bold text-white/20 uppercase tracking-widest">
            {chats.length > 0 ? `Диалоги · ${chats.length}` : 'Диалоги'}
          </span>
        </div>

        {/* Chat list */}
        <nav className="flex-1 overflow-y-auto px-1.5 pb-2 space-y-px">
          {loading ? (
            <div className="flex justify-center py-8"><Spinner size={18} /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-white/20 text-xs">{search ? 'Не найдено' : 'Нет чатов'}</p>
              {!search && (
                <button onClick={() => setShowNewChat(true)} className="mt-1 text-primary-400/60 text-xs hover:text-primary-300 transition-colors">
                  Начать →
                </button>
              )}
            </div>
          ) : (
            filtered.map(chat => (
              <Link key={chat.id} to={`/chat/${chat.id}`}
                className={`flex items-center gap-2.5 px-2 py-2 rounded-xl transition-all group border ${
                  chat.id === activeChatId
                    ? 'bg-primary-600/20 border-primary-500/25'
                    : 'border-transparent hover:bg-white/5'
                }`}>
                <div className="relative shrink-0">
                  <Avatar url={chat.partner?.avatarUrl ?? null} nickname={chat.partner?.nickname ?? '?'} size={38} />
                  {chat.partner && (
                    <span className="absolute -bottom-0.5 -right-0.5">
                      <OnlineIndicator userId={chat.partner.id} />
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-1 mb-px">
                    <p className={`text-xs font-semibold truncate ${
                      chat.id === activeChatId ? 'text-white' : 'text-white/70 group-hover:text-white/90'
                    }`}>
                      {chat.partner?.nickname ?? 'Неизвестный'}
                    </p>
                    {chat.lastMessage && (
                      <span className="text-[9px] text-white/20 shrink-0">
                        {formatTime(chat.lastMessage.createdAt)}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-white/30 truncate leading-tight">
                    {chat.lastMessage
                      ? (chat.lastMessage.type === 'TEXT' ? chat.lastMessage.content : mediaLabel(chat.lastMessage.type))
                      : 'Нет сообщений'}
                  </p>
                </div>
              </Link>
            ))
          )}
        </nav>

        {/* Logout */}
        <div className="p-2 border-t border-sidebar-border">
          <button onClick={logout}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-white/25 hover:text-red-400 hover:bg-red-500/10 transition-colors text-xs font-medium">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            Выйти
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <Outlet />
      </div>

      {showNewChat && <NewChatModal onClose={() => setShowNewChat(false)} />}
    </div>
  )
}
