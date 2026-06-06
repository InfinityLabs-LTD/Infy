import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { profileApi } from '@/api/auth'
import { useAuthStore } from '@/store/auth'
import { Spinner } from '@/components/ui/Spinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'

export function EditProfilePage() {
  const navigate = useNavigate()
  const { user, setUser } = useAuthStore()

  const [form, setForm] = useState({
    nickname: user?.nickname ?? '',
    username: user?.username ?? '',
    birthdate: user?.createdAt ? '' : '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<unknown>(null)

  function set(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({
        ...prev,
        [field]: field === 'username' ? e.target.value.toLowerCase() : e.target.value,
      }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await profileApi.updateMe({
        nickname: form.nickname || undefined,
        username: form.username || undefined,
        birthdate: form.birthdate || null,
      })
      setUser(res.data.data)
      navigate('/profile')
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="btn-ghost p-1">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
        </button>
        <h1 className="text-lg font-semibold">Редактировать профиль</h1>
      </div>

      <div className="max-w-lg mx-auto px-4 py-8">
        <div className="card">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error !== null && <ErrorMessage error={error} />}

            <div>
              <label className="label">Отображаемое имя</label>
              <input
                className="input"
                type="text"
                value={form.nickname}
                onChange={set('nickname')}
                maxLength={64}
                required
              />
            </div>

            <div>
              <label className="label">Имя пользователя</label>
              <input
                className="input"
                type="text"
                value={form.username}
                onChange={set('username')}
                pattern="[a-z0-9_]+"
                minLength={3}
                maxLength={32}
                required
              />
              <p className="text-xs text-gray-400 mt-1">3–32 символа, строчные буквы, цифры, _</p>
            </div>

            <div>
              <label className="label">Дата рождения <span className="text-gray-400">(необязательно)</span></label>
              <input
                className="input"
                type="date"
                value={form.birthdate}
                onChange={set('birthdate')}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="btn-ghost flex-1"
                disabled={loading}
              >
                Отмена
              </button>
              <button type="submit" className="btn-primary flex-1" disabled={loading}>
                {loading ? <Spinner size={18} /> : 'Сохранить'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
