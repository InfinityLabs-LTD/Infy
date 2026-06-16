import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { adminApi, AdminUserDetail } from '@/api/admin'
import { IssueSanctionModal } from './AdminModerationPage'
import { AdminDialogViewer } from '@/components/admin/AdminDialogViewer'
import { useAuthStore } from '@/store/auth'
import { Avatar } from '@/components/ui/Avatar'
import { Spinner } from '@/components/ui/Spinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'

const ONLINE_WINDOW_MS = 2 * 60_000

type Tab = 'overview' | 'messages'

export function AdminUserProfilePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
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
            {([['overview', 'Обзор'], ['messages', `Переписки`]] as [Tab, string][]).map(([t, label]) => (
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

          {tab === 'overview'
            ? <OverviewTab user={user} isMe={isMe} onDeleted={() => navigate('/admin/users')} />
            : <AdminDialogViewer userId={user.id} />}
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

function OverviewTab({ user, isMe, onDeleted }: {
  user: AdminUserDetail
  isMe: boolean
  onDeleted: () => void
}) {
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

      {/* Безопасность — смена пароля */}
      {!isMe && <SecurityCard user={user} />}

      {/* Опасная зона — удаление аккаунта */}
      {!isMe && <DangerCard user={user} onDeleted={onDeleted} />}
    </motion.div>
  )
}

// ── Безопасность: смена пароля ───────────────────────────────

function SecurityCard({ user }: { user: AdminUserDetail }) {
  const [generating, setGenerating] = useState(false)
  const [linking, setLinking] = useState(false)
  const [newPassword, setNewPassword] = useState<string | null>(null)
  const [resetLink, setResetLink] = useState<string | null>(null)
  const [copied, setCopied] = useState<'pwd' | 'link' | null>(null)
  const [error, setError] = useState<unknown>(null)

  async function generate() {
    if (!confirm(`Сгенерировать новый пароль для @${user.username}? Текущие сессии будут завершены.`)) return
    setGenerating(true); setError(null); setResetLink(null)
    try {
      const res = await adminApi.resetUserPassword(user.id)
      setNewPassword(res.data.data.password)
    } catch (e) { setError(e) }
    finally { setGenerating(false) }
  }

  async function makeLink() {
    setLinking(true); setError(null); setNewPassword(null)
    try {
      const res = await adminApi.createPasswordResetLink(user.id)
      setResetLink(res.data.data.url)
    } catch (e) { setError(e) }
    finally { setLinking(false) }
  }

  function copy(text: string, which: 'pwd' | 'link') {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(which)
      setTimeout(() => setCopied(null), 1800)
    })
  }

  return (
    <div className="glass rounded-2xl p-5 space-y-3 md:col-span-2">
      <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-low)' }}>
        Безопасность
      </p>

      {error !== null && <ErrorMessage error={error} />}

      <div className="flex flex-wrap gap-2">
        <button onClick={generate} disabled={generating}
          className="btn-ghost text-xs disabled:opacity-50"
          style={{ color: '#C084FC', border: '1px solid rgba(255,255,255,0.1)' }}>
          {generating ? <Spinner size={12} /> : 'Сгенерировать новый пароль'}
        </button>
        <button onClick={makeLink} disabled={linking}
          className="btn-ghost text-xs disabled:opacity-50"
          style={{ color: '#60A5FA', border: '1px solid rgba(255,255,255,0.1)' }}>
          {linking ? <Spinner size={12} /> : 'Ссылка для самостоятельной смены'}
        </button>
      </div>

      {newPassword && (
        <div className="rounded-xl p-3 space-y-2" style={{ background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(168,85,247,0.25)' }}>
          <p className="text-[11px]" style={{ color: 'var(--text-low)' }}>
            Новый пароль (показывается один раз — передайте пользователю):
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 font-mono text-sm text-white px-2.5 py-1.5 rounded-lg" style={{ background: 'rgba(0,0,0,0.3)' }}>
              {newPassword}
            </code>
            <button onClick={() => copy(newPassword, 'pwd')} className="btn-ghost py-1.5 px-3 text-xs">
              {copied === 'pwd' ? 'Скопировано' : 'Копировать'}
            </button>
          </div>
        </div>
      )}

      {resetLink && (
        <div className="rounded-xl p-3 space-y-2" style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(96,165,250,0.25)' }}>
          <p className="text-[11px]" style={{ color: 'var(--text-low)' }}>
            Одноразовая ссылка (действует 24 часа) — отправьте её пользователю:
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 font-mono text-[12px] text-white/90 px-2.5 py-1.5 rounded-lg truncate" style={{ background: 'rgba(0,0,0,0.3)' }}>
              {resetLink}
            </code>
            <button onClick={() => copy(resetLink, 'link')} className="btn-ghost py-1.5 px-3 text-xs shrink-0">
              {copied === 'link' ? 'Скопировано' : 'Копировать'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Опасная зона: полное удаление аккаунта ───────────────────

function DangerCard({ user, onDeleted }: { user: AdminUserDetail; onDeleted: () => void }) {
  const [open, setOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const canDelete = confirmText === user.username

  async function doDelete() {
    if (!canDelete) return
    setDeleting(true); setError(null)
    try {
      await adminApi.deleteUser(user.id)
      onDeleted()
    } catch (e) { setError(e); setDeleting(false) }
  }

  return (
    <div className="glass rounded-2xl p-5 space-y-3 md:col-span-2"
      style={{ border: '1px solid rgba(239,68,68,0.25)' }}>
      <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#EF4444' }}>
        Опасная зона
      </p>
      <p className="text-[13px]" style={{ color: 'var(--text-low)' }}>
        Полное удаление аккаунта <span className="text-white/80">@{user.username}</span> из всех баз данных:
        сообщения, личные переписки (у обоих участников), вложения, сессии и звонки. Действие необратимо.
      </p>

      {error !== null && <ErrorMessage error={error} />}

      {!open ? (
        <button onClick={() => setOpen(true)}
          className="btn-ghost text-xs"
          style={{ color: '#EF4444', border: '1px solid rgba(239,68,68,0.3)' }}>
          Удалить аккаунт навсегда
        </button>
      ) : (
        <div className="space-y-2.5">
          <p className="text-[12px]" style={{ color: 'var(--text-low)' }}>
            Для подтверждения введите имя пользователя <span className="font-mono text-white/90">{user.username}</span>:
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              placeholder={user.username}
              autoFocus
              className="flex-1 min-w-[180px] px-3 py-2 rounded-xl text-sm text-white bg-black/30 outline-none"
              style={{ border: '1px solid rgba(255,255,255,0.1)' }}
            />
            <button onClick={doDelete} disabled={!canDelete || deleting}
              className="btn-ghost text-xs disabled:opacity-40"
              style={{ color: '#fff', background: 'rgba(239,68,68,0.85)' }}>
              {deleting ? <Spinner size={12} /> : 'Удалить'}
            </button>
            <button onClick={() => { setOpen(false); setConfirmText('') }} disabled={deleting}
              className="btn-ghost text-xs disabled:opacity-40">
              Отмена
            </button>
          </div>
        </div>
      )}
    </div>
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

