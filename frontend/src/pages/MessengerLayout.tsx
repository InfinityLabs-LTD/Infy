import { useEffect, useRef, useState } from 'react'
import { Link, Outlet, useNavigate, useMatch, useLocation } from 'react-router-dom'
import { chatApi } from '@/api/chat'
import { useChatStore, Chat } from '@/store/chat'
import { useAuthStore } from '@/store/auth'
import { useSocket } from '@/hooks/useSocket'
import { useNotifications } from '@/hooks/useNotifications'
import { Avatar } from '@/components/ui/Avatar'
import { OnlineIndicator } from '@/components/ui/OnlineIndicator'
import { Spinner } from '@/components/ui/Spinner'
import { NewChatModal } from '@/components/chat/NewChatModal'
import { ReminderToasts } from '@/components/chat/ReminderToasts'

function formatTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000)
  if (diffDays < 7)
    return d.toLocaleDateString('ru-RU', { weekday: 'short' })
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

function mediaLabel(type: string): string {
  const m: Record<string, string> = {
    IMAGE: '🖼 Фото', VIDEO: '🎥 Видео',
    AUDIO: '🎤 Голосовое', CIRCLE_VIDEO: '⭕ Кружок',
  }
  return m[type] ?? type
}

function HoverBtn({ onClick, title, children }: { onClick: () => void; title?: string; children: React.ReactNode }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      title={title}
      className="w-10 h-10 flex items-center justify-center rounded-full transition-colors"
      style={{ color: 'rgba(255,255,255,0.55)', background: hov ? 'rgba(255,255,255,0.08)' : 'transparent' }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      {children}
    </button>
  )
}

function MenuBtn({ label, onClick, danger, icon }: { label: string; onClick: () => void; danger?: boolean; icon: React.ReactNode }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3.5 py-2.5 text-sm transition-colors"
      style={{
        color: danger ? '#fc8181' : 'rgba(255,255,255,0.75)',
        background: hov ? 'rgba(255,255,255,0.07)' : 'transparent',
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      {icon}
      {label}
    </button>
  )
}

function ChatRow({ chat, active }: { chat: Chat; active: boolean }) {
  const [hov, setHov] = useState(false)
  return (
    <Link
      to={`/chat/${chat.partner?.id ?? chat.id}`}
      className="flex items-center gap-3 px-3 py-2 transition-none"
      style={{ background: active ? '#2b5278' : hov ? '#202e3e' : 'transparent' }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <div className="relative shrink-0">
        <Avatar url={chat.partner?.avatarUrl ?? null} nickname={chat.partner?.nickname ?? '?'} size={50} />
        {chat.partner && (
          <span className="absolute bottom-0 right-0">
            <OnlineIndicator userId={chat.partner.id} />
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2 mb-0.5">
          <p className="text-[14px] font-medium text-white truncate leading-tight">
            {chat.partner?.nickname ?? 'Неизвестный'}
          </p>
          <div className="flex items-center gap-1.5 shrink-0">
            {chat.lastMessage && (
              <span className="text-[11px]" style={{ color: active ? 'rgba(255,255,255,0.65)' : '#6c8998' }}>
                {formatTime(chat.lastMessage.createdAt)}
              </span>
            )}
            {!active && chat.unreadCount > 0 && (
              <span
                className="min-w-[18px] h-[18px] px-1 rounded-full text-[11px] font-semibold text-white flex items-center justify-center"
                style={{ background: '#2aabee' }}
              >
                {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
              </span>
            )}
          </div>
        </div>
        <p className="text-[13px] truncate leading-snug" style={{ color: active ? 'rgba(255,255,255,0.6)' : '#6c8998' }}>
          {chat.lastMessage
            ? (chat.lastMessage.type === 'TEXT'
                ? (chat.lastMessage.isOwn ? `Вы: ${chat.lastMessage.content}` : chat.lastMessage.content)
                : mediaLabel(chat.lastMessage.type))
            : 'Нет сообщений'}
        </p>
      </div>
    </Link>
  )
}

export function MessengerLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const chatMatch = useMatch('/chat/:id')
  const activeChatId = chatMatch?.params.id
  const isContactsTab = location.pathname === '/contacts'

  const user = useAuthStore(s => s.user)
  const logout = useAuthStore(s => s.logout)
  const { chats, setChats } = useChatStore()
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showNewChat, setShowNewChat] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useSocket()
  useNotifications()

  useEffect(() => {
    chatApi.listChats()
      .then(r => setChats(r.data.data))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  const filtered = chats.filter(c => {
    const q = search.toLowerCase()
    return (
      (c.partner?.nickname ?? '').toLowerCase().includes(q) ||
      (c.partner?.username ?? '').toLowerCase().includes(q)
    )
  })

  return (
    <div className="flex overflow-hidden" style={{ height: '100dvh', background: '#0e1621' }}>
      {/* ── Sidebar ── */}
      <aside
        className={`flex flex-col w-full md:w-[320px] md:shrink-0 ${activeChatId ? 'hidden md:flex' : 'flex'}`}
        style={{ background: '#17212b', borderRight: '1px solid #0e1621' }}
      >

        {/* Top bar */}
        <div className="flex items-center gap-1 px-2 py-1.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          {/* Hamburger + dropdown */}
          <div className="relative shrink-0" ref={menuRef}>
            <HoverBtn onClick={() => setMenuOpen(v => !v)} title="Меню">
              {menuOpen ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <line x1="3" y1="6" x2="21" y2="6"/>
                  <line x1="3" y1="12" x2="21" y2="12"/>
                  <line x1="3" y1="18" x2="21" y2="18"/>
                </svg>
              )}
            </HoverBtn>

            {menuOpen && (
              <div
                className="absolute top-12 left-0 z-50 w-56 rounded-2xl shadow-2xl overflow-hidden"
                style={{ background: '#1e2c3a', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                <button
                  onClick={() => { navigate('/profile'); setMenuOpen(false) }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors"
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
                >
                  <Avatar url={user?.avatarUrl ?? null} nickname={user?.nickname ?? '?'} size={36} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{user?.nickname}</p>
                    <p className="text-xs truncate" style={{ color: '#6c8998' }}>@{user?.username}</p>
                  </div>
                </button>
                <MenuBtn
                  label="Мой профиль"
                  onClick={() => { navigate('/profile'); setMenuOpen(false) }}
                  icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6c8998" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>}
                />
                <MenuBtn
                  label="Устройства"
                  onClick={() => { navigate('/sessions'); setMenuOpen(false) }}
                  icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6c8998" strokeWidth="2"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>}
                />
                <div style={{ height: '1px', background: 'rgba(255,255,255,0.07)', margin: '4px 0' }} />
                <MenuBtn
                  label="Выйти"
                  onClick={logout}
                  danger
                  icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fc8181" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>}
                />
              </div>
            )}
          </div>

          {/* Search bar */}
          <div className="flex-1 relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'rgba(255,255,255,0.25)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            </span>
            <input
              className="w-full rounded-full pl-9 pr-3 py-2 text-sm outline-none"
              style={{ background: '#1c2b3a', color: 'rgba(255,255,255,0.85)', caretColor: '#2aabee' }}
              placeholder="Поиск"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* Compose */}
          <HoverBtn onClick={() => setShowNewChat(true)} title="Новый диалог">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2aabee" strokeWidth="2">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </HoverBtn>
        </div>

        {/* Chat list — скрыт на мобильном когда открыты Контакты */}
        <nav className={`flex-1 overflow-y-auto ${isContactsTab ? 'hidden md:block' : ''}`}>
          {loading ? (
            <div className="flex justify-center py-10"><Spinner size={20} /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-14">
              <p className="text-sm" style={{ color: 'rgba(255,255,255,0.2)' }}>
                {search ? 'Не найдено' : 'Нет диалогов'}
              </p>
              {!search && (
                <button onClick={() => setShowNewChat(true)} className="mt-1.5 text-sm" style={{ color: '#2aabee' }}>
                  Начать диалог
                </button>
              )}
            </div>
          ) : (
            filtered.map(chat => (
              <ChatRow key={chat.id} chat={chat} active={chat.partner?.id === activeChatId} />
            ))
          )}
        </nav>

        {/* Нижняя навигация — только мобильный */}
        <div className="md:hidden shrink-0 flex items-center justify-around px-2 pt-2"
          style={{
            background: '#17212b',
            borderTop: '1px solid rgba(255,255,255,0.07)',
            paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
          }}>
          <MobileNavBtn
            label="Контакты"
            active={isContactsTab}
            onClick={() => navigate('/contacts')}
            icon={
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
              </svg>
            }
          />
          <MobileNavBtn
            label="Чаты"
            active={!isContactsTab}
            onClick={() => navigate('/')}
            icon={
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
              </svg>
            }
          />
          <MobileNavBtn
            label="Профиль"
            active={false}
            onClick={() => navigate('/profile')}
            icon={
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
              </svg>
            }
          />
        </div>
      </aside>

      {/* ── Main ── */}
      <div
        className={`flex-1 min-w-0 min-h-0 flex-col overflow-hidden ${activeChatId || isContactsTab ? 'flex' : 'hidden md:flex'}`}
        style={{ background: '#0e1621' }}
      >
        <Outlet />
      </div>

      {showNewChat && <NewChatModal onClose={() => setShowNewChat(false)} />}

      <ReminderToasts />
    </div>
  )
}

function MobileNavBtn({ label, active, onClick, icon }: {
  label: string; active: boolean; onClick: () => void; icon: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1 px-4 py-1 rounded-xl transition-colors"
      style={{ color: active ? '#2aabee' : 'rgba(255,255,255,0.35)' }}
    >
      {icon}
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  )
}
