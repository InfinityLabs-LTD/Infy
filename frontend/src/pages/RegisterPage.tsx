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
    <div className="min-h-screen flex" style={{ background: 'var(--bg-deep)' }}>
      <div className="chat-bg hidden lg:flex flex-1 flex-col items-center justify-center p-12 text-white"
        style={{ borderRight: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="w-20 h-20 rounded-3xl flex items-center justify-center mb-6"
          style={{ background: 'rgba(124,58,237,0.18)', border: '1px solid rgba(168,85,247,0.3)' }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#A855F7" strokeWidth="1.5">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
          </svg>
        </div>
        <h1 className="text-4xl font-bold mb-3">Присоединяйтесь</h1>
        <p className="text-lg max-w-sm text-center" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Создайте аккаунт и начните общаться прямо сейчас
        </p>
      </div>

      <div className="w-full lg:w-[460px] flex items-center justify-center p-6 overflow-y-auto" style={{ background: 'var(--bg-deep)' }}>
        <div className="w-full max-w-sm py-8">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-white">Создать аккаунт</h2>
            <p className="mt-1" style={{ color: 'var(--text-low)' }}>Заполните информацию ниже</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error !== null && <ErrorMessage error={error} />}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Имя пользователя</label>
                <input className="input" type="text" placeholder="username" autoComplete="username"
                  value={form.username} onChange={set('username')}
                  pattern="[a-z0-9_]+" minLength={3} maxLength={32} required />
                <p className="text-xs mt-1" style={{ color: 'var(--text-low)' }}>3–32 символа, a-z, 0-9, _</p>
              </div>
              <div>
                <label className="label">Отображаемое имя</label>
                <input className="input" type="text" placeholder="Ваше имя"
                  value={form.nickname} onChange={set('nickname')} maxLength={64} required />
              </div>
            </div>

            <div>
              <label className="label">Email <span className="font-normal" style={{ color: 'var(--text-low)' }}>(необязательно)</span></label>
              <input className="input" type="email" placeholder="you@example.com"
                autoComplete="email" value={form.email} onChange={set('email')} />
            </div>

            <div>
              <label className="label">Дата рождения <span className="font-normal" style={{ color: 'var(--text-low)' }}>(необязательно)</span></label>
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

          <p className="text-center text-sm mt-6" style={{ color: 'var(--text-low)' }}>
            Уже есть аккаунт?{' '}
            <Link to="/login" className="font-semibold" style={{ color: '#C084FC' }}>Войти</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
