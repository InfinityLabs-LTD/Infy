import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  adminApi, Sanction, SanctionType, SanctionsResponse,
  Report, ReportCategory, ReportStatus, ReportsResponse,
} from '@/api/admin'
import { profileApi } from '@/api/auth'
import { useAuthStore } from '@/store/auth'
import { Avatar } from '@/components/ui/Avatar'
import { apiBaseUrl } from '@/lib/origin'
import { Spinner } from '@/components/ui/Spinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'

const TYPE_META: Record<SanctionType, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  WARN: {
    label: 'Предупреждение', color: '#F59E0B', bg: 'rgba(245,158,11,0.15)',
    icon: <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01" />,
  },
  MUTE: {
    label: 'Мут', color: '#A855F7', bg: 'rgba(168,85,247,0.15)',
    icon: <><path d="M11 5L6 9H2v6h4l5 4V5z" /><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" /></>,
  },
  BAN: {
    label: 'Бан', color: '#EF4444', bg: 'rgba(239,68,68,0.15)',
    icon: <><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></>,
  },
}

export function AdminModerationPage() {
  const [tab, setTab] = useState<'sanctions' | 'reports'>('reports')
  const [pendingCount, setPendingCount] = useState(0)

  // Подгружаем счётчик неразобранных жалоб для бейджа на вкладке.
  useEffect(() => {
    adminApi.listReports('PENDING')
      .then(r => setPendingCount(r.data.data.counts.pending))
      .catch(() => {})
  }, [tab])

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: 'var(--grad-own)', boxShadow: 'var(--glow-primary)' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </div>
        <div>
          <h1 className="font-display text-xl font-bold text-white leading-tight">Infy Shield</h1>
          <p className="text-xs" style={{ color: 'var(--text-low)' }}>Центр модерации и безопасности</p>
        </div>
      </div>

      {/* Верхние вкладки */}
      <div className="flex gap-1 mb-4">
        {([['reports', 'Жалобы'], ['sanctions', 'Санкции']] as ['sanctions' | 'reports', string][]).map(([v, label]) => (
          <button key={v} onClick={() => setTab(v)}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-2"
            style={{
              background: tab === v ? 'var(--glass-3)' : 'transparent',
              color: tab === v ? '#fff' : 'rgba(255,255,255,0.5)',
            }}>
            {label}
            {v === 'reports' && pendingCount > 0 && (
              <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: 'rgba(239,68,68,0.2)', color: '#fca5a5' }}>{pendingCount}</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'sanctions'
        ? <SanctionsView />
        : <ReportsView onCountChange={setPendingCount} />}
    </div>
  )
}

// ── Вкладка: санкции ─────────────────────────────────────────

function SanctionsView() {
  const [data, setData] = useState<SanctionsResponse | null>(null)
  const [statusFilter, setStatusFilter] = useState<'active' | 'all'>('active')
  const [error, setError] = useState<unknown>(null)
  const [showIssue, setShowIssue] = useState(false)

  function load() {
    adminApi.listSanctions(statusFilter)
      .then(r => setData(r.data.data))
      .catch(e => setError(e))
  }

  useEffect(() => { setData(null); load() }, [statusFilter])

  async function revoke(s: Sanction) {
    if (!confirm(`Снять санкцию «${TYPE_META[s.type].label}» с @${s.user.username}?`)) return
    try {
      await adminApi.revokeSanction(s.id)
      load()
    } catch { /* ignore */ }
  }

  return (
    <div>
      <div className="flex items-center mb-1.5">
        <button onClick={() => setShowIssue(true)} className="btn-primary text-sm ml-auto">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Выдать санкцию
        </button>
      </div>

      {error !== null && <div className="my-4"><ErrorMessage error={error} /></div>}

      {!data && error === null ? (
        <div className="mt-5 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            {[0, 1, 2].map(i => <div key={i} className="glass rounded-2xl h-[88px] animate-pulse" style={{ opacity: 1 - i * 0.2 }} />)}
          </div>
          <div className="glass rounded-2xl h-[200px] animate-pulse" />
        </div>
      ) : data && (
        <>
          {/* KPI по типам */}
          <div className="grid grid-cols-3 gap-3 mt-5 mb-3">
            {(['WARN', 'MUTE', 'BAN'] as SanctionType[]).map((t, i) => (
              <motion.div key={t}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 380, damping: 32, delay: i * 0.05 }}
                className="glass rounded-2xl p-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={TYPE_META[t].color} strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round">{TYPE_META[t].icon}</svg>
                  <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-low)' }}>
                    {TYPE_META[t].label}
                  </p>
                </div>
                <p className="font-display text-[28px] font-bold leading-none text-white">
                  {data.activeByType[t] ?? 0}
                </p>
                <p className="text-[11px] mt-1.5" style={{ color: 'var(--text-low)' }}>активных</p>
              </motion.div>
            ))}
          </div>

          {/* Фильтр */}
          <div className="flex gap-1 mb-3">
            {([['active', 'Активные'], ['all', 'Все']] as ['active' | 'all', string][]).map(([v, label]) => (
              <button key={v} onClick={() => setStatusFilter(v)}
                className="px-4 py-2 rounded-xl text-sm font-medium transition-colors"
                style={{
                  background: statusFilter === v ? 'var(--glass-3)' : 'transparent',
                  color: statusFilter === v ? '#fff' : 'rgba(255,255,255,0.5)',
                }}>
                {label}
              </button>
            ))}
          </div>

          {/* Список санкций */}
          {data.sanctions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-14 h-14 rounded-full flex items-center justify-center mb-3"
                style={{ background: 'rgba(34,197,94,0.12)' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="1.5">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><polyline points="9 12 11 14 15 10" />
                </svg>
              </div>
              <p className="text-sm" style={{ color: 'var(--text-low)' }}>
                {statusFilter === 'active' ? 'Нет активных санкций — всё спокойно' : 'История санкций пуста'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {data.sanctions.map((s, i) => (
                <SanctionRow key={s.id} sanction={s} index={i} onRevoke={() => revoke(s)} />
              ))}
            </div>
          )}
        </>
      )}

      <AnimatePresence>
        {showIssue && (
          <IssueSanctionModal
            onClose={() => setShowIssue(false)}
            onIssued={() => { setShowIssue(false); load() }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Строка санкции ───────────────────────────────────────────

function SanctionRow({ sanction: s, index, onRevoke }: {
  sanction: Sanction; index: number; onRevoke: () => void
}) {
  const meta = TYPE_META[s.type]
  const now = Date.now()
  const isRevoked = !!s.revokedAt
  const isExpired = !!s.expiresAt && new Date(s.expiresAt).getTime() <= now
  const isActive = !isRevoked && !isExpired

  let statusLabel = 'бессрочно'
  if (isRevoked) statusLabel = 'снята'
  else if (isExpired) statusLabel = 'истекла'
  else if (s.expiresAt) statusLabel = `до ${new Date(s.expiresAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 32, delay: Math.min(index * 0.025, 0.3) }}
      className="glass rounded-2xl px-4 py-3 flex items-center gap-3"
      style={{ opacity: isActive ? 1 : 0.55 }}
    >
      {/* Иконка типа */}
      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: meta.bg }}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={meta.color} strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round">{meta.icon}</svg>
      </div>

      {/* Цель + причина */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <Link to={`/admin/users/${s.user.id}`} className="flex items-center gap-1.5 min-w-0 group">
            <Avatar url={s.user.avatarUrl} nickname={s.user.nickname} size={20} />
            <span className="text-sm font-semibold text-white truncate group-hover:underline">{s.user.nickname}</span>
          </Link>
          <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full shrink-0"
            style={{ background: meta.bg, color: meta.color }}>{meta.label}</span>
        </div>
        <p className="text-xs truncate mt-0.5" style={{ color: 'var(--text-mid)' }}>{s.reason}</p>
      </div>

      {/* Статус + кем */}
      <div className="hidden sm:block w-44 shrink-0 text-right">
        <p className="text-xs" style={{ color: isActive ? meta.color : 'var(--text-low)' }}>{statusLabel}</p>
        <p className="text-[11px] truncate" style={{ color: 'var(--text-low)' }}>
          от @{s.issuedBy.username} · {new Date(s.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
        </p>
      </div>

      {/* Снять */}
      {isActive && (
        <button onClick={onRevoke} title="Снять санкцию"
          className="w-9 h-9 flex items-center justify-center rounded-full transition-colors hover:bg-white/10 shrink-0"
          style={{ color: 'rgba(255,255,255,0.45)' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 6h18M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6M10 11v6M14 11v6" />
          </svg>
        </button>
      )}
    </motion.div>
  )
}

// ── Модалка выдачи санкции ───────────────────────────────────

const DURATIONS = [
  { label: 'Бессрочно', hours: null },
  { label: '1 час', hours: 1 },
  { label: '1 день', hours: 24 },
  { label: '7 дней', hours: 168 },
  { label: '30 дней', hours: 720 },
]

export function IssueSanctionModal({ onClose, onIssued, presetUser }: {
  onClose: () => void
  onIssued: () => void
  presetUser?: { id: string; nickname: string; username: string; avatarUrl: string | null }
}) {
  const [username, setUsername] = useState('')
  const [foundUser, setFoundUser] = useState<{ id: string; nickname: string; username: string; avatarUrl: string | null } | null>(presetUser ?? null)
  const [searching, setSearching] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [type, setType] = useState<SanctionType>('WARN')
  const [reason, setReason] = useState('')
  const [durationHours, setDurationHours] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function findUser() {
    const u = username.trim().replace(/^@/, '')
    if (u.length < 3) return
    setSearching(true); setNotFound(false); setFoundUser(null)
    try {
      const r = await profileApi.getByUsername(u)
      setFoundUser({ id: r.data.data.id, nickname: r.data.data.nickname, username: r.data.data.username, avatarUrl: r.data.data.avatarUrl })
    } catch {
      setNotFound(true)
    } finally {
      setSearching(false)
    }
  }

  async function submit() {
    if (!foundUser || !reason.trim()) { setError('Заполните пользователя и причину'); return }
    setSaving(true); setError(null)
    try {
      await adminApi.createSanction({
        userId: foundUser.id,
        type,
        reason: reason.trim(),
        durationHours: type === 'WARN' ? null : durationHours,
      })
      onIssued()
    } catch (e) {
      const err = e as { response?: { data?: { error?: { message?: string } } } }
      setError(err.response?.data?.error?.message ?? 'Не удалось выдать санкцию')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end md:items-center justify-center" onClick={onClose}>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0" style={{ background: 'rgba(8,11,22,0.6)', backdropFilter: 'blur(4px)' }} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: 'spring', stiffness: 360, damping: 30 }}
        className="glass-pop relative w-full md:w-[440px] max-h-[90vh] overflow-y-auto rounded-t-3xl md:rounded-3xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <h2 className="font-display text-base font-bold text-white flex-1">Выдать санкцию</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
            style={{ color: 'rgba(255,255,255,0.5)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Пользователь */}
          <div>
            <label className="label">Пользователь</label>
            {foundUser ? (
              <div className="flex items-center gap-2.5 glass rounded-xl px-3 py-2.5">
                <Avatar url={foundUser.avatarUrl} nickname={foundUser.nickname} size={32} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{foundUser.nickname}</p>
                  <p className="text-xs truncate" style={{ color: 'var(--text-low)' }}>@{foundUser.username}</p>
                </div>
                <button onClick={() => { setFoundUser(null); setUsername('') }}
                  className="text-xs transition-colors hover:text-white" style={{ color: 'var(--text-low)' }}>
                  Сменить
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input className="input flex-1" placeholder="@username"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') findUser() }} />
                <button onClick={findUser} disabled={searching || username.trim().length < 3}
                  className="btn-ghost px-4 text-sm disabled:opacity-40" style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
                  {searching ? <Spinner size={14} /> : 'Найти'}
                </button>
              </div>
            )}
            {notFound && <p className="text-xs mt-1.5" style={{ color: '#EF4444' }}>Пользователь не найден</p>}
          </div>

          {/* Тип */}
          <div>
            <label className="label">Тип санкции</label>
            <div className="grid grid-cols-3 gap-2">
              {(['WARN', 'MUTE', 'BAN'] as SanctionType[]).map(t => {
                const sel = type === t
                const m = TYPE_META[t]
                return (
                  <button key={t} onClick={() => setType(t)}
                    className="flex flex-col items-center gap-1.5 py-2.5 rounded-xl transition-all"
                    style={{
                      background: sel ? m.bg : 'rgba(255,255,255,0.04)',
                      border: sel ? `1px solid ${m.color}66` : '1px solid transparent',
                    }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={sel ? m.color : 'rgba(255,255,255,0.5)'}
                      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{m.icon}</svg>
                    <span className="text-xs font-medium" style={{ color: sel ? m.color : 'var(--text-mid)' }}>{m.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Срок (не для WARN) */}
          {type !== 'WARN' && (
            <div>
              <label className="label">Срок</label>
              <div className="flex flex-wrap gap-1.5">
                {DURATIONS.map(d => {
                  const sel = durationHours === d.hours
                  return (
                    <button key={d.label} onClick={() => setDurationHours(d.hours)}
                      className="px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                      style={{
                        background: sel ? 'rgba(168,85,247,0.2)' : 'rgba(255,255,255,0.06)',
                        color: sel ? '#C084FC' : 'var(--text-mid)',
                        border: sel ? '1px solid rgba(168,85,247,0.5)' : '1px solid transparent',
                      }}>
                      {d.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Причина */}
          <div>
            <label className="label">Причина</label>
            <textarea className="input resize-none" rows={3} maxLength={500}
              placeholder="За что выдаётся санкция…"
              value={reason} onChange={e => setReason(e.target.value)} />
          </div>

          {error && <p className="text-xs" style={{ color: '#EF4444' }}>{error}</p>}

          <button onClick={submit} disabled={saving || !foundUser || !reason.trim()}
            className="btn-primary w-full disabled:opacity-50">
            {saving ? <Spinner size={16} /> : 'Применить санкцию'}
          </button>
        </div>
      </motion.div>
    </div>
  )
}

// ── Вкладка: жалобы ──────────────────────────────────────────

const CATEGORY_LABEL: Record<ReportCategory, string> = {
  SPAM: 'Спам', HARASSMENT: 'Оскорбления', HATE: 'Ненависть', VIOLENCE: 'Угрозы',
  SEXUAL: '18+', SCAM: 'Мошенничество', ILLEGAL: 'Запрещённое', OTHER: 'Другое',
}

const STATUS_META: Record<ReportStatus, { label: string; color: string; bg: string }> = {
  PENDING:   { label: 'Ожидает',     color: '#F59E0B', bg: 'rgba(245,158,11,0.15)' },
  REVIEWING: { label: 'В работе',    color: '#60A5FA', bg: 'rgba(96,165,250,0.15)' },
  RESOLVED:  { label: 'Решено',      color: '#22C55E', bg: 'rgba(34,197,94,0.15)' },
  DISMISSED: { label: 'Отклонено',   color: '#94A3B8', bg: 'rgba(148,163,184,0.15)' },
}

const REPORT_FILTERS: [ReportStatus | 'all', string][] = [
  ['PENDING', 'Ожидают'], ['REVIEWING', 'В работе'],
  ['RESOLVED', 'Решённые'], ['DISMISSED', 'Отклонённые'], ['all', 'Все'],
]

function evidenceUrl(storageKey: string): string {
  const apiUrl = apiBaseUrl()
  const token = useAuthStore.getState().accessToken
  const encoded = btoa(storageKey).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
  return `${apiUrl}/media/${encoded}${token ? `?token=${encodeURIComponent(token)}` : ''}`
}

function ReportsView({ onCountChange }: { onCountChange: (n: number) => void }) {
  const [data, setData] = useState<ReportsResponse | null>(null)
  const [filter, setFilter] = useState<ReportStatus | 'all'>('PENDING')
  const [error, setError] = useState<unknown>(null)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [sanctionTarget, setSanctionTarget] = useState<Report | null>(null)

  function load() {
    adminApi.listReports(filter)
      .then(r => { setData(r.data.data); onCountChange(r.data.data.counts.pending) })
      .catch(e => setError(e))
  }

  useEffect(() => { setData(null); load() }, [filter])

  async function setStatus(r: Report, status: ReportStatus, resolution?: string) {
    try {
      await adminApi.updateReport(r.id, { status, resolution })
      load()
    } catch { /* ignore */ }
  }

  return (
    <div>
      {error !== null && <div className="my-4"><ErrorMessage error={error} /></div>}

      <div className="flex flex-wrap gap-1 mb-3">
        {REPORT_FILTERS.map(([v, label]) => (
          <button key={v} onClick={() => setFilter(v)}
            className="px-3.5 py-1.5 rounded-xl text-sm font-medium transition-colors"
            style={{
              background: filter === v ? 'var(--glass-3)' : 'transparent',
              color: filter === v ? '#fff' : 'rgba(255,255,255,0.5)',
            }}>
            {label}
          </button>
        ))}
      </div>

      {!data && error === null ? (
        <div className="space-y-2">
          {[0, 1, 2].map(i => <div key={i} className="glass rounded-2xl h-[120px] animate-pulse" style={{ opacity: 1 - i * 0.2 }} />)}
        </div>
      ) : data && (
        data.reports.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-14 h-14 rounded-full flex items-center justify-center mb-3"
              style={{ background: 'rgba(34,197,94,0.12)' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="1.5">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><polyline points="9 12 11 14 15 10" />
              </svg>
            </div>
            <p className="text-sm" style={{ color: 'var(--text-low)' }}>Жалоб не найдено</p>
          </div>
        ) : (
          <div className="space-y-2">
            {data.reports.map((r, i) => (
              <ReportRow key={r.id} report={r} index={i}
                onEvidenceClick={setLightbox}
                onTakeIntoWork={() => setStatus(r, 'REVIEWING')}
                onDismiss={() => setStatus(r, 'DISMISSED', 'Нарушений не выявлено')}
                onSanction={() => setSanctionTarget(r)}
              />
            ))}
          </div>
        )
      )}

      {/* Лайтбокс доказательства */}
      {lightbox && (
        <div className="fixed inset-0 z-[80] bg-black/90 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="" className="max-w-full max-h-full rounded-xl object-contain" onClick={e => e.stopPropagation()} />
        </div>
      )}

      {/* Выдать санкцию по жалобе → после выдачи помечаем жалобу решённой */}
      <AnimatePresence>
        {sanctionTarget?.target && (
          <IssueSanctionModal
            presetUser={sanctionTarget.target}
            onClose={() => setSanctionTarget(null)}
            onIssued={() => {
              const r = sanctionTarget
              setSanctionTarget(null)
              if (r) setStatus(r, 'RESOLVED', `Санкция выдана по жалобе (${CATEGORY_LABEL[r.category]})`)
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function ReportRow({ report: r, index, onEvidenceClick, onTakeIntoWork, onDismiss, onSanction }: {
  report: Report; index: number
  onEvidenceClick: (url: string) => void
  onTakeIntoWork: () => void
  onDismiss: () => void
  onSanction: () => void
}) {
  const st = STATUS_META[r.status]
  const open = r.status === 'PENDING' || r.status === 'REVIEWING'

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 32, delay: Math.min(index * 0.025, 0.3) }}
      className="glass rounded-2xl p-4"
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
          style={{ background: 'rgba(239,68,68,0.15)', color: '#fca5a5' }}>{CATEGORY_LABEL[r.category]}</span>
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: st.bg, color: st.color }}>{st.label}</span>
        <span className="text-[11px] ml-auto" style={{ color: 'var(--text-low)' }}>
          {new Date(r.createdAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      {/* Кто на кого */}
      <div className="flex items-center gap-2 text-sm mb-2 flex-wrap">
        {r.reporter && (
          <Link to={`/admin/users/${r.reporter.id}`} className="flex items-center gap-1.5 group">
            <Avatar url={r.reporter.avatarUrl} nickname={r.reporter.nickname} size={20} />
            <span className="text-white group-hover:underline">{r.reporter.nickname}</span>
          </Link>
        )}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-low)" strokeWidth="2">
          <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
        </svg>
        {r.target && (
          <Link to={`/admin/users/${r.target.id}`} className="flex items-center gap-1.5 group">
            <Avatar url={r.target.avatarUrl} nickname={r.target.nickname} size={20} />
            <span className="font-semibold group-hover:underline" style={{ color: '#fca5a5' }}>{r.target.nickname}</span>
          </Link>
        )}
      </div>

      {/* Текст жалобы */}
      <p className="text-sm mb-2" style={{ color: 'var(--text-mid)' }}>{r.description}</p>

      {/* Доказательства */}
      {r.evidenceKeys.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {r.evidenceKeys.map((k, i) => (
            <button key={i} onClick={() => onEvidenceClick(evidenceUrl(k))}
              className="w-14 h-14 rounded-lg overflow-hidden bg-black/20 hover:opacity-85 transition-opacity">
              <img src={evidenceUrl(k)} alt="" className="w-full h-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      )}

      {/* Резолюция */}
      {r.resolution && (
        <p className="text-[11px] mb-2" style={{ color: 'var(--text-low)' }}>
          Резолюция: {r.resolution}{r.reviewedBy ? ` · @${r.reviewedBy.username}` : ''}
        </p>
      )}

      {/* Действия */}
      {open && (
        <div className="flex flex-wrap gap-2 pt-1">
          {r.status === 'PENDING' && (
            <button onClick={onTakeIntoWork}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{ background: 'rgba(96,165,250,0.15)', color: '#93C5FD' }}>
              Взять в работу
            </button>
          )}
          <button onClick={onSanction}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{ background: 'rgba(239,68,68,0.15)', color: '#fca5a5' }}>
            Выдать санкцию
          </button>
          <button onClick={onDismiss}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-white/10"
            style={{ color: 'var(--text-low)' }}>
            Отклонить
          </button>
        </div>
      )}
    </motion.div>
  )
}
