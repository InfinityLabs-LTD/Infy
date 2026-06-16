import { useEffect, useRef, useState } from 'react'
import { Link, Outlet, useNavigate, useMatch, useLocation } from 'react-router-dom'
import { chatApi } from '@/api/chat'
import { useChatStore, Chat } from '@/store/chat'
import { useAuthStore } from '@/store/auth'
import { useSocket } from '@/hooks/useSocket'
import { NotificationPrompt } from '@/components/NotificationPrompt'
import { Avatar } from '@/components/ui/Avatar'
import { OnlineIndicator } from '@/components/ui/OnlineIndicator'
import { Spinner } from '@/components/ui/Spinner'
import { AnimatePresence, motion } from 'framer-motion'
import { NewChatModal } from '@/components/chat/NewChatModal'
import { CommandPalette } from '@/components/chat/CommandPalette'
import { ReminderToasts } from '@/components/chat/ReminderToasts'
import { SanctionBanner } from '@/components/SanctionBanner'

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
        color: danger ? '#EF4444' : 'rgba(255,255,255,0.75)',
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
      className="flex items-center gap-3 px-3 py-2 transition-colors duration-150"
      style={{
        background: active ? 'var(--glass-3)' : hov ? 'rgba(255,255,255,0.06)' : 'transparent',
        boxShadow: active ? 'inset 3px 0 0 var(--accent)' : 'none',
      }}
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
              <span className="text-[11px]" style={{ color: active ? 'rgba(255,255,255,0.65)' : 'var(--text-low)' }}>
                {formatTime(chat.lastMessage.createdAt)}
              </span>
            )}
            {!active && chat.unreadCount > 0 && (
              <span
                className="min-w-[18px] h-[18px] px-1 rounded-full text-[11px] font-semibold text-white flex items-center justify-center"
                style={{ background: 'var(--grad-own)' }}
              >
                {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
              </span>
            )}
          </div>
        </div>
        <p className="text-[13px] truncate leading-snug" style={{ color: active ? 'rgba(255,255,255,0.6)' : 'var(--text-low)' }}>
          {chat.lastMessage
            ? (chat.lastMessage.type === 'TEXT'
                ? (chat.lastMessage.isOwn ? `Вы: ${chat.lastMessage.content}` : chat.lastMessage.content)
                : chat.lastMessage.type === 'SYSTEM'
                  ? chat.lastMessage.content
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
  const isProfileTab = location.pathname === '/profile'

  const user = useAuthStore(s => s.user)
  const logout = useAuthStore(s => s.logout)
  const { chats, setChats } = useChatStore()
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showNewChat, setShowNewChat] = useState(false)
  const [showPalette, setShowPalette] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useSocket()

  // Глобальный хоткей ⌘K / Ctrl+K — командная палитра
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setShowPalette(v => !v)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

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
    <div className="flex flex-col overflow-hidden" style={{ height: '100%', background: 'var(--bg-deep)' }}>
      {/* ── Основной контент ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* ── Sidebar ── */}
      <aside
        className={`flex flex-col md:w-[320px] md:shrink-0 ${activeChatId || isContactsTab || isProfileTab ? 'hidden md:flex' : 'flex w-full'}`}
        style={{ background: 'rgba(255,255,255,0.03)', borderRight: '1px solid rgba(255,255,255,0.06)' }}
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
                className="glass-pop absolute top-12 left-0 z-50 w-56 rounded-2xl overflow-hidden"
              >
                <button
                  onClick={() => { navigate('/profile'); setMenuOpen(false) }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors"
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
                >
                  <Avatar url={user?.avatarUrl ?? null} nickname={user?.nickname ?? '?'} size={36} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{user?.nickname}</p>
                    <p className="text-xs truncate" style={{ color: 'var(--text-low)' }}>@{user?.username}</p>
                  </div>
                </button>
                <MenuBtn
                  label="Мой профиль"
                  onClick={() => { navigate('/profile'); setMenuOpen(false) }}
                  icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>}
                />
                <MenuBtn
                  label="Устройства"
                  onClick={() => { navigate('/sessions'); setMenuOpen(false) }}
                  icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>}
                />
                <div style={{ height: '1px', background: 'rgba(255,255,255,0.07)', margin: '4px 0' }} />
                <MenuBtn
                  label="Выйти"
                  onClick={logout}
                  danger
                  icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>}
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
              className="w-full rounded-full pl-9 pr-14 py-2 text-sm outline-none"
              style={{ background: 'var(--glass-2)', border: '1px solid var(--glass-stroke)', color: 'rgba(255,255,255,0.85)', caretColor: '#A855F7' }}
              placeholder="Поиск"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <button
              onClick={() => setShowPalette(true)}
              title="Командная палитра"
              className="absolute right-2 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded-md text-[10px] font-mono transition-colors hover:bg-white/10"
              style={{ background: 'var(--glass-2)', border: '1px solid var(--glass-stroke)', color: 'var(--text-low)' }}>
              ⌘K
            </button>
          </div>

          {/* Compose */}
          <HoverBtn onClick={() => setShowNewChat(true)} title="Новый диалог">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#A855F7" strokeWidth="2">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </HoverBtn>
        </div>

        {/* Chat list — скрыт на мобильном когда открыты Контакты */}
        <nav className={`flex-1 overflow-y-auto ${isContactsTab ? 'hidden md:block' : ''}`}>
          <NotificationPrompt />
          {loading ? (
            <div className="flex justify-center py-10"><Spinner size={20} /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-14">
              <p className="text-sm" style={{ color: 'rgba(255,255,255,0.2)' }}>
                {search ? 'Не найдено' : 'Нет диалогов'}
              </p>
              {!search && (
                <button onClick={() => setShowNewChat(true)} className="mt-1.5 text-sm" style={{ color: '#A855F7' }}>
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

      </aside>

      {/* ── Main ── */}
      <div
        className={`flex-1 min-w-0 min-h-0 flex-col overflow-hidden ${activeChatId || isContactsTab || isProfileTab ? 'flex' : 'hidden md:flex'}`}
        style={{ background: 'var(--bg-deep)' }}
      >
        <Outlet />
      </div>
      </div>

      {/* Нижняя навигация — плавающая стеклянная капсула (только мобильный, не в чате) */}
      <div className={`md:hidden shrink-0 px-4 ${activeChatId ? 'hidden' : ''}`}
        style={{ paddingBottom: 'max(6px, calc(env(safe-area-inset-bottom) - 16px))', paddingTop: 8 }}>
        <div className="glass-pop flex items-center justify-around rounded-full px-2 py-1.5">
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
            active={!isContactsTab && !isProfileTab && !activeChatId}
            onClick={() => navigate('/')}
            icon={
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
              </svg>
            }
          />
          <MobileNavBtn
            label="Профиль"
            active={isProfileTab}
            onClick={() => navigate('/profile')}
            icon={
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
              </svg>
            }
          />
        </div>
      </div>

      {showNewChat && <NewChatModal onClose={() => setShowNewChat(false)} />}

      <AnimatePresence>
        {showPalette && <CommandPalette onClose={() => setShowPalette(false)} />}
      </AnimatePresence>

      <ReminderToasts />
      <SanctionBanner />
    </div>
  )
}

function MobileNavBtn({ label, active, onClick, icon }: {
  label: string; active: boolean; onClick: () => void; icon: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className="relative flex flex-col items-center gap-1 px-5 py-2 rounded-full transition-colors active:scale-90"
      style={{ color: active ? '#fff' : 'rgba(255,255,255,0.4)' }}
    >
      {active && (
        <motion.span
          layoutId="mobile-nav-active"
          className="absolute inset-0 rounded-full"
          style={{ background: 'var(--grad-own)', boxShadow: 'var(--glow-primary)' }}
          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
        />
      )}
      <span className="relative z-10">{icon}</span>
      <span className="relative z-10 text-[10px] font-medium">{label}</span>
    </button>
  )
}
