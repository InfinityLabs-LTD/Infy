import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence, useScroll, useTransform } from 'framer-motion'
import { profileApi } from '@/api/auth'
import type { User, Badge as BadgeType, ProfileStats } from '@/api/auth'
import { useAuthStore } from '@/store/auth'
import { Avatar } from '@/components/ui/Avatar'
import { Spinner } from '@/components/ui/Spinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { OnlineIndicator } from '@/components/ui/OnlineIndicator'

const SPRING = { type: 'spring', stiffness: 380, damping: 30 } as const

/* ── Liquid Glass: depth layers ─────────────────────────────── */
const LAYER = {
  sunken: { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' },
  raised: { background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-stroke)' },
  floating: { background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.10)' },
} as const

const LIQUID_SHADOW =
  'inset 0 1px 0 rgba(255,255,255,.12), inset 0 -1px 0 rgba(0,0,0,.2), 0 12px 40px rgba(0,0,0,.45)'

function calcAge(birthdate: string): number {
  const birth = new Date(birthdate)
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  const m = now.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--
  return age
}

type Mode = 'me' | 'others'

export function ProfilePage() {
  const { user, setUser, logout } = useAuthStore()
  const avatarRef = useRef<HTMLInputElement>(null)
  const coverRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [uploadingCover, setUploadingCover] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [mode, setMode] = useState<Mode>('me')
  const [stats, setStats] = useState<ProfileStats | null>(null)

  useEffect(() => {
    // Подтягиваем актуальный профиль (бейджи/интересы) и статистику.
    profileApi.getMe().then(r => setUser(r.data.data)).catch(() => {})
    profileApi.getStats().then(r => setStats(r.data.data)).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingAvatar(true); setError(null)
    try {
      await profileApi.uploadAvatar(file)
      const res = await profileApi.getMe()
      setUser(res.data.data)
    } catch (err) { setError(err) }
    finally { setUploadingAvatar(false); if (avatarRef.current) avatarRef.current.value = '' }
  }

  async function handleCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingCover(true); setError(null)
    try {
      await profileApi.uploadCover(file)
      const res = await profileApi.getMe()
      setUser(res.data.data)
    } catch (err) { setError(err) }
    finally { setUploadingCover(false); if (coverRef.current) coverRef.current.value = '' }
  }

  if (!user) return null
  const editable = mode === 'me'

  return (
    <div
      ref={scrollRef}
      className="flex-1 min-h-0 overflow-y-auto bg-aurora"
      style={{ backgroundColor: 'var(--bg-deep)' }}
    >
      <input ref={avatarRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden" onChange={handleAvatarChange} />
      <input ref={coverRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden" onChange={handleCoverChange} />

      <ViewToggle mode={mode} onMode={setMode} />

      <div className="max-w-lg mx-auto px-4 pb-12 pt-3 space-y-3
                      lg:max-w-4xl lg:grid lg:grid-cols-[20rem_1fr] lg:gap-4 lg:items-start lg:space-y-0">
        {/* Left column (sticky on desktop): hero + stats */}
        <div className="space-y-3 lg:sticky lg:top-[4.5rem]">
          <Hero
            user={user}
            editable={editable}
            scrollRef={scrollRef}
            uploadingAvatar={uploadingAvatar}
            uploadingCover={uploadingCover}
            onAvatar={() => avatarRef.current?.click()}
            onCover={() => coverRef.current?.click()}
          />
          {error !== null && <ErrorMessage error={error} />}
          <StatGrid stats={stats} />
        </div>

        {/* Right column: about, AI, and (in "me" mode) personal cabinet */}
        <div className="space-y-3 lg:space-y-3">
          <AboutCard user={user} />
          <AiInsightCard user={user} />

          <AnimatePresence initial={false}>
            {editable && (
              <motion.div
                key="cabinet"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 16 }}
                transition={SPRING}
                className="space-y-3"
              >
                <AccountCard user={user} />
                <ActionGrid isAdmin={user.role === 'ADMIN'} />
                {user.badges.some(b => b.slug === 'premium') && <PremiumCard />}
                <DangerZone onLogout={logout} />
              </motion.div>
            )}
          </AnimatePresence>

          {!editable && <DisclosureHint />}
        </div>
      </div>
    </div>
  )
}

/* ════════════════════════ Glass primitive ════════════════════ */
function Glass({
  layer = 'raised', glow, delay = 0, hover = true, className = '', style, children,
}: {
  layer?: keyof typeof LAYER
  glow?: 'brand' | 'premium'
  delay?: number
  hover?: boolean
  className?: string
  style?: React.CSSProperties
  children: React.ReactNode
}) {
  const glowShadow =
    glow === 'brand' ? ', 0 0 32px rgba(124,58,237,.35)'
    : glow === 'premium' ? ', 0 0 40px rgba(251,191,36,.28)'
    : ''
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...SPRING, delay }}
      whileHover={hover ? { y: -2 } : undefined}
      className={`rounded-2xl ${className}`}
      style={{
        ...LAYER[layer],
        backdropFilter: 'blur(16px) saturate(140%)',
        WebkitBackdropFilter: 'blur(16px) saturate(140%)',
        boxShadow: LIQUID_SHADOW + glowShadow,
        ...style,
      }}
    >
      {children}
    </motion.div>
  )
}

/* ════════════════════════ View toggle ════════════════════════ */
function ViewToggle({ mode, onMode }: { mode: Mode; onMode: (m: Mode) => void }) {
  return (
    <div
      className="sticky top-0 z-20 flex items-center justify-center px-4 py-3"
      style={{
        background: 'rgba(8,11,22,0.72)',
        backdropFilter: 'blur(40px) saturate(140%)',
        WebkitBackdropFilter: 'blur(40px) saturate(140%)',
        borderBottom: '1px solid var(--glass-stroke)',
      }}
    >
      <div
        className="relative flex p-1 rounded-full text-sm"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--glass-stroke)' }}
      >
        {(['me', 'others'] as const).map((m) => (
          <button
            key={m}
            onClick={() => onMode(m)}
            className="relative z-10 px-4 py-1.5 rounded-full font-medium transition-colors whitespace-nowrap"
            style={{ color: mode === m ? '#fff' : 'var(--text-low)' }}
          >
            {mode === m && (
              <motion.span
                layoutId="view-seg"
                transition={SPRING}
                className="absolute inset-0 rounded-full -z-10"
                style={{ background: 'var(--grad-own)', boxShadow: '0 0 20px rgba(124,58,237,.45)' }}
              />
            )}
            {m === 'me' ? '👁 Как вижу я' : 'Как видят другие'}
          </button>
        ))}
      </div>
    </div>
  )
}

/* ════════════════════════ Hero ═══════════════════════════════ */
function Hero({
  user, editable, scrollRef, uploadingAvatar, uploadingCover, onAvatar, onCover,
}: {
  user: User
  editable: boolean
  scrollRef: React.RefObject<HTMLDivElement>
  uploadingAvatar: boolean
  uploadingCover: boolean
  onAvatar: () => void
  onCover: () => void
}) {
  const { scrollY } = useScroll({ container: scrollRef })
  const coverY = useTransform(scrollY, [0, 240], [0, 48])
  const coverScale = useTransform(scrollY, [0, 240], [1.05, 1.18])

  return (
    <Glass layer="floating" glow="brand" hover={false} className="overflow-hidden" delay={0}>
      {/* Cover */}
      <div className="relative h-36 overflow-hidden">
        <motion.div className="absolute inset-0" style={{ y: coverY, scale: coverScale }}>
          {user.coverUrl ? (
            <img src={user.coverUrl} alt="cover" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full" style={{ background: 'linear-gradient(135deg, #4C1D95 0%, #7C3AED 55%, #A855F7 100%)' }} />
          )}
        </motion.div>
        {/* depth scrim */}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, transparent 40%, rgba(8,11,22,0.55) 100%)' }} />
        {editable && (
          <button onClick={onCover} disabled={uploadingCover}
            className="absolute bottom-2 right-2 flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-xl transition-colors disabled:opacity-50"
            style={{ background: 'rgba(0,0,0,0.55)', color: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(8px)' }}>
            {uploadingCover ? <Spinner size={12} /> : <CameraIcon size={12} />}
            Обложка
          </button>
        )}
      </div>

      <div className="px-6 pb-6 -mt-11">
        {/* Avatar with depth ring + online dot */}
        <div className="relative w-[88px] h-[88px] mb-3">
          <div className="w-[88px] h-[88px] rounded-2xl overflow-hidden"
            style={{ border: '3px solid #0B1020', boxShadow: '0 0 0 1px rgba(168,85,247,.4), 0 8px 28px rgba(124,58,237,.35)' }}>
            {uploadingAvatar ? (
              <div className="w-full h-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.08)' }}>
                <Spinner size={24} />
              </div>
            ) : (
              <Avatar url={user.avatarUrl} nickname={user.nickname} size={88} rounded="2xl" />
            )}
          </div>
          {/* live online dot (self is online) */}
          <span className="absolute -top-0.5 -right-0.5">
            <span className="block w-4 h-4 rounded-full" style={{ background: '#22C55E', border: '3px solid #0B1020', boxShadow: '0 0 12px rgba(34,197,94,.6)' }} />
          </span>
          {editable && (
            <button onClick={onAvatar} disabled={uploadingAvatar}
              className="absolute -bottom-1 -right-1 w-7 h-7 rounded-xl flex items-center justify-center transition-transform hover:scale-105"
              style={{ background: 'var(--grad-own)', border: '2px solid #0B1020' }}
              title="Изменить аватар">
              <CameraIcon size={13} color="white" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-xl font-bold text-white font-display">{user.nickname}</p>
          {user.role === 'ADMIN' && <VerifiedTick />}
        </div>
        <p className="text-sm" style={{ color: 'var(--text-low)' }}>@{user.username}</p>

        {/* presence line — OnlineIndicator renders its own dot + label */}
        <div className="mt-1 text-xs flex items-center gap-1.5">
          <OnlineIndicator userId={user.id} lastSeenAt={user.lastSeenAt} showLabel />
        </div>

        {/* badges — выданы администратором; «Администратор» добавляется по роли */}
        <BadgeRow role={user.role} badges={user.badges} />
      </div>
    </Glass>
  )
}

// Рисует ряд бейджей. «Администратор» подставляется автоматически по роли,
// если админ не завёл отдельный бейдж со slug "admin"/"administrator".
export function BadgeRow({ role, badges }: { role: string; badges: BadgeType[] }) {
  const hasAdminBadge = badges.some(b => b.slug === 'admin' || b.slug === 'administrator')
  if (badges.length === 0 && !(role === 'ADMIN' && !hasAdminBadge)) return null
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {role === 'ADMIN' && !hasAdminBadge && (
        <BadgePill color="192,132,252" icon="★" label="Администратор" />
      )}
      {badges.map(b => (
        <BadgePill key={b.slug} color={b.color} icon={b.icon} label={b.label} />
      ))}
    </div>
  )
}

function BadgePill({ color, icon, label }: { color: string; icon: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full"
      style={{ background: `rgba(${color},0.16)`, color: `rgb(${color})` }}>
      <span aria-hidden>{icon}</span>{label}
    </span>
  )
}

function VerifiedTick() {
  return (
    <span title="Verified" className="inline-flex items-center justify-center w-5 h-5 rounded-full"
      style={{ background: 'var(--grad-own)' }}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </span>
  )
}

/* ════════════════════════ Stat grid ══════════════════════════ */
function StatGrid({ stats }: { stats: ProfileStats | null }) {
  const items: { v: number | null; l: string }[] = [
    { v: stats?.contacts ?? null, l: 'Контакты' },
    { v: stats?.chats ?? null, l: 'Чаты' },
    { v: stats?.groups ?? null, l: 'Группы' },
    { v: stats?.devices ?? null, l: 'Устройства' },
  ]
  return (
    <div className="grid grid-cols-4 gap-2">
      {items.map((s, i) => (
        <Glass key={s.l} layer="raised" delay={0.05 + i * 0.05} className="py-3 px-1 text-center cursor-default">
          <div className="text-lg font-bold text-white font-display tabular-nums">
            {s.v === null ? '—' : s.v}
          </div>
          <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-low)' }}>{s.l}</div>
        </Glass>
      ))}
    </div>
  )
}

/* ════════════════════════ About ══════════════════════════════ */
// Чипы хэштегов/интересов — общие для своего и публичного профиля.
export function InterestChips({ interests }: { interests: string[] }) {
  if (interests.length === 0) return null
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {interests.map((t) => (
        <span key={t} className="text-xs font-medium px-2.5 py-1 rounded-full"
          style={{ background: 'rgba(168,85,247,0.12)', color: '#C084FC' }}>#{t}</span>
      ))}
    </div>
  )
}

function AboutCard({ user }: { user: User }) {
  // Не показываем карточку, если нечего показать.
  if (!user.bio && user.interests.length === 0) return null
  return (
    <Glass layer="raised" delay={0.1} className="p-5">
      <SectionLabel>🚀 О себе</SectionLabel>
      {user.bio && (
        <p className="text-sm leading-relaxed mt-3" style={{ color: 'rgba(255,255,255,0.85)', whiteSpace: 'pre-wrap' }}>
          {user.bio}
        </p>
      )}
      <InterestChips interests={user.interests} />
    </Glass>
  )
}

/* ════════════════════════ AI insight ═════════════════════════ */
// Карточка-визитка Infy AI. Пока без отдельного бэкенда инсайтов —
// формирует подсказку из реальных интересов пользователя.
function AiInsightCard({ user }: { user: User }) {
  if (user.interests.length === 0) return null
  const top = user.interests.slice(0, 3).join(', ')
  return (
    <Glass layer="floating" glow="brand" delay={0.15} className="p-5">
      <div className="flex items-center justify-between">
        <SectionLabel>🤖 Infy AI</SectionLabel>
        <span className="text-xs" style={{ color: 'var(--text-low)' }}>визитка</span>
      </div>
      <p className="text-sm leading-relaxed mt-3" style={{ color: 'rgba(255,255,255,0.88)' }}>
        Судя по интересам, {user.nickname} увлекается такими темами, как {top}. Infy AI подберёт
        собеседников и контент под эти темы.
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {user.interests.slice(0, 5).map((t) => (
          <span key={t} className="text-xs px-2.5 py-1 rounded-full"
            style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.7)' }}>{t}</span>
        ))}
      </div>
    </Glass>
  )
}

/* ════════════════════════ Account ════════════════════════════ */
function AccountCard({ user }: { user: User }) {
  const joined = new Date(user.createdAt).toLocaleDateString('ru-RU', { year: 'numeric', month: 'long', day: 'numeric' })
  const roleLabel: Record<string, string> = { USER: 'Пользователь', ADMIN: 'Администратор' }
  const birthdate = user.birthdate
    ? new Date(user.birthdate).toLocaleDateString('ru-RU', { year: 'numeric', month: 'long', day: 'numeric' })
    : null
  const age = user.birthdate ? calcAge(user.birthdate) : null

  return (
    <Glass layer="raised" delay={0.05} className="p-5">
      <SectionLabel>Аккаунт</SectionLabel>
      <div className="mt-3 space-y-1">
        <AccountRow icon={<RoleIcon />} label="Роль" value={roleLabel[user.role] ?? user.role} />
        {user.email && <AccountRow icon={<MailIcon />} label="Email" value={user.email} />}
        {birthdate && age !== null && <AccountRow icon={<CakeIcon />} label="День рождения" value={`${birthdate} (${age} лет)`} />}
        <AccountRow icon={<CalendarIcon />} label="Регистрация" value={joined} last />
      </div>
    </Glass>
  )
}

function AccountRow({ icon, label, value, last }: { icon: React.ReactNode; label: string; value: string; last?: boolean }) {
  return (
    <div className="flex items-center gap-3 py-2.5 text-sm"
      style={{ borderBottom: last ? 'none' : '1px solid rgba(255,255,255,0.04)' }}>
      <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: 'rgba(255,255,255,0.05)', color: '#C084FC' }}>{icon}</span>
      <span className="flex-1" style={{ color: 'var(--text-low)' }}>{label}</span>
      <span className="font-medium text-white text-right" style={{ maxWidth: '58%', wordBreak: 'break-word' }}>{value}</span>
    </div>
  )
}

/* ════════════════════════ Quick actions ══════════════════════ */
function ActionGrid({ isAdmin }: { isAdmin: boolean }) {
  return (
    <Glass layer="raised" delay={0.1} hover={false} className="p-3">
      <SectionLabel className="px-2">Быстрые действия</SectionLabel>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <ActionTile to="/profile/edit" icon={<EditIcon />} label="Редактировать" />
        <ActionTile to="/sessions" icon={<DeviceIcon />} label="Устройства" />
        <ActionTile to="/settings" icon={<GearIcon />} label="Настройки" />
        <ActionTile to="/sessions" icon={<ShieldIcon />} label="Безопасность" />
      </div>
      {isAdmin && (
        <Link to="/admin"
          className="mt-2 flex items-center gap-3 px-3 py-3 rounded-xl transition-colors"
          style={{ color: '#C084FC', background: 'rgba(168,85,247,0.10)' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(168,85,247,0.18)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(168,85,247,0.10)')}>
          <StarIcon />
          <span className="font-medium text-sm flex-1">Панель администратора</span>
          <ChevronIcon />
        </Link>
      )}
    </Glass>
  )
}

function ActionTile({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link to={to}
      className="flex flex-col gap-2 p-3.5 rounded-xl transition-all"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid transparent' }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.borderColor = 'rgba(168,85,247,0.35)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = 'transparent' }}>
      <span style={{ color: '#C084FC' }}>{icon}</span>
      <span className="text-sm font-medium text-white">{label}</span>
    </Link>
  )
}

/* ════════════════════════ Premium ════════════════════════════ */
function PremiumCard() {
  return (
    <Glass layer="floating" glow="premium" delay={0.15} className="p-5">
      <div className="flex items-center gap-3">
        <span className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
          style={{ background: 'linear-gradient(135deg,#F59E0B,#FBBF24)' }}>✨</span>
        <div className="flex-1">
          <p className="font-bold text-white font-display">Infy Premium</p>
          <p className="text-xs" style={{ color: 'var(--text-low)' }}>AI-функции · лимиты · кастомизация</p>
        </div>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
          style={{ background: 'rgba(251,191,36,0.18)', color: '#FBBF24' }}>активна</span>
      </div>
    </Glass>
  )
}

/* ════════════════════════ Danger zone ════════════════════════ */
function DangerZone({ onLogout }: { onLogout: () => void }) {
  return (
    <Glass layer="sunken" delay={0.2} hover={false} className="p-1.5">
      <button onClick={onLogout}
        className="w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-colors text-left"
        style={{ color: '#EF4444' }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(239,68,68,0.08)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
        <LogoutIcon />
        <span className="font-medium text-sm flex-1">Выйти</span>
      </button>
    </Glass>
  )
}

/* ════════════════════════ Disclosure (others mode) ═══════════ */
function DisclosureHint() {
  return (
    <Glass layer="sunken" delay={0.2} hover={false} className="p-4">
      <p className="text-sm" style={{ color: 'var(--text-low)' }}>
        👁 Так ваш профиль видят другие. Личные данные (email, устройства, статистика) скрыты.
        Управляйте видимостью в <Link to="/settings" className="underline" style={{ color: '#C084FC' }}>настройках приватности</Link>.
      </p>
    </Glass>
  )
}

/* ════════════════════════ Bits ═══════════════════════════════ */
function SectionLabel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <h2 className={`text-xs font-semibold uppercase tracking-wider ${className}`} style={{ color: 'var(--text-low)' }}>
      {children}
    </h2>
  )
}

/* ── Icons (stroke SVG, replacing emoji info-rows) ──────────── */
function CameraIcon({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5">
      <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  )
}
const stroke = (d: React.ReactNode) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">{d}</svg>
)
const RoleIcon = () => stroke(<><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></>)
const MailIcon = () => stroke(<><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 5L2 7" /></>)
const CakeIcon = () => stroke(<><path d="M20 21v-8a2 2 0 00-2-2H6a2 2 0 00-2 2v8" /><path d="M4 16s.5-1 2-1 2.5 1 4 1 2.5-1 4-1 2 1 2 1" /><path d="M2 21h20M7 8v3M12 8v3M17 8v3" /></>)
const CalendarIcon = () => stroke(<><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>)
const EditIcon = () => stroke(<><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></>)
const GearIcon = () => stroke(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /></>)
const DeviceIcon = () => stroke(<><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></>)
const ShieldIcon = () => stroke(<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />)
const StarIcon = () => stroke(<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />)
const ChevronIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'rgba(255,255,255,0.25)' }}><path d="M9 18l6-6-6-6" /></svg>
)
const LogoutIcon = () => stroke(<><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></>)
