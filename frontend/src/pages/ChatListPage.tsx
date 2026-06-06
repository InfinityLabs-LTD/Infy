import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { chatApi } from '@/api/chat'
import { useChatStore } from '@/store/chat'
import { useAuthStore } from '@/store/auth'
import { useSocket } from '@/hooks/useSocket'
import { Avatar } from '@/components/ui/Avatar'
import { OnlineIndicator } from '@/components/ui/OnlineIndicator'
import { Spinner } from '@/components/ui/Spinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { NewChatModal } from '@/components/chat/NewChatModal'

export function ChatListPage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const { chats, setChats } = useChatStore()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const [search, setSearch] = useState('')
  const [showNewChat, setShowNewChat] = useState(false)

  useSocket()

  useEffect(() => {
    chatApi.listChats()
      .then(r => setChats(r.data.data))
      .catch(setError)
      .finally(() => setLoading(false))
  }, [])

  const filtered = chats.filter(c => {
    const q = search.toLowerCase()
    return (c.partner?.nickname ?? '').toLowerCase().includes(q) ||
           (c.partner?.username ?? '').toLowerCase().includes(q)
  })

  return (
    <div className="h-screen flex bg-gray-50">
      {/* Sidebar */}
      <div className="w-full max-w-[340px] flex flex-col bg-sidebar shadow-panel">

        {/* Header */}
        <div className="px-4 pt-5 pb-3">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-primary-500/20 flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2">
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                </svg>
              </div>
              <span className="text-white font-bold text-lg tracking-tight">Infy</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowNewChat(true)}
                className="w-9 h-9 flex items-center justify-center rounded-xl text-white/60 hover:bg-white/10 hover:text-white transition-colors"
                title="Новый чат"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M5 12h14"/>
                </svg>
              </button>
              <button
                onClick={() => navigate('/profile')}
                className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-white/10 transition-colors"
              >
                <Avatar url={user?.avatarUrl ?? null} nickname={user?.nickname ?? '?'} size={28} />
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            </span>
            <input
              className="input-dark pl-9 py-2 text-sm"
              placeholder="Поиск чатов…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* New chat button */}
        <div className="px-3 pb-2">
          <button
            onClick={() => setShowNewChat(true)}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl bg-primary-600/20 hover:bg-primary-600/30 text-primary-300 hover:text-primary-200 transition-all text-sm font-medium border border-primary-500/20"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14"/>
            </svg>
            Начать новый чат
          </button>
        </div>

        {/* Section label */}
        <div className="px-4 py-2">
          <span className="text-xs font-semibold text-white/30 uppercase tracking-widest">
            {chats.length > 0 ? `Чаты · ${chats.length}` : 'Чаты'}
          </span>
        </div>

        {/* Chat list */}
        <div className="flex-1 overflow-y-auto">
          {error !== null && (
            <div className="px-3 py-2"><ErrorMessage error={error} /></div>
          )}
          {loading ? (
            <div className="flex justify-center py-12"><Spinner size={28} /></div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center py-16 px-6 text-center">
              <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5">
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                </svg>
              </div>
              <p className="text-white/40 text-sm">
                {search ? 'Чаты не найдены' : 'Нет чатов'}
              </p>
              {!search && (
                <button onClick={() => setShowNewChat(true)} className="mt-3 text-primary-400 text-sm hover:text-primary-300">
                  Начать первый чат →
                </button>
              )}
            </div>
          ) : (
            filtered.map(chat => (
              <Link
                key={chat.id}
                to={`/chat/${chat.id}`}
                className="flex items-center gap-3 px-3 py-2.5 mx-2 mb-0.5 rounded-xl hover:bg-white/8 transition-colors group"
                style={{ '--tw-bg-opacity': '1' } as React.CSSProperties}
              >
                <div className="relative shrink-0">
                  <Avatar url={chat.partner?.avatarUrl ?? null} nickname={chat.partner?.nickname ?? '?'} size={46} />
                  {chat.partner && (
                    <span className="absolute -bottom-0.5 -right-0.5">
                      <OnlineIndicator userId={chat.partner.id} />
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2 mb-0.5">
                    <p className="font-semibold text-white/90 text-sm truncate group-hover:text-white">
                      {chat.partner?.nickname ?? 'Неизвестный'}
                    </p>
                    {chat.lastMessage && (
                      <span className="text-[11px] text-white/30 shrink-0">
                        {formatTime(chat.lastMessage.createdAt)}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-white/40 truncate">
                    {chat.lastMessage
                      ? (chat.lastMessage.type === 'TEXT'
                          ? chat.lastMessage.content
                          : mediaLabel(chat.lastMessage.type))
                      : 'Нет сообщений'}
                  </p>
                </div>
              </Link>
            ))
          )}
        </div>

        {/* Bottom nav */}
        <div className="p-3 border-t border-sidebar-border">
          <button
            onClick={logout}
            className="btn-sidebar text-white/40 hover:text-red-400 hover:bg-red-500/10 text-xs"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            Выйти из аккаунта
          </button>
        </div>
      </div>

      {/* Empty state for desktop */}
      <div className="hidden md:flex flex-1 flex-col items-center justify-center bg-gray-50">
        <div className="w-20 h-20 rounded-3xl bg-primary-100 flex items-center justify-center mb-5">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="1.5">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-gray-700 mb-1">Выберите чат</h3>
        <p className="text-gray-400 text-sm text-center max-w-xs">
          Выберите диалог из списка слева или начните новый
        </p>
        <button
          onClick={() => setShowNewChat(true)}
          className="btn-primary mt-5"
        >
          Новый чат
        </button>
      </div>

      {showNewChat && <NewChatModal onClose={() => setShowNewChat(false)} />}
    </div>
  )
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

function mediaLabel(type: string): string {
  const map: Record<string, string> = {
    IMAGE: '🖼 Изображение', VIDEO: '🎥 Видео',
    AUDIO: '🎤 Голосовое', CIRCLE_VIDEO: '⭕ Кружок',
  }
  return map[type] ?? type
}
