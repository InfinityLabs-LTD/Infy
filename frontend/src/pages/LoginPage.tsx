import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { authApi } from '@/api/auth'
import { useAuthStore } from '@/store/auth'
import { Spinner } from '@/components/ui/Spinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'

export function LoginPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<unknown>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await authApi.login({ username, password })
      const { user, accessToken, refreshToken } = res.data.data
      setAuth(user, accessToken, refreshToken)
      navigate('/')
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-primary-900 via-primary-800 to-sidebar">
      {/* Left decorative panel */}
      <div className="hidden lg:flex flex-1 flex-col items-center justify-center p-12 text-white">
        <div className="mb-8">
          <div className="w-20 h-20 rounded-3xl bg-white/10 backdrop-blur flex items-center justify-center mb-6">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
            </svg>
          </div>
          <h1 className="text-4xl font-bold mb-3">Infy Messenger</h1>
          <p className="text-white/60 text-lg leading-relaxed max-w-sm">
            Современный мессенджер для общения с близкими и коллегами
          </p>
        </div>
        <div className="space-y-3 w-full max-w-sm">
          {['Мгновенные сообщения', 'Голосовые и видео сообщения', 'Безопасное хранение данных'].map(f => (
            <div key={f} className="flex items-center gap-3 text-white/70">
              <div className="w-5 h-5 rounded-full bg-primary-400/30 flex items-center justify-center shrink-0">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <span className="text-sm">{f}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Right form panel */}
      <div className="w-full lg:w-[420px] flex items-center justify-center p-6 bg-white lg:rounded-l-3xl">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <div className="w-12 h-12 rounded-2xl bg-primary-600 flex items-center justify-center mb-4 lg:hidden">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900">С возвращением!</h2>
            <p className="text-gray-500 mt-1">Войдите в свой аккаунт</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error !== null && <ErrorMessage error={error} />}
            <div>
              <label className="label">Имя пользователя</label>
              <input className="input" type="text" placeholder="your_username"
                autoComplete="username" value={username}
                onChange={e => setUsername(e.target.value.toLowerCase())} required />
            </div>
            <div>
              <label className="label">Пароль</label>
              <input className="input" type="password" placeholder="••••••••"
                autoComplete="current-password" value={password}
                onChange={e => setPassword(e.target.value)} required />
            </div>
            <button type="submit" className="btn-primary w-full py-3 text-base" disabled={loading}>
              {loading ? <Spinner size={18} /> : 'Войти'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-6">
            Нет аккаунта?{' '}
            <Link to="/register" className="text-primary-600 font-semibold hover:text-primary-700">
              Создать аккаунт
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
