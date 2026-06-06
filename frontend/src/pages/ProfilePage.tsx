import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { profileApi } from '@/api/auth'
import { useAuthStore } from '@/store/auth'
import { Avatar } from '@/components/ui/Avatar'
import { Spinner } from '@/components/ui/Spinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'

export function ProfilePage() {
  const { user, setUser, logout } = useAuthStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<unknown>(null)

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      await profileApi.uploadAvatar(file)
      const res = await profileApi.getMe()
      setUser(res.data.data)
    } catch (err) {
      setError(err)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  if (!user) return null

  const joined = new Date(user.createdAt).toLocaleDateString('ru-RU', {
    year: 'numeric', month: 'long', day: 'numeric',
  })

  const roleLabel: Record<string, string> = { USER: 'Пользователь', ADMIN: 'Администратор' }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Профиль</h1>
        <button onClick={logout} className="btn-ghost text-red-500 text-sm">Выйти</button>
      </div>

      <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
        {/* Avatar card */}
        <div className="card flex flex-col items-center gap-4">
          <div className="relative">
            {uploading ? (
              <div className="w-24 h-24 rounded-full bg-gray-100 flex items-center justify-center">
                <Spinner size={28} />
              </div>
            ) : (
              <Avatar url={user.avatarUrl} nickname={user.nickname} size={96} />
            )}
            <button
              onClick={() => fileRef.current?.click()}
              className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-primary-600 text-white flex items-center justify-center shadow-lg hover:bg-primary-700 transition-colors"
              disabled={uploading}
              title="Изменить аватар"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            className="hidden"
            onChange={handleAvatarChange}
          />
          {error !== null && <ErrorMessage error={error} />}

          <div className="text-center">
            <p className="text-xl font-semibold">{user.nickname}</p>
            <p className="text-gray-500 text-sm">@{user.username}</p>
          </div>
        </div>

        {/* Info card */}
        <div className="card space-y-3">
          <h2 className="font-semibold text-gray-700">Информация об аккаунте</h2>
          <InfoRow label="Роль" value={roleLabel[user.role] ?? user.role} />
          {user.email && <InfoRow label="Email" value={user.email} />}
          <InfoRow label="Регистрация" value={joined} />
        </div>

        {/* Actions */}
        <div className="card space-y-2">
          <Link to="/profile/edit" className="btn-ghost w-full justify-start gap-3">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            Редактировать профиль
          </Link>
          <Link to="/sessions" className="btn-ghost w-full justify-start gap-3">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="3" width="20" height="14" rx="2"/>
              <path d="M8 21h8M12 17v4"/>
            </svg>
            Мои устройства
          </Link>
        </div>
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}
