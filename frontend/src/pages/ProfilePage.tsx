import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { profileApi } from '@/api/auth'
import { useAuthStore } from '@/store/auth'
import { Avatar } from '@/components/ui/Avatar'
import { Spinner } from '@/components/ui/Spinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'

function calcAge(birthdate: string): number {
  const birth = new Date(birthdate)
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  const m = now.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--
  return age
}

export function ProfilePage() {
  const { user, setUser, logout } = useAuthStore()
  const avatarRef = useRef<HTMLInputElement>(null)
  const coverRef = useRef<HTMLInputElement>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [uploadingCover, setUploadingCover] = useState(false)
  const [error, setError] = useState<unknown>(null)

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

  const joined = new Date(user.createdAt).toLocaleDateString('ru-RU', { year: 'numeric', month: 'long', day: 'numeric' })
  const roleLabel: Record<string, string> = { USER: 'Пользователь', ADMIN: 'Администратор' }
  const birthdateFormatted = user.birthdate
    ? new Date(user.birthdate).toLocaleDateString('ru-RU', { year: 'numeric', month: 'long', day: 'numeric' })
    : null
  const age = user.birthdate ? calcAge(user.birthdate) : null

  return (
    <div className="flex-1 min-h-0 overflow-y-auto" style={{ background: 'var(--bg-deep)' }}>
      <div className="max-w-lg mx-auto px-4 py-5 space-y-3">
        {/* Avatar + Cover card */}
        <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--glass-1)', border: '1px solid var(--glass-stroke)' }}>
          {/* Cover */}
          <div className="relative h-28 overflow-hidden">
            {user.coverUrl ? (
              <img src={user.coverUrl} alt="cover" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full" style={{ background: 'linear-gradient(135deg, #4C1D95 0%, #7C3AED 55%, #A855F7 100%)' }} />
            )}
            <button onClick={() => coverRef.current?.click()} disabled={uploadingCover}
              className="absolute bottom-2 right-2 flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-xl transition-colors disabled:opacity-50"
              style={{ background: 'rgba(0,0,0,0.55)', color: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(4px)' }}>
              {uploadingCover ? <Spinner size={12} /> : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
                  <circle cx="12" cy="13" r="4"/>
                </svg>
              )}
              Обложка
            </button>
          </div>

          <div className="px-6 pb-6 -mt-10">
            <div className="relative w-20 h-20 mb-3">
              {uploadingAvatar ? (
                <div className="w-20 h-20 rounded-2xl flex items-center justify-center"
                  style={{ background: 'var(--glass-2)', border: '3px solid #0B1020' }}>
                  <Spinner size={24} />
                </div>
              ) : (
                <div className="w-20 h-20 rounded-2xl overflow-hidden" style={{ border: '3px solid #0B1020' }}>
                  <Avatar url={user.avatarUrl} nickname={user.nickname} size={80} rounded="2xl" />
                </div>
              )}
              <button onClick={() => avatarRef.current?.click()} disabled={uploadingAvatar}
                className="absolute -bottom-1 -right-1 w-7 h-7 rounded-xl flex items-center justify-center shadow transition-colors"
                style={{ background: 'var(--grad-own)', border: '2px solid #0B1020' }}
                title="Изменить аватар">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                  <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
                  <circle cx="12" cy="13" r="4"/>
                </svg>
              </button>
            </div>
            <input ref={avatarRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden" onChange={handleAvatarChange} />
            <input ref={coverRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden" onChange={handleCoverChange} />
            {error !== null && <ErrorMessage error={error} />}
            <p className="text-xl font-bold text-white">{user.nickname}</p>
            <p className="text-sm" style={{ color: 'var(--text-low)' }}>@{user.username}</p>
            {user.role === 'ADMIN' && (
              <span className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
                style={{ background: 'rgba(168,85,247,0.18)', color: '#C084FC' }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
                Администратор
              </span>
            )}
          </div>
        </div>

        {/* Bio */}
        {user.bio && (
          <div className="rounded-2xl p-5" style={{ background: 'var(--glass-1)', border: '1px solid var(--glass-stroke)' }}>
            <h2 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-low)' }}>О себе</h2>
            <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.85)', whiteSpace: 'pre-wrap' }}>{user.bio}</p>
          </div>
        )}

        {/* Info */}
        <div className="rounded-2xl p-5 space-y-3" style={{ background: 'var(--glass-1)', border: '1px solid var(--glass-stroke)' }}>
          <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-low)' }}>Аккаунт</h2>
          <InfoRow icon="👤" label="Роль" value={roleLabel[user.role] ?? user.role} />
          {user.email && <InfoRow icon="✉️" label="Email" value={user.email} />}
          {birthdateFormatted && age !== null && (
            <InfoRow icon="🎂" label="День рождения" value={`${birthdateFormatted} (${age} лет)`} />
          )}
          <InfoRow icon="📅" label="Регистрация" value={joined} />
        </div>

        {/* Actions */}
        <div className="rounded-2xl p-1.5" style={{ background: 'var(--glass-1)', border: '1px solid var(--glass-stroke)' }}>
          <ActionLink to="/profile/edit" icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          } label="Редактировать профиль" />
          <ActionLink to="/settings" icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
            </svg>
          } label="Настройки" />
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
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-colors text-left"
            style={{ color: '#EF4444' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.08)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <span style={{ color: '#EF4444' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </span>
            <span className="font-medium text-sm flex-1">Выйти</span>
          </button>
        </div>
      </div>
    </div>
  )
}

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 text-sm" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: '12px' }}>
      <span className="text-base w-5 text-center">{icon}</span>
      <span className="flex-1" style={{ color: 'var(--text-low)' }}>{label}</span>
      <span className="font-medium text-white text-right" style={{ maxWidth: '60%', wordBreak: 'break-word' }}>{value}</span>
    </div>
  )
}

function ActionLink({ to, icon, label, accent }: { to: string; icon: React.ReactNode; label: string; accent?: boolean }) {
  return (
    <Link to={to} className="flex items-center gap-3 px-3 py-3 rounded-xl transition-colors"
      style={{ color: accent ? '#C084FC' : 'rgba(255,255,255,0.75)' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
      <span style={{ color: accent ? '#C084FC' : 'var(--text-low)' }}>{icon}</span>
      <span className="font-medium text-sm flex-1">{label}</span>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        style={{ color: 'rgba(255,255,255,0.2)' }}>
        <path d="M9 18l6-6-6-6"/>
      </svg>
    </Link>
  )
}
