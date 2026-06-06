import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { profileApi } from '@/api/auth'
import { useAuthStore } from '@/store/auth'
import { Avatar } from '@/components/ui/Avatar'
import { Spinner } from '@/components/ui/Spinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'

export function ProfilePage() {
  const navigate = useNavigate()
  const { user, setUser, logout } = useAuthStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<unknown>(null)

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true); setError(null)
    try {
      await profileApi.uploadAvatar(file)
      const res = await profileApi.getMe()
      setUser(res.data.data)
    } catch (err) { setError(err) }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = '' }
  }

  if (!user) return null

  const joined = new Date(user.createdAt).toLocaleDateString('ru-RU', { year: 'numeric', month: 'long', day: 'numeric' })
  const roleLabel: Record<string, string> = { USER: 'Пользователь', ADMIN: 'Администратор' }

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
        <h1 className="text-base font-semibold text-white flex-1">Профиль</h1>
        <button onClick={logout} className="text-sm font-medium px-3 py-1.5 rounded-xl transition-colors"
          style={{ color: '#fc8181' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.1)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
          Выйти
        </button>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-3">
        {/* Avatar card */}
        <div className="rounded-2xl overflow-hidden" style={{ background: '#17212b', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="h-20" style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #2b5278 100%)' }} />
          <div className="px-6 pb-6 -mt-10">
            <div className="relative w-20 h-20 mb-3">
              {uploading ? (
                <div className="w-20 h-20 rounded-2xl flex items-center justify-center"
                  style={{ background: '#242f3d', border: '3px solid #17212b' }}>
                  <Spinner size={24} />
                </div>
              ) : (
                <div className="rounded-2xl overflow-hidden" style={{ border: '3px solid #17212b' }}>
                  <Avatar url={user.avatarUrl} nickname={user.nickname} size={80} />
                </div>
              )}
              <button onClick={() => fileRef.current?.click()} disabled={uploading}
                className="absolute -bottom-1 -right-1 w-7 h-7 rounded-xl flex items-center justify-center shadow transition-colors"
                style={{ background: '#2aabee', border: '2px solid #17212b' }}
                title="Изменить аватар">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                  <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
                  <circle cx="12" cy="13" r="4"/>
                </svg>
              </button>
            </div>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden" onChange={handleAvatarChange} />
            {error !== null && <ErrorMessage error={error} />}
            <p className="text-xl font-bold text-white">{user.nickname}</p>
            <p className="text-sm" style={{ color: '#6c8998' }}>@{user.username}</p>
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
        <div className="rounded-2xl p-5 space-y-3" style={{ background: '#17212b', border: '1px solid rgba(255,255,255,0.06)' }}>
          <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#6c8998' }}>Аккаунт</h2>
          <InfoRow icon="👤" label="Роль" value={roleLabel[user.role] ?? user.role} />
          {user.email && <InfoRow icon="✉️" label="Email" value={user.email} />}
          <InfoRow icon="📅" label="Регистрация" value={joined} />
        </div>

        {/* Actions */}
        <div className="rounded-2xl p-1.5" style={{ background: '#17212b', border: '1px solid rgba(255,255,255,0.06)' }}>
          <ActionLink to="/profile/edit" icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          } label="Редактировать профиль" />
          <ActionLink to="/sessions" icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="3" width="20" height="14" rx="2"/>
              <path d="M8 21h8M12 17v4"/>
            </svg>
          } label="Мои устройства" />
          {user.role === 'ADMIN' && (
            <ActionLink to="/admin" icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
              </svg>
            } label="Панель администратора" accent />
          )}
        </div>
      </div>
    </div>
  )
}

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 text-sm" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: '12px' }}>
      <span className="text-base w-5 text-center">{icon}</span>
      <span className="flex-1" style={{ color: '#6c8998' }}>{label}</span>
      <span className="font-medium text-white">{value}</span>
    </div>
  )
}

function ActionLink({ to, icon, label, accent }: { to: string; icon: React.ReactNode; label: string; accent?: boolean }) {
  return (
    <Link to={to} className="flex items-center gap-3 px-3 py-3 rounded-xl transition-colors"
      style={{ color: accent ? '#2aabee' : 'rgba(255,255,255,0.75)' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
      <span style={{ color: accent ? '#2aabee' : '#6c8998' }}>{icon}</span>
      <span className="font-medium text-sm flex-1">{label}</span>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        style={{ color: 'rgba(255,255,255,0.2)' }}>
        <path d="M9 18l6-6-6-6"/>
      </svg>
    </Link>
  )
}
