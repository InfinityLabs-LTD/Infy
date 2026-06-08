import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { profileApi } from '@/api/auth'
import { chatApi } from '@/api/chat'
import { useAuthStore } from '@/store/auth'
import { useChatStore } from '@/store/chat'
import { Avatar } from '@/components/ui/Avatar'
import { OnlineIndicator } from '@/components/ui/OnlineIndicator'
import { Spinner } from '@/components/ui/Spinner'
import type { User } from '@/api/auth'

export function UserProfilePage() {
  const { username } = useParams<{ username: string }>()
  const navigate = useNavigate()
  const myUser = useAuthStore(s => s.user)

  const [user, setUser] = useState<User | null>(null)
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

  return (
    <div className="min-h-screen" style={{ background: '#0e1621' }}>
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3"
        style={{ background: '#17212b', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <button onClick={() => navigate(-1)}
          className="w-9 h-9 flex items-center justify-center rounded-xl transition-colors -ml-1"
          style={{ color: 'rgba(255,255,255,0.5)' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
        </button>
        <h1 className="text-base font-semibold text-white flex-1">
          {user ? user.nickname : 'Профиль'}
        </h1>
        {isMe && (
          <Link to="/profile/edit"
            className="text-sm font-medium px-3 py-1.5 rounded-xl transition-colors"
            style={{ color: '#2aabee' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(42,171,238,0.1)')}
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
              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
          </div>
          <p className="text-base font-semibold text-white mb-1">Пользователь не найден</p>
          <p className="text-sm" style={{ color: '#6c8998' }}>@{username}</p>
        </div>
      ) : user ? (
        <div className="max-w-lg mx-auto px-4 py-5 space-y-3">
          {/* Avatar card */}
          <div className="rounded-2xl overflow-hidden" style={{ background: '#17212b', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="h-20" style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #2b5278 100%)' }} />
            <div className="px-6 pb-6 -mt-10">
              <div className="w-20 h-20 mb-3 rounded-2xl overflow-hidden"
                style={{ border: '3px solid #17212b' }}>
                <Avatar url={user.avatarUrl} nickname={user.nickname} size={80} />
              </div>
              <p className="text-xl font-bold text-white">{user.nickname}</p>
              <p className="text-sm mb-2" style={{ color: '#6c8998' }}>@{user.username}</p>
              <OnlineIndicator userId={user.id} lastSeenAt={user.lastSeenAt} showLabel />
              {user.role === 'ADMIN' && (
                <span className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
                  style={{ background: 'rgba(42,171,238,0.15)', color: '#2aabee' }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                  </svg>
                  Администратор
                </span>
              )}
            </div>
          </div>

          {/* Info */}
          <div className="rounded-2xl p-5 space-y-3"
            style={{ background: '#17212b', border: '1px solid rgba(255,255,255,0.06)' }}>
            <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#6c8998' }}>Аккаунт</h2>
            <InfoRow label="Регистрация" value={
              new Date(user.createdAt).toLocaleDateString('ru-RU', { year: 'numeric', month: 'long', day: 'numeric' })
            } />
          </div>

          {/* Actions */}
          {!isMe && (
            <div className="rounded-2xl p-1.5"
              style={{ background: '#17212b', border: '1px solid rgba(255,255,255,0.06)' }}>
              <button onClick={openChat} disabled={openingChat}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-colors disabled:opacity-50"
                style={{ color: '#2aabee' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <span style={{ color: '#2aabee' }}>
                  {openingChat ? <Spinner size={18} /> : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                    </svg>
                  )}
                </span>
                <span className="font-medium text-sm flex-1 text-left">Написать сообщение</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  style={{ color: 'rgba(255,255,255,0.2)' }}>
                  <path d="M9 18l6-6-6-6"/>
                </svg>
              </button>
            </div>
          )}

          {isMe && (
            <div className="rounded-2xl p-1.5"
              style={{ background: '#17212b', border: '1px solid rgba(255,255,255,0.06)' }}>
              <Link to="/profile"
                className="flex items-center gap-3 px-3 py-3 rounded-xl transition-colors"
                style={{ color: 'rgba(255,255,255,0.75)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <span style={{ color: '#6c8998' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                </span>
                <span className="font-medium text-sm flex-1">Настройки профиля</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  style={{ color: 'rgba(255,255,255,0.2)' }}>
                  <path d="M9 18l6-6-6-6"/>
                </svg>
              </Link>
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="flex-1" style={{ color: '#6c8998' }}>{label}</span>
      <span className="font-medium text-white">{value}</span>
    </div>
  )
}
