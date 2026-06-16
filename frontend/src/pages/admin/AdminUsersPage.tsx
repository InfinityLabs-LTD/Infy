import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { adminApi, AdminUser } from '@/api/admin'
import { useAuthStore } from '@/store/auth'
import { Avatar } from '@/components/ui/Avatar'
import { Spinner } from '@/components/ui/Spinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'

const ONLINE_WINDOW_MS = 2 * 60_000

function lastSeenLabel(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < ONLINE_WINDOW_MS) return 'в сети'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} мин. назад`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} ч. назад`
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

export function AdminUsersPage() {
  const myId = useAuthStore(s => s.user?.id)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const isFirstLoad = useRef(true)

  const load = useCallback(async (p: number, q: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await adminApi.listUsers({ page: p, limit: 50, search: q || undefined })
      const d = res.data.data
      setUsers(d.users)
      setTotal(d.total)
      setPage(d.page)
      setPages(d.pages)
    } catch (e) { setError(e) }
    finally { setLoading(false) }
  }, [])

  // Живой поиск с debounce; первый рендер грузит сразу
  useEffect(() => {
    if (isFirstLoad.current) {
      isFirstLoad.current = false
      load(1, '')
      return
    }
    const t = setTimeout(() => load(1, search), 300)
    return () => clearTimeout(t)
  }, [search, load])

  function updateUserInList(updated: AdminUser) {
    setUsers(prev => prev.map(u => u.id === updated.id ? { ...u, ...updated } : u))
  }

  return (
    <div className="p-4 md:p-6">
      {/* Заголовок */}
      <div className="flex items-center gap-3 mb-5">
        <h1 className="font-display text-xl font-bold text-white">Пользователи</h1>
        <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
          style={{ background: 'rgba(168,85,247,0.15)', color: '#C084FC' }}>
          {total}
        </span>
      </div>

      {/* Живой поиск */}
      <div className="relative max-w-md mb-5">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'rgba(255,255,255,0.3)' }}>
          {loading && !isFirstLoad.current ? <Spinner size={14} /> : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          )}
        </span>
        <input
          className="input pl-10 pr-9 rounded-full"
          placeholder="Поиск по имени, нику или email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && (
          <button onClick={() => setSearch('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full transition-colors hover:bg-white/10"
            style={{ color: 'rgba(255,255,255,0.4)' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        )}
      </div>

      {error !== null && <div className="mb-4"><ErrorMessage error={error} /></div>}

      {/* Список */}
      {loading && users.length === 0 ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className="glass rounded-2xl h-[68px] animate-pulse" style={{ opacity: 1 - i * 0.15 }} />
          ))}
        </div>
      ) : users.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="w-14 h-14 rounded-full flex items-center justify-center mb-3"
            style={{ background: 'rgba(124,58,237,0.15)' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#A855F7" strokeWidth="1.5">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </div>
          <p className="text-sm" style={{ color: 'var(--text-low)' }}>
            {search ? <>По запросу «{search}» никого не нашлось</> : 'Нет пользователей'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {users.map((u, i) => (
            <UserRow key={u.id} user={u} index={i} isMe={u.id === myId} onUpdated={updateUserInList} />
          ))}
        </div>
      )}

      {/* Пагинация */}
      {pages > 1 && (
        <div className="flex items-center justify-between px-1 py-4">
          <p className="text-xs" style={{ color: 'var(--text-low)' }}>Страница {page} из {pages}</p>
          <div className="flex gap-1">
            <button onClick={() => load(page - 1, search)} disabled={page <= 1}
              className="btn-ghost py-1 px-3 text-xs disabled:opacity-40">← Назад</button>
            <button onClick={() => load(page + 1, search)} disabled={page >= pages}
              className="btn-ghost py-1 px-3 text-xs disabled:opacity-40">Далее →</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Строка пользователя ──────────────────────────────────────

function UserRow({ user: u, index, isMe, onUpdated }: {
  user: AdminUser
  index: number
  isMe: boolean
  onUpdated: (u: AdminUser) => void
}) {
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [savingRole, setSavingRole] = useState(false)

  const isOnline = Date.now() - new Date(u.lastSeenAt).getTime() < ONLINE_WINDOW_MS
  const isAdmin = u.role === 'ADMIN'

  async function toggleRole() {
    setMenuOpen(false)
    const nextRole = isAdmin ? 'USER' : 'ADMIN'
    const label = isAdmin
      ? `Снять права администратора у @${u.username}?`
      : `Назначить @${u.username} администратором?`
    if (!confirm(label)) return
    setSavingRole(true)
    try {
      const res = await adminApi.updateUser(u.id, { role: nextRole })
      onUpdated(res.data.data)
    } catch { /* строка не изменится */ }
    finally { setSavingRole(false) }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 32, delay: Math.min(index * 0.025, 0.3) }}
      className="relative glass rounded-2xl px-3.5 py-3 flex items-center gap-3 transition-colors hover:bg-white/[0.06]"
    >
      {/* Аватар + имя + ник — клик ведёт на профиль */}
      <button
        onClick={() => navigate(`/admin/users/${u.id}`)}
        className="flex items-center gap-3 flex-1 min-w-0 text-left"
      >
        <div className="relative shrink-0">
          <Avatar url={u.avatarUrl} nickname={u.nickname} size={44} />
          {isOnline && (
            <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full"
              style={{ background: '#22C55E', boxShadow: '0 0 0 2px #0B1020' }} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <p className="text-sm font-semibold text-white truncate">{u.nickname}</p>
            {isAdmin && (
              <span className="shrink-0 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider"
                style={{ background: 'rgba(168,85,247,0.18)', color: '#C084FC', border: '1px solid rgba(168,85,247,0.35)' }}>
                Admin
              </span>
            )}
            {isMe && (
              <span className="shrink-0 text-[10px]" style={{ color: 'var(--text-low)' }}>(вы)</span>
            )}
          </div>
          <p className="text-xs truncate" style={{ color: 'var(--text-low)' }}>@{u.username}</p>
        </div>
      </button>

      {/* Статус */}
      <div className="hidden sm:block w-28 shrink-0 text-right sm:text-left">
        <p className="text-xs" style={{ color: isOnline ? '#22C55E' : 'var(--text-low)' }}>
          {lastSeenLabel(u.lastSeenAt)}
        </p>
      </div>

      {/* Email */}
      <div className="hidden md:flex w-52 shrink-0 items-center gap-1.5 min-w-0">
        {u.email ? (
          <>
            <p className="text-xs truncate" style={{ color: 'var(--text-mid)' }}>{u.email}</p>
            {u.emailVerifiedAt && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2.5" className="shrink-0">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            )}
          </>
        ) : (
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>без email</p>
        )}
      </div>

      {/* Регистрация */}
      <div className="hidden xl:block w-24 shrink-0">
        <p className="text-xs" style={{ color: 'var(--text-low)' }}>
          {new Date(u.createdAt).toLocaleDateString('ru-RU')}
        </p>
      </div>

      {/* Действия */}
      <div className="relative shrink-0">
        <button
          onClick={() => setMenuOpen(v => !v)}
          className="w-9 h-9 flex items-center justify-center rounded-full transition-colors hover:bg-white/10"
          style={{ color: menuOpen ? '#C084FC' : 'rgba(255,255,255,0.45)' }}
          title="Действия">
          {savingRole ? <Spinner size={14} /> : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>
            </svg>
          )}
        </button>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 480, damping: 32 }}
              className="absolute right-0 top-11 z-40 w-56 rounded-2xl overflow-hidden"
              style={{
                transformOrigin: 'top right',
                // Сплошной фон без backdrop-filter: внутри трансформируемой
                // строки (framer-motion) backdrop-blur в WebKit ломается и
                // меню выглядит как размытый прямоугольник без текста.
                background: '#161a26',
                border: '1px solid var(--glass-stroke)',
                boxShadow: 'var(--shadow-float), inset 0 1px 0 rgba(255,255,255,0.08)',
              }}
            >
              <MenuItem
                label="Открыть профиль"
                onClick={() => { setMenuOpen(false); navigate(`/admin/users/${u.id}`) }}
                icon={
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
                  </svg>
                }
              />
              <MenuItem
                label="Сообщения"
                onClick={() => { setMenuOpen(false); navigate(`/admin/users/${u.id}?tab=messages`) }}
                icon={
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                  </svg>
                }
              />
              {!isMe && (
                <MenuItem
                  label={isAdmin ? 'Снять права админа' : 'Назначить админом'}
                  onClick={toggleRole}
                  danger={isAdmin}
                  icon={
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                    </svg>
                  }
                />
              )}
            </motion.div>
          </>
        )}
      </div>
    </motion.div>
  )
}

function MenuItem({ label, onClick, icon, danger }: {
  label: string
  onClick: () => void
  icon: React.ReactNode
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left transition-colors hover:bg-white/[0.07]"
      style={{ color: danger ? '#EF4444' : 'rgba(255,255,255,0.8)' }}
    >
      <span style={{ color: danger ? '#EF4444' : 'rgba(255,255,255,0.45)' }}>{icon}</span>
      {label}
    </button>
  )
}
