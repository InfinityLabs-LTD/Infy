import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { AtSign, Lock, ArrowRight } from 'lucide-react'
import { authApi } from '@/api/auth'
import { useAuthStore } from '@/store/auth'
import { Spinner } from '@/components/ui/Spinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { AuthBackground } from '@/components/auth/AuthBackground'
import { AuthBrandPanel } from '@/components/auth/AuthBrandPanel'
import { InfyLogo } from '@/components/auth/InfyLogo'

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
    <div className="relative min-h-screen w-full overflow-hidden">
      <AuthBackground />

      <div className="relative grid min-h-screen grid-cols-1 lg:grid-cols-2">
        {/* Левая часть — бренд (только desktop) */}
        <AuthBrandPanel />

        {/* Правая часть — форма */}
        <div className="flex items-center justify-center px-5 py-10 sm:px-8">
          <motion.div
            initial={{ opacity: 0, y: 28, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.6, ease: [0.32, 0.72, 0, 1] }}
            className="auth-glass w-full max-w-md p-7 sm:p-9"
          >
            {/* Логотип сверху на мобильных */}
            <div className="mb-6 flex flex-col items-center text-center lg:hidden">
              <InfyLogo size={56} />
              <span className="mt-3 text-xl font-bold tracking-tight text-white/90">Infy Messenger</span>
            </div>

            <div className="mb-7">
              <h2 className="font-display text-3xl font-bold tracking-tight text-white">
                Добро пожаловать обратно
              </h2>
              <p className="mt-2 text-[15px] text-white/55">Войдите в свой аккаунт Infy</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {error !== null && <ErrorMessage error={error} />}

              <div className="relative">
                <AtSign
                  size={18}
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/40"
                />
                <input
                  className="auth-input"
                  type="text"
                  placeholder="Имя пользователя"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase())}
                  required
                />
              </div>

              <div className="relative">
                <Lock
                  size={18}
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/40"
                />
                <input
                  className="auth-input"
                  type="password"
                  placeholder="Пароль"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <div className="flex justify-end">
                <Link
                  to="/forgot-password"
                  className="text-sm font-medium text-white/50 transition-colors hover:text-[#B388FF]"
                >
                  Восстановить пароль
                </Link>
              </div>

              <button type="submit" className="auth-btn group" disabled={loading}>
                {loading ? (
                  <span className="flex items-center justify-center">
                    <Spinner size={18} />
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    Войти
                    <ArrowRight
                      size={18}
                      className="transition-transform duration-300 group-hover:translate-x-1"
                    />
                  </span>
                )}
              </button>
            </form>

            <p className="mt-7 text-center text-[15px] text-white/55">
              Нет аккаунта?{' '}
              <Link
                to="/register"
                className="font-semibold text-[#B388FF] transition-colors hover:text-white"
              >
                Создать аккаунт
              </Link>
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
