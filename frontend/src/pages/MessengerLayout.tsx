import { useEffect, useState } from 'react'
import { Outlet, useNavigate, useMatch, useLocation } from 'react-router-dom'
import { chatApi } from '@/api/chat'
import { profileApi } from '@/api/auth'
import { useChatStore } from '@/store/chat'
import { useAuthStore } from '@/store/auth'
import { useSocket } from '@/hooks/useSocket'
import { NotificationPrompt } from '@/components/NotificationPrompt'
import { Spinner } from '@/components/ui/Spinner'
import { Avatar } from '@/components/ui/Avatar'
import { AnimatePresence, motion } from 'framer-motion'
import { NewChatModal } from '@/components/chat/NewChatModal'
import { CommandPalette } from '@/components/chat/CommandPalette'
import { ReminderToasts } from '@/components/chat/ReminderToasts'
import { SanctionBanner } from '@/components/SanctionBanner'
import { ChatCard } from '@/components/chat/ChatCard'
import { AiPulseStrip } from '@/components/chat/AiPulseStrip'
import { SearchResults } from '@/components/chat/SearchResults'

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

export function MessengerLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const chatMatch = useMatch('/chat/:id')
  const activeChatId = chatMatch?.params.id
  const isContactsTab = location.pathname === '/contacts'
  const isProfileTab = location.pathname === '/profile'

  const user = useAuthStore(s => s.user)
  const { chats, setChats } = useChatStore()
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showNewChat, setShowNewChat] = useState(false)
  const [showPalette, setShowPalette] = useState(false)

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

  // Авто-установка часового пояса при первом заходе (если ещё не задан).
  // Берём зону браузера; пользователь может сменить вручную в профиле.
  useEffect(() => {
    if (!user || user.timezone) return
    let tz = 'UTC'
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' } catch { /* ignore */ }
    profileApi.updateMe({ timezone: tz })
      .then(r => useAuthStore.getState().setUser(r.data.data))
      .catch(() => { /* не критично */ })
  }, [user?.id, user?.timezone])

  const totalUnread = chats.reduce((sum, c) => sum + c.unreadCount, 0)
  const searching = search.trim().length > 0

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
          {/* Профиль — только на десктопе (на мобильном есть нижняя вкладка) */}
          {user && (
            <button
              onClick={() => navigate('/profile')}
              title="Мой профиль"
              className="hidden md:flex w-10 h-10 shrink-0 items-center justify-center rounded-full transition-transform hover:scale-105"
              style={{
                outline: isProfileTab ? '2px solid #A855F7' : 'none',
                outlineOffset: '2px',
              }}
            >
              <Avatar url={user.avatarUrl} nickname={user.nickname} size={32} />
            </button>
          )}

          {/* Search bar — liquid glass */}
          <div className="flex-1 relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--accent)' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            </span>
            <input
              className="w-full rounded-full pl-10 pr-4 md:pr-14 py-2.5 text-sm outline-none transition-shadow"
              style={{
                background: 'rgba(255,255,255,0.045)',
                backdropFilter: 'blur(20px) saturate(160%)',
                WebkitBackdropFilter: 'blur(20px) saturate(160%)',
                border: '1px solid var(--glass-stroke)',
                color: 'var(--text-hi)', caretColor: '#A855F7',
              }}
              placeholder="Поиск"
              value={search}
              onFocus={e => { e.currentTarget.style.boxShadow = '0 0 0 2px var(--brand-ring)' }}
              onBlur={e => { e.currentTarget.style.boxShadow = 'none' }}
              onChange={e => setSearch(e.target.value)}
            />
            {/* ⌘K-чип бесполезен на мобильном без клавиатуры — только md+ */}
            <button
              onClick={() => setShowPalette(true)}
              title="Командная палитра"
              className="hidden md:block absolute right-2 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded-md text-[10px] font-mono transition-colors hover:bg-white/10"
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

        {/* Chat list / результаты поиска — скрыт на мобильном когда открыты Контакты */}
        <nav className={`flex-1 overflow-y-auto pb-2 ${isContactsTab ? 'hidden md:block' : ''}`}>
          <NotificationPrompt />
          {searching ? (
            <SearchResults query={search} />
          ) : loading ? (
            <div className="flex justify-center py-10"><Spinner size={20} /></div>
          ) : (
            <>
              <AiPulseStrip unread={totalUnread} onClick={() => setShowPalette(true)} />
              {chats.length === 0 ? (
                <div className="text-center py-14">
                  <p className="text-sm" style={{ color: 'rgba(255,255,255,0.2)' }}>Нет диалогов</p>
                  <button onClick={() => setShowNewChat(true)} className="mt-1.5 text-sm" style={{ color: '#A855F7' }}>
                    Начать диалог
                  </button>
                </div>
              ) : (
                chats.map(chat => (
                  <ChatCard key={chat.id} chat={chat} active={chat.partner?.id === activeChatId} />
                ))
              )}
            </>
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

      {/* Нижняя навигация — Compact Glass Dock (только мобильный, не в чате).
          Иконки в ряд; лейбл только у активной вкладки → низкая высота, без вакуума. */}
      <div className={`md:hidden shrink-0 px-3 ${activeChatId ? 'hidden' : ''}`}
        style={{ paddingBottom: 6, paddingTop: 6 }}>
        <div className="glass-dock flex items-center justify-around rounded-3xl px-1.5 py-1">
          <DockBtn
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
          <DockBtn
            label="Чаты"
            active={!isContactsTab && !isProfileTab && !activeChatId}
            onClick={() => navigate('/')}
            icon={
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
              </svg>
            }
          />
          <DockBtn
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

function DockBtn({ label, active, onClick, icon }: {
  label: string; active: boolean; onClick: () => void; icon: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="relative flex items-center justify-center gap-1.5 h-11 px-4 rounded-full transition-colors active:scale-90"
      style={{ color: active ? '#fff' : 'rgba(255,255,255,0.42)' }}
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
      {/* Лейбл показываем только у активной вкладки — компактная одноэтажная пилюля */}
      {active && (
        <motion.span layout className="relative z-10 text-[13px] font-semibold whitespace-nowrap">
          {label}
        </motion.span>
      )}
    </button>
  )
}
