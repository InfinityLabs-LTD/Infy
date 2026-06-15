import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '@/store/auth'
import { Avatar } from '@/components/ui/Avatar'

// ── Навигация ────────────────────────────────────────────────

interface NavItem {
  to?: string          // нет to → раздел ещё не реализован (чип Soon)
  label: string
  icon: React.ReactNode
}

interface NavSection {
  title?: string
  items: NavItem[]
}

function icon(paths: React.ReactNode) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {paths}
    </svg>
  )
}

const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { to: '/admin', label: 'Dashboard', icon: icon(<><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></>) },
    ],
  },
  {
    title: 'Операции',
    items: [
      { to: '/admin/users', label: 'Пользователи', icon: icon(<><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></>) },
      { label: 'Чаты', icon: icon(<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>) },
      { to: '/admin/moderation', label: 'Модерация', icon: icon(<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>) },
    ],
  },
  {
    title: 'Инфраструктура',
    items: [
      { to: '/admin/containers', label: 'Контейнеры', icon: icon(<><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/></>) },
      { label: 'Серверы', icon: icon(<><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></>) },
      { label: 'Логи', icon: icon(<><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></>) },
    ],
  },
  {
    title: 'Инсайты',
    items: [
      { to: '/admin/analytics', label: 'Аналитика', icon: icon(<><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></>) },
      { to: '/admin/ai', label: 'AI Center', icon: icon(<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3zM19 17l.9 2.1L22 20l-2.1.9L19 23l-.9-2.1L16 20l2.1-.9L19 17z"/>) },
      { to: '/admin/payments', label: 'Платежи', icon: icon(<><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></>) },
    ],
  },
  {
    items: [
      { label: 'Настройки', icon: icon(<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 008.6 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 8.6a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9c.26.604.852.997 1.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"/></>) },
    ],
  },
]

// ── Содержимое сайдбара (общее для desktop-панели и mobile-sheet) ──

function SidebarContent({ variant, onNavigate }: {
  variant: 'desktop' | 'sheet'
  onNavigate?: () => void
}) {
  const navigate = useNavigate()
  const user = useAuthStore(s => s.user)
  const logout = useAuthStore(s => s.logout)

  // В sheet всегда полная ширина; в desktop-панели подписи скрываются на md (icon-rail)
  const expanded = variant === 'sheet'
  const labelCls = expanded ? 'inline' : 'hidden lg:inline'
  const blockCls = expanded ? 'block' : 'hidden lg:block'
  const rowJustify = expanded ? '' : 'justify-center lg:justify-start'

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Логотип */}
      <div className={`flex items-center gap-2.5 px-3 py-4 shrink-0 ${rowJustify}`}>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: 'var(--grad-own)', boxShadow: 'var(--glow-primary)' }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
          </svg>
        </div>
        <div className={`${blockCls} min-w-0`}>
          <p className="font-display font-bold text-white text-[15px] leading-tight">Infy Admin</p>
          <p className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--text-low)' }}>Aurora Control</p>
        </div>
      </div>

      {/* Навигация */}
      <nav className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-2 pb-2 space-y-4">
        {NAV_SECTIONS.map((section, si) => (
          <div key={si}>
            {section.title && (
              <p className={`${blockCls} px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-widest`}
                style={{ color: 'var(--text-low)' }}>
                {section.title}
              </p>
            )}
            <div className="space-y-0.5">
              {section.items.map(item => item.to ? (
                <NavLink key={item.label} to={item.to} end={item.to === '/admin'} onClick={onNavigate}
                  className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium ${rowJustify}`}>
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <motion.span
                          layoutId={`admin-nav-active-${variant}`}
                          className="absolute inset-0 rounded-xl"
                          style={{ background: 'var(--glass-3)', boxShadow: 'inset 3px 0 0 var(--accent)' }}
                          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                        />
                      )}
                      <span className="relative z-10 shrink-0 transition-colors"
                        style={{ color: isActive ? '#C084FC' : 'rgba(255,255,255,0.55)' }}>
                        {item.icon}
                      </span>
                      <span className={`${labelCls} relative z-10 flex-1 transition-colors`}
                        style={{ color: isActive ? '#fff' : 'rgba(255,255,255,0.65)' }}>
                        {item.label}
                      </span>
                    </>
                  )}
                </NavLink>
              ) : (
                <div key={item.label} title={`${item.label} — скоро`}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium opacity-35 cursor-default select-none ${rowJustify}`}>
                  <span className="shrink-0" style={{ color: 'rgba(255,255,255,0.55)' }}>{item.icon}</span>
                  <span className={`${labelCls} flex-1`} style={{ color: 'rgba(255,255,255,0.65)' }}>{item.label}</span>
                  <span className={`${labelCls} text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full shrink-0`}
                    style={{ background: 'rgba(168,85,247,0.18)', color: '#C084FC' }}>
                    Soon
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Карточка администратора */}
      <div className="p-2.5 shrink-0">
        <div className={`glass rounded-2xl p-2.5 flex items-center gap-2.5 ${expanded ? '' : 'flex-col lg:flex-row'}`}>
          <Avatar url={user?.avatarUrl ?? null} nickname={user?.nickname ?? '?'} size={36} />
          <div className={`${blockCls} flex-1 min-w-0`}>
            <p className="text-sm font-semibold text-white truncate leading-tight">{user?.nickname}</p>
            <p className="text-[11px]" style={{ color: '#C084FC' }}>Администратор</p>
          </div>
          <div className={`flex shrink-0 gap-0.5 ${expanded ? '' : 'flex-col lg:flex-row'}`}>
            <button onClick={() => navigate('/')} title="В приложение"
              className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors hover:bg-white/10"
              style={{ color: 'rgba(255,255,255,0.5)' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
              </svg>
            </button>
            <button onClick={logout} title="Выйти"
              className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors hover:bg-white/10"
              style={{ color: '#EF4444' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
                <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Каркас ───────────────────────────────────────────────────

export function AdminLayout() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="flex flex-col md:flex-row" style={{ height: '100dvh', background: 'var(--bg-deep)' }}>
      {/* Мобильный топ-бар */}
      <div className="md:hidden shrink-0 flex items-center gap-2 px-2 py-2"
        style={{
          background: 'rgba(8,11,22,0.7)',
          backdropFilter: 'blur(24px) saturate(140%)',
          WebkitBackdropFilter: 'blur(24px) saturate(140%)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}>
        <button onClick={() => setMenuOpen(true)}
          className="w-10 h-10 flex items-center justify-center rounded-full transition-colors hover:bg-white/10"
          style={{ color: 'rgba(255,255,255,0.6)' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ background: 'var(--grad-own)' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
          </svg>
        </div>
        <p className="font-display font-bold text-white text-sm">Infy Admin</p>
      </div>

      {/* Сайдбар: icon-rail на планшете (md), полный на десктопе (lg+) */}
      <aside className="hidden md:flex md:w-16 lg:w-60 shrink-0 flex-col glass-panel"
        style={{ borderRight: '1px solid rgba(255,255,255,0.06)' }}>
        <SidebarContent variant="desktop" />
      </aside>

      {/* Мобильный sheet */}
      <AnimatePresence>
        {menuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="fixed inset-0 z-40 md:hidden"
              style={{ background: 'rgba(8,11,22,0.6)', backdropFilter: 'blur(4px)' }}
              onClick={() => setMenuOpen(false)}
            />
            <motion.aside
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ type: 'spring', stiffness: 300, damping: 32 }}
              className="fixed left-0 top-0 bottom-0 z-50 w-[280px] flex flex-col md:hidden"
              style={{
                background: 'rgba(13,17,35,0.92)',
                backdropFilter: 'blur(40px) saturate(150%)',
                WebkitBackdropFilter: 'blur(40px) saturate(150%)',
                borderRight: '1px solid rgba(255,255,255,0.08)',
              }}>
              <SidebarContent variant="sheet" onNavigate={() => setMenuOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Контент */}
      <main className="flex-1 min-w-0 min-h-0 overflow-y-auto chat-bg">
        <div className="mx-auto w-full max-w-[1320px]">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
