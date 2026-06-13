import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { adminApi, AdminMessage, AdminUserDetail } from '@/api/admin'
import { IssueSanctionModal } from './AdminModerationPage'
import { useAuthStore } from '@/store/auth'
import { Avatar } from '@/components/ui/Avatar'
import { Spinner } from '@/components/ui/Spinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'

const ONLINE_WINDOW_MS = 2 * 60_000

type Tab = 'overview' | 'messages'

export function AdminUserProfilePage() {
  const { id } = useParams<{ id: string }>()
  const myId = useAuthStore(s => s.user?.id)
  const [searchParams, setSearchParams] = useSearchParams()
  const tab: Tab = searchParams.get('tab') === 'messages' ? 'messages' : 'overview'

  const [user, setUser] = useState<AdminUserDetail | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [savingRole, setSavingRole] = useState(false)
  const [showSanction, setShowSanction] = useState(false)

  useEffect(() => {
    if (!id) return
    setUser(null)
    adminApi.getUser(id)
      .then(r => setUser(r.data.data))
      .catch(e => setError(e))
  }, [id])

  const isMe = user?.id === myId
  const isAdmin = user?.role === 'ADMIN'
  const isOnline = user ? Date.now() - new Date(user.lastSeenAt).getTime() < ONLINE_WINDOW_MS : false

  async function toggleRole() {
    if (!user) return
    const nextRole = isAdmin ? 'USER' : 'ADMIN'
    const label = isAdmin
      ? `Снять права администратора у @${user.username}?`
      : `Назначить @${user.username} администратором?`
    if (!confirm(label)) return
    setSavingRole(true)
    try {
      const res = await adminApi.updateUser(user.id, { role: nextRole })
      setUser(prev => prev ? { ...prev, role: res.data.data.role } : prev)
    } catch { /* ignore */ }
    finally { setSavingRole(false) }
  }

  function setTab(t: Tab) {
    setSearchParams(t === 'overview' ? {} : { tab: t }, { replace: true })
  }

  return (
    <div className="p-4 md:p-6">
      {/* Хлебная крошка */}
      <Link to="/admin/users"
        className="inline-flex items-center gap-1.5 text-sm mb-4 transition-colors hover:text-white"
        style={{ color: 'var(--text-low)' }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M19 12H5M12 5l-7 7 7 7"/>
        </svg>
        Пользователи
      </Link>

      {error !== null && <div className="mb-4"><ErrorMessage error={error} /></div>}

      {!user && error === null ? (
        <div className="space-y-3">
          <div className="glass rounded-2xl h-[120px] animate-pulse" />
          <div className="glass rounded-2xl h-[180px] animate-pulse opacity-60" />
        </div>
      ) : user && (
        <>
          {/* Шапка профиля */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            className="glass rounded-2xl overflow-hidden mb-3"
          >
            <div className="h-16" style={{ background: 'linear-gradient(135deg, rgba(76,29,149,0.5) 0%, rgba(124,58,237,0.35) 55%, rgba(168,85,247,0.2) 100%)' }} />
            <div className="px-5 pb-5 -mt-8 flex flex-col sm:flex-row sm:items-end gap-4">
              <div className="relative shrink-0 w-fit">
                <div className="rounded-2xl overflow-hidden" style={{ border: '3px solid #0B1020' }}>
                  <Avatar url={user.avatarUrl} nickname={user.nickname} size={72} rounded="2xl" />
                </div>
                {isOnline && (
                  <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full"
                    style={{ background: '#22C55E', border: '3px solid #0B1020' }} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="font-display text-xl font-bold text-white truncate">{user.nickname}</h1>
                  {isAdmin && (
                    <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider"
                      style={{ background: 'rgba(168,85,247,0.18)', color: '#C084FC', border: '1px solid rgba(168,85,247,0.35)' }}>
                      Admin
                    </span>
                  )}
                  {isMe && <span className="text-xs" style={{ color: 'var(--text-low)' }}>(вы)</span>}
                </div>
                <p className="text-sm" style={{ color: 'var(--text-low)' }}>
                  @{user.username}
                  <span className="mx-1.5">·</span>
                  <span style={{ color: isOnline ? '#22C55E' : 'var(--text-low)' }}>
                    {isOnline ? 'в сети' : `был(а) ${new Date(user.lastSeenAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`}
                  </span>
                </p>
              </div>
              {!isMe && (
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => setShowSanction(true)}
                    className="btn-ghost text-xs"
                    style={{ color: '#F59E0B', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                    Санкция
                  </button>
                  <button onClick={toggleRole} disabled={savingRole}
                    className="btn-ghost text-xs disabled:opacity-50"
                    style={{ color: isAdmin ? '#EF4444' : '#C084FC', border: '1px solid rgba(255,255,255,0.1)' }}>
                    {savingRole ? <Spinner size={12} /> : isAdmin ? 'Снять права админа' : 'Назначить админом'}
                  </button>
                </div>
              )}
            </div>
          </motion.div>

          {/* Табы */}
          <div className="flex gap-1 mb-3">
            {([['overview', 'Обзор'], ['messages', `Сообщения`]] as [Tab, string][]).map(([t, label]) => (
              <button key={t} onClick={() => setTab(t)}
                className="relative px-4 py-2 rounded-xl text-sm font-medium transition-colors"
                style={{
                  background: tab === t ? 'var(--glass-3)' : 'transparent',
                  color: tab === t ? '#fff' : 'rgba(255,255,255,0.5)',
                }}>
                {label}
              </button>
            ))}
          </div>

          {tab === 'overview' ? <OverviewTab user={user} /> : <MessagesTab userId={user.id} />}
        </>
      )}

      <AnimatePresence>
        {showSanction && user && (
          <IssueSanctionModal
            presetUser={{ id: user.id, nickname: user.nickname, username: user.username, avatarUrl: user.avatarUrl }}
            onClose={() => setShowSanction(false)}
            onIssued={() => setShowSanction(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Обзор ────────────────────────────────────────────────────

function OverviewTab({ user }: { user: AdminUserDetail }) {
  const stats = [
    { label: 'Сообщений', value: user._count.messages },
    { label: 'Чатов', value: user._count.chatMemberships },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
      className="grid md:grid-cols-2 gap-3"
    >
      {/* Статистика */}
      <div className="grid grid-cols-2 gap-3 content-start">
        {stats.map(s => (
          <div key={s.label} className="glass rounded-2xl p-4">
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-low)' }}>
              {s.label}
            </p>
            <p className="font-display text-[28px] font-bold leading-none text-white">
              {s.value.toLocaleString('ru-RU')}
            </p>
          </div>
        ))}
      </div>

      {/* Аккаунт */}
      <div className="glass rounded-2xl p-5 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-low)' }}>
          Аккаунт
        </p>
        <InfoRow label="Email" value={user.email ?? '—'}
          extra={user.emailVerifiedAt ? (
            <span className="inline-flex items-center gap-1 text-xs" style={{ color: '#22C55E' }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              подтверждён
            </span>
          ) : undefined} />
        <InfoRow label="День рождения"
          value={user.birthdate ? new Date(user.birthdate).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'} />
        <InfoRow label="Регистрация"
          value={new Date(user.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })} />
        <InfoRow label="Последняя активность"
          value={new Date(user.lastSeenAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} />
        <InfoRow label="ID" value={user.id} mono />
      </div>
    </motion.div>
  )
}

function InfoRow({ label, value, extra, mono }: {
  label: string
  value: string
  extra?: React.ReactNode
  mono?: boolean
}) {
  return (
    <div className="flex items-center gap-3 text-sm pb-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <span className="w-40 shrink-0" style={{ color: 'var(--text-low)' }}>{label}</span>
      <span className={`text-white/90 truncate ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
      {extra}
    </div>
  )
}

// ── Сообщения ────────────────────────────────────────────────

const TYPE_ICON: Record<string, string> = {
  TEXT: '💬', IMAGE: '🖼️', VIDEO: '🎥', AUDIO: '🎤', CIRCLE_VIDEO: '⭕',
}

function MessagesTab({ userId }: { userId: string }) {
  const [messages, setMessages] = useState<AdminMessage[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)

  async function load(p: number) {
    setLoading(true)
    setError(null)
    try {
      const res = await adminApi.getUserMessages(userId, { page: p, limit: 50 })
      const d = res.data.data
      setMessages(d.messages)
      setTotal(d.total)
      setPage(d.page)
      setPages(d.pages)
    } catch (e) { setError(e) }
    finally { setLoading(false) }
  }

  useEffect(() => { load(1) }, [userId])

  if (error !== null) return <ErrorMessage error={error} />

  if (loading && messages.length === 0) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map(i => (
          <div key={i} className="glass rounded-2xl h-[56px] animate-pulse" style={{ opacity: 1 - i * 0.2 }} />
        ))}
      </div>
    )
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-14">
        <div className="w-14 h-14 rounded-full flex items-center justify-center mb-3"
          style={{ background: 'rgba(124,58,237,0.15)' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#A855F7" strokeWidth="1.5">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
          </svg>
        </div>
        <p className="text-sm" style={{ color: 'var(--text-low)' }}>Нет сообщений</p>
      </div>
    )
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 32 }}>
      <p className="text-xs mb-2 px-1" style={{ color: 'var(--text-low)' }}>{total} всего</p>
      <div className="space-y-1.5">
        {messages.map(m => (
          <div key={m.id} className="glass rounded-xl px-3.5 py-2.5 flex items-center gap-3 transition-colors hover:bg-white/[0.06]">
            <span className="text-base shrink-0">{TYPE_ICON[m.type] ?? '?'}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white/90 truncate">
                {m.content ?? (m.attachments.length > 0 ? `[${m.type.toLowerCase()}]` : '—')}
              </p>
              {m.attachments.length > 0 && (
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-low)' }}>
                  {m.attachments[0].mimeType}
                  {m.attachments[0].sizeBytes ? ` · ${(m.attachments[0].sizeBytes / 1024).toFixed(0)} КБ` : ''}
                </p>
              )}
            </div>
            <p className="text-[11px] font-mono shrink-0 hidden sm:block" style={{ color: 'rgba(255,255,255,0.25)' }}>
              {m.chat.id.slice(0, 8)}
            </p>
            <p className="text-[11px] shrink-0 whitespace-nowrap" style={{ color: 'var(--text-low)' }}>
              {new Date(m.createdAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        ))}
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-between px-1 py-4">
          <p className="text-xs" style={{ color: 'var(--text-low)' }}>Страница {page} из {pages}</p>
          <div className="flex gap-1">
            <button onClick={() => load(page - 1)} disabled={page <= 1 || loading}
              className="btn-ghost py-1 px-3 text-xs disabled:opacity-40">← Назад</button>
            <button onClick={() => load(page + 1)} disabled={page >= pages || loading}
              className="btn-ghost py-1 px-3 text-xs disabled:opacity-40">Далее →</button>
          </div>
        </div>
      )}
    </motion.div>
  )
}
