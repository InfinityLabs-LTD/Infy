import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { profileApi } from '@/api/auth'
import type { PublicProfile } from '@/api/auth'
import { chatApi } from '@/api/chat'
import { useAuthStore } from '@/store/auth'
import { useChatStore } from '@/store/chat'
import { Avatar } from '@/components/ui/Avatar'
import { OnlineIndicator } from '@/components/ui/OnlineIndicator'
import { Spinner } from '@/components/ui/Spinner'
import { BadgeRow, InterestChips } from './ProfilePage'

const SPRING = { type: 'spring', stiffness: 380, damping: 30 } as const
const LIQUID_SHADOW =
  'inset 0 1px 0 rgba(255,255,255,.12), inset 0 -1px 0 rgba(0,0,0,.2), 0 12px 40px rgba(0,0,0,.45)'

export function UserProfilePage() {
  const { username } = useParams<{ username: string }>()
  const navigate = useNavigate()
  const myUser = useAuthStore(s => s.user)

  const [user, setUser] = useState<PublicProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [openingChat, setOpeningChat] = useState(false)

  const { upsertChat } = useChatStore()

  useEffect(() => {
    if (!username) return
    setLoading(true)
    setNotFound(false)
    profileApi.getByUsername(username)
      .then(r => setUser(r.data.data))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))
  }, [username])

  async function openChat() {
    if (!user) return
    setOpeningChat(true)
    try {
      const r = await chatApi.getOrCreateChat(user.id)
      upsertChat(r.data.data)
      navigate(`/chat/${user.id}`)
    } catch {
      setOpeningChat(false)
    }
  }

  const isMe = myUser?.username === username
  const joined = user
    ? new Date(user.createdAt).toLocaleDateString('ru-RU', { year: 'numeric', month: 'long' })
    : ''

  return (
    <div className="min-h-screen bg-aurora" style={{ backgroundColor: 'var(--bg-deep)' }}>
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3"
        style={{
          background: 'rgba(8,11,22,0.7)',
          backdropFilter: 'blur(24px) saturate(140%)',
          WebkitBackdropFilter: 'blur(24px) saturate(140%)',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
        }}>
        <button onClick={() => navigate(-1)}
          className="w-9 h-9 flex items-center justify-center rounded-xl transition-colors -ml-1"
          style={{ color: 'rgba(255,255,255,0.5)' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
        </button>
        <h1 className="text-base font-semibold text-white flex-1">
          {user ? user.nickname : 'Профиль'}
        </h1>
        {isMe && (
          <Link to="/profile/edit"
            className="text-sm font-medium px-3 py-1.5 rounded-xl transition-colors"
            style={{ color: '#C084FC' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(168,85,247,0.12)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
            Изменить
          </Link>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner size={32} /></div>
      ) : notFound ? (
        <div className="flex flex-col items-center justify-center py-20 px-4">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
            style={{ background: 'rgba(255,255,255,0.05)' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5">
              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>
          <p className="text-base font-semibold text-white mb-1">Пользователь не найден</p>
          <p className="text-sm" style={{ color: 'var(--text-low)' }}>@{username}</p>
        </div>
      ) : user ? (
        <div className="max-w-lg mx-auto px-4 pb-12 pt-3 space-y-3">
          {/* Hero (public) */}
          <PublicGlass floating glow className="overflow-hidden">
            <div className="relative h-36 overflow-hidden">
              {user.coverUrl ? (
                <img src={user.coverUrl} alt="cover" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full" style={{ background: 'linear-gradient(135deg, #4C1D95 0%, #7C3AED 55%, #A855F7 100%)' }} />
              )}
              <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, transparent 40%, rgba(8,11,22,0.55) 100%)' }} />
            </div>
            <div className="px-6 pb-6 -mt-11">
              <div className="w-[88px] h-[88px] mb-3 rounded-2xl overflow-hidden"
                style={{ border: '3px solid #0B1020', boxShadow: '0 0 0 1px rgba(168,85,247,.4), 0 8px 28px rgba(124,58,237,.35)' }}>
                <Avatar url={user.avatarUrl} nickname={user.nickname} size={88} rounded="2xl" />
              </div>
              <p className="text-xl font-bold text-white font-display">{user.nickname}</p>
              <p className="text-sm" style={{ color: 'var(--text-low)' }}>@{user.username}</p>
              <div className="mt-1 text-xs flex items-center gap-1.5">
                <OnlineIndicator userId={user.id} lastSeenAt={user.lastSeenAt} showLabel />
              </div>
              <BadgeRow role={user.role} badges={user.badges} />
            </div>
          </PublicGlass>

          {/* About + interests (public) */}
          {(user.bio || user.interests.length > 0) && (
            <PublicGlass className="p-5">
              <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-low)' }}>🚀 О себе</h2>
              {user.bio && (
                <p className="text-sm leading-relaxed mt-3" style={{ color: 'rgba(255,255,255,0.85)', whiteSpace: 'pre-wrap' }}>{user.bio}</p>
              )}
              <InterestChips interests={user.interests} />
            </PublicGlass>
          )}

          {/* Public meta: только дата регистрации */}
          <PublicGlass className="p-5">
            <div className="flex items-center gap-3 text-sm">
              <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: 'rgba(255,255,255,0.05)', color: '#C084FC' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
                </svg>
              </span>
              <span className="flex-1" style={{ color: 'var(--text-low)' }}>На Infy с</span>
              <span className="font-medium text-white">{joined}</span>
            </div>
          </PublicGlass>

          {/* Action */}
          {!isMe ? (
            <PublicGlass className="p-1.5">
              <button onClick={openChat} disabled={openingChat}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-colors disabled:opacity-50"
                style={{ color: '#C084FC' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <span style={{ color: '#C084FC' }}>
                  {openingChat ? <Spinner size={18} /> : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                    </svg>
                  )}
                </span>
                <span className="font-medium text-sm flex-1 text-left">Написать сообщение</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  style={{ color: 'rgba(255,255,255,0.2)' }}>
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>
            </PublicGlass>
          ) : (
            <PublicGlass className="p-1.5">
              <Link to="/profile"
                className="flex items-center gap-3 px-3 py-3 rounded-xl transition-colors"
                style={{ color: 'rgba(255,255,255,0.75)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <span style={{ color: 'var(--text-low)' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" />
                  </svg>
                </span>
                <span className="font-medium text-sm flex-1">Открыть мой профиль</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  style={{ color: 'rgba(255,255,255,0.2)' }}>
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </Link>
            </PublicGlass>
          )}
        </div>
      ) : null}
    </div>
  )
}

// Локальный стеклянный примитив (тот же визуальный язык, что в ProfilePage).
function PublicGlass({ floating, glow, className = '', children }: {
  floating?: boolean; glow?: boolean; className?: string; children: React.ReactNode
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={SPRING}
      className={`rounded-2xl ${className}`}
      style={{
        background: floating ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.05)',
        border: floating ? '1px solid rgba(255,255,255,0.10)' : '1px solid var(--glass-stroke)',
        backdropFilter: 'blur(16px) saturate(140%)',
        WebkitBackdropFilter: 'blur(16px) saturate(140%)',
        boxShadow: LIQUID_SHADOW + (glow ? ', 0 0 32px rgba(124,58,237,.35)' : ''),
      }}
    >
      {children}
    </motion.div>
  )
}
