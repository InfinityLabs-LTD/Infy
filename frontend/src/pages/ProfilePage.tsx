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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 shadow-sm sticky top-0 z-10">
        <button onClick={() => navigate(-1)}
          className="w-9 h-9 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors -ml-1">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
        </button>
        <h1 className="text-lg font-semibold text-gray-900 flex-1">Профиль</h1>
        <button onClick={logout} className="text-sm text-red-500 hover:text-red-700 font-medium px-3 py-1.5 rounded-xl hover:bg-red-50 transition-colors">
          Выйти
        </button>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {/* Avatar card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {/* Purple banner */}
          <div className="h-24 bg-gradient-to-r from-primary-600 to-primary-800" />
          <div className="px-6 pb-6 -mt-12">
            <div className="relative w-20 h-20 mb-4">
              {uploading ? (
                <div className="w-20 h-20 rounded-2xl bg-gray-100 border-4 border-white shadow flex items-center justify-center">
                  <Spinner size={24} />
                </div>
              ) : (
                <div className="rounded-2xl border-4 border-white shadow overflow-hidden">
                  <Avatar url={user.avatarUrl} nickname={user.nickname} size={80} />
                </div>
              )}
              <button onClick={() => fileRef.current?.click()} disabled={uploading}
                className="absolute -bottom-1 -right-1 w-7 h-7 rounded-xl bg-primary-600 text-white flex items-center justify-center shadow hover:bg-primary-700 transition-colors border-2 border-white"
                title="Изменить аватар">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
                  <circle cx="12" cy="13" r="4"/>
                </svg>
              </button>
            </div>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden" onChange={handleAvatarChange} />
            {error !== null && <ErrorMessage error={error} />}
            <p className="text-xl font-bold text-gray-900">{user.nickname}</p>
            <p className="text-gray-400 text-sm">@{user.username}</p>
            {user.role === 'ADMIN' && (
              <span className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold bg-primary-100 text-primary-700 px-2.5 py-1 rounded-full">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                Администратор
              </span>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
          <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">Аккаунт</h2>
          <InfoRow icon="👤" label="Роль" value={roleLabel[user.role] ?? user.role} />
          {user.email && <InfoRow icon="✉️" label="Email" value={user.email} />}
          <InfoRow icon="📅" label="Регистрация" value={joined} />
        </div>

        {/* Actions */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-2">
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
            } label="Панель администратора" purple />
          )}
        </div>
      </div>
    </div>
  )
}

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="text-base w-5 text-center">{icon}</span>
      <span className="text-gray-500 flex-1">{label}</span>
      <span className="font-medium text-gray-800">{value}</span>
    </div>
  )
}

function ActionLink({ to, icon, label, purple }: { to: string; icon: React.ReactNode; label: string; purple?: boolean }) {
  return (
    <Link to={to} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
      purple ? 'text-primary-700 hover:bg-primary-50' : 'text-gray-700 hover:bg-gray-50'
    }`}>
      <span className={purple ? 'text-primary-600' : 'text-gray-400'}>{icon}</span>
      <span className="font-medium text-sm">{label}</span>
      <svg className="ml-auto text-gray-300" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M9 18l6-6-6-6"/>
      </svg>
    </Link>
  )
}
