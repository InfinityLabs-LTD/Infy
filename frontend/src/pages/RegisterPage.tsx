import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { authApi } from '@/api/auth'
import { useAuthStore } from '@/store/auth'
import { Spinner } from '@/components/ui/Spinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'

export function RegisterPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [form, setForm] = useState({ username: '', nickname: '', password: '', passwordConfirm: '', email: '', birthdate: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<unknown>(null)

  function set(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm(prev => ({ ...prev, [field]: field === 'username' ? e.target.value.toLowerCase() : e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (form.password !== form.passwordConfirm) { setError(new Error('Пароли не совпадают')); return }
    setLoading(true); setError(null)
    try {
      const res = await authApi.register({
        username: form.username, nickname: form.nickname, password: form.password,
        email: form.email || undefined, birthdate: form.birthdate || undefined,
      })
      const { user, accessToken, refreshToken } = res.data.data
      setAuth(user, accessToken, refreshToken)
      navigate('/')
    } catch (err) { setError(err) }
    finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-primary-900 via-primary-800 to-sidebar">
      <div className="hidden lg:flex flex-1 flex-col items-center justify-center p-12 text-white">
        <div className="w-20 h-20 rounded-3xl bg-white/10 backdrop-blur flex items-center justify-center mb-6">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
          </svg>
        </div>
        <h1 className="text-4xl font-bold mb-3">Присоединяйтесь</h1>
        <p className="text-white/60 text-lg max-w-sm text-center">Создайте аккаунт и начните общаться прямо сейчас</p>
      </div>

      <div className="w-full lg:w-[460px] flex items-center justify-center p-6 bg-white lg:rounded-l-3xl overflow-y-auto">
        <div className="w-full max-w-sm py-8">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Создать аккаунт</h2>
            <p className="text-gray-500 mt-1">Заполните информацию ниже</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error !== null && <ErrorMessage error={error} />}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Имя пользователя</label>
                <input className="input" type="text" placeholder="username" autoComplete="username"
                  value={form.username} onChange={set('username')}
                  pattern="[a-z0-9_]+" minLength={3} maxLength={32} required />
                <p className="text-xs text-gray-400 mt-1">3–32 символа, a-z, 0-9, _</p>
              </div>
              <div>
                <label className="label">Отображаемое имя</label>
                <input className="input" type="text" placeholder="Ваше имя"
                  value={form.nickname} onChange={set('nickname')} maxLength={64} required />
              </div>
            </div>

            <div>
              <label className="label">Email <span className="text-gray-400 font-normal">(необязательно)</span></label>
              <input className="input" type="email" placeholder="you@example.com"
                autoComplete="email" value={form.email} onChange={set('email')} />
            </div>

            <div>
              <label className="label">Дата рождения <span className="text-gray-400 font-normal">(необязательно)</span></label>
              <input className="input" type="date" value={form.birthdate} onChange={set('birthdate')} />
            </div>

            <div>
              <label className="label">Пароль</label>
              <input className="input" type="password" placeholder="Мин. 8 символов"
                autoComplete="new-password" value={form.password} onChange={set('password')}
                minLength={8} required />
            </div>

            <div>
              <label className="label">Подтвердите пароль</label>
              <input className="input" type="password" placeholder="Повторите пароль"
                autoComplete="new-password" value={form.passwordConfirm}
                onChange={set('passwordConfirm')} required />
            </div>

            <button type="submit" className="btn-primary w-full py-3 text-base" disabled={loading}>
              {loading ? <Spinner size={18} /> : 'Создать аккаунт'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-6">
            Уже есть аккаунт?{' '}
            <Link to="/login" className="text-primary-600 font-semibold hover:text-primary-700">Войти</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
