import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { AtSign, User, Mail, Calendar, Lock, ShieldCheck, ArrowRight } from 'lucide-react'
import { authApi } from '@/api/auth'
import { useAuthStore } from '@/store/auth'
import { Spinner } from '@/components/ui/Spinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { AuthBackground } from '@/components/auth/AuthBackground'
import { AuthBrandPanel } from '@/components/auth/AuthBrandPanel'
import { InfyLogo } from '@/components/auth/InfyLogo'

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
            <div className="mb-6 flex flex-col items-center text-center lg:hidden">
              <InfyLogo size={56} />
              <span className="mt-3 text-xl font-bold tracking-tight text-white/90">Infy Messenger</span>
            </div>

            <div className="mb-7">
              <h2 className="font-display text-3xl font-bold tracking-tight text-white">
                Создать аккаунт
              </h2>
              <p className="mt-2 text-[15px] text-white/55">Присоединяйтесь к Infy за минуту</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {error !== null && <ErrorMessage error={error} />}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="relative">
                  <AtSign size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/40" />
                  <input
                    className="auth-input" type="text" placeholder="username" autoComplete="username"
                    value={form.username} onChange={set('username')}
                    pattern="[a-z0-9_]+" minLength={3} maxLength={32} required
                  />
                </div>
                <div className="relative">
                  <User size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/40" />
                  <input
                    className="auth-input" type="text" placeholder="Ваше имя"
                    value={form.nickname} onChange={set('nickname')} maxLength={64} required
                  />
                </div>
              </div>
              <p className="-mt-1 pl-1 text-xs text-white/35">3–32 символа: a-z, 0-9, _</p>

              <div className="relative">
                <Mail size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/40" />
                <input
                  className="auth-input" type="email" placeholder="Email (необязательно)"
                  autoComplete="email" value={form.email} onChange={set('email')}
                />
              </div>

              <div className="relative">
                <Calendar size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/40" />
                <input
                  className="auth-input" type="date" value={form.birthdate} onChange={set('birthdate')}
                  aria-label="Дата рождения (необязательно)"
                />
              </div>

              <div className="relative">
                <Lock size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/40" />
                <input
                  className="auth-input" type="password" placeholder="Пароль (мин. 8 символов)"
                  autoComplete="new-password" value={form.password} onChange={set('password')}
                  minLength={8} required
                />
              </div>

              <div className="relative">
                <ShieldCheck size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/40" />
                <input
                  className="auth-input" type="password" placeholder="Повторите пароль"
                  autoComplete="new-password" value={form.passwordConfirm} onChange={set('passwordConfirm')} required
                />
              </div>

              <button type="submit" className="auth-btn group" disabled={loading}>
                {loading ? (
                  <span className="flex items-center justify-center"><Spinner size={18} /></span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    Создать аккаунт
                    <ArrowRight size={18} className="transition-transform duration-300 group-hover:translate-x-1" />
                  </span>
                )}
              </button>
            </form>

            <p className="mt-7 text-center text-[15px] text-white/55">
              Уже есть аккаунт?{' '}
              <Link to="/login" className="font-semibold text-[#B388FF] transition-colors hover:text-white">
                Войти
              </Link>
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
