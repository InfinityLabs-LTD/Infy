import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Lock, ArrowRight, CheckCircle2 } from 'lucide-react'
import { authApi } from '@/api/auth'
import { Spinner } from '@/components/ui/Spinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { AuthBackground } from '@/components/auth/AuthBackground'
import { AuthBrandPanel } from '@/components/auth/AuthBrandPanel'
import { InfyLogo } from '@/components/auth/InfyLogo'

type State =
  | { kind: 'checking' }
  | { kind: 'invalid' }
  | { kind: 'ready'; user: { username: string; nickname: string } | null }
  | { kind: 'done' }

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [state, setState] = useState<State>({ kind: 'checking' })
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    if (!token) { setState({ kind: 'invalid' }); return }
    authApi.validateResetToken(token)
      .then(r => {
        if (r.data.data.valid) setState({ kind: 'ready', user: r.data.data.user })
        else setState({ kind: 'invalid' })
      })
      .catch(() => setState({ kind: 'invalid' }))
  }, [token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) { setError(new Error('Пароль должен быть не короче 8 символов')); return }
    if (password.length > 128) { setError(new Error('Пароль не может быть длиннее 128 символов')); return }
    if (password !== confirm) { setError(new Error('Пароли не совпадают')); return }
    setLoading(true)
    try {
      await authApi.resetPassword({ token, password })
      setState({ kind: 'done' })
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
        <AuthBrandPanel />

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

            {state.kind === 'checking' && (
              <div className="flex flex-col items-center py-10">
                <Spinner size={28} />
                <p className="mt-4 text-sm text-white/55">Проверяем ссылку…</p>
              </div>
            )}

            {state.kind === 'invalid' && (
              <div className="text-center">
                <h2 className="font-display text-2xl font-bold text-white">Ссылка недействительна</h2>
                <p className="mt-3 text-[15px] text-white/55">
                  Срок действия ссылки истёк или она уже была использована.
                  Попросите администратора выдать новую.
                </p>
                <Link to="/login"
                  className="mt-6 inline-block font-semibold text-[#B388FF] transition-colors hover:text-white">
                  Вернуться ко входу
                </Link>
              </div>
            )}

            {state.kind === 'done' && (
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full"
                  style={{ background: 'rgba(34,197,94,0.15)' }}>
                  <CheckCircle2 size={30} className="text-green-400" />
                </div>
                <h2 className="font-display text-2xl font-bold text-white">Пароль изменён</h2>
                <p className="mt-3 text-[15px] text-white/55">
                  Теперь вы можете войти в аккаунт с новым паролем.
                </p>
                <button onClick={() => navigate('/login')} className="auth-btn group mt-6">
                  <span className="flex items-center justify-center gap-2">
                    Войти
                    <ArrowRight size={18} className="transition-transform duration-300 group-hover:translate-x-1" />
                  </span>
                </button>
              </div>
            )}

            {state.kind === 'ready' && (
              <>
                <div className="mb-7">
                  <h2 className="font-display text-3xl font-bold tracking-tight text-white">
                    Новый пароль
                  </h2>
                  <p className="mt-2 text-[15px] text-white/55">
                    {state.user
                      ? <>Задайте новый пароль для аккаунта <span className="text-white/80">@{state.user.username}</span></>
                      : 'Задайте новый пароль для своего аккаунта'}
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  {error !== null && <ErrorMessage error={error} />}

                  <div className="relative">
                    <Lock size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/40" />
                    <input
                      className="auth-input"
                      type="password"
                      placeholder="Новый пароль"
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      maxLength={128}
                      required
                    />
                  </div>

                  <div className="relative">
                    <Lock size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/40" />
                    <input
                      className="auth-input"
                      type="password"
                      placeholder="Повторите пароль"
                      autoComplete="new-password"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      maxLength={128}
                      required
                    />
                  </div>

                  <button type="submit" className="auth-btn group" disabled={loading}>
                    {loading ? (
                      <span className="flex items-center justify-center"><Spinner size={18} /></span>
                    ) : (
                      <span className="flex items-center justify-center gap-2">
                        Сменить пароль
                        <ArrowRight size={18} className="transition-transform duration-300 group-hover:translate-x-1" />
                      </span>
                    )}
                  </button>
                </form>
              </>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  )
}
