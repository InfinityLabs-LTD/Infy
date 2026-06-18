import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Mail, ArrowRight, ArrowLeft, CheckCircle2 } from 'lucide-react'
import { authApi } from '@/api/auth'
import { Spinner } from '@/components/ui/Spinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { AuthBackground } from '@/components/auth/AuthBackground'
import { AuthBrandPanel } from '@/components/auth/AuthBrandPanel'
import { InfyLogo } from '@/components/auth/InfyLogo'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<unknown>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await authApi.forgotPassword(email.trim())
      setDone(true)
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

            {done ? (
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full"
                  style={{ background: 'rgba(34,197,94,0.15)' }}>
                  <CheckCircle2 size={30} className="text-green-400" />
                </div>
                <h2 className="font-display text-2xl font-bold text-white">Письмо отправлено</h2>
                <p className="mt-3 text-[15px] text-white/55">
                  Если аккаунт с таким адресом существует, мы отправили ссылку для сброса пароля.
                  Проверьте папку «Спам», если письмо не пришло.
                </p>
                <Link to="/login"
                  className="mt-6 inline-flex items-center gap-1.5 font-semibold text-[#B388FF] transition-colors hover:text-white">
                  <ArrowLeft size={16} />
                  Вернуться ко входу
                </Link>
              </div>
            ) : (
              <>
                <div className="mb-7">
                  <h2 className="font-display text-3xl font-bold tracking-tight text-white">
                    Восстановление пароля
                  </h2>
                  <p className="mt-2 text-[15px] text-white/55">
                    Введите почту, привязанную к аккаунту. Мы пришлём ссылку для сброса пароля.
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  {error !== null && <ErrorMessage error={error} />}

                  <div className="relative">
                    <Mail
                      size={18}
                      className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/40"
                    />
                    <input
                      className="auth-input"
                      type="email"
                      placeholder="your@email.com"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>

                  <button type="submit" className="auth-btn group" disabled={loading}>
                    {loading ? (
                      <span className="flex items-center justify-center"><Spinner size={18} /></span>
                    ) : (
                      <span className="flex items-center justify-center gap-2">
                        Отправить ссылку
                        <ArrowRight size={18} className="transition-transform duration-300 group-hover:translate-x-1" />
                      </span>
                    )}
                  </button>
                </form>

                <p className="mt-7 text-center text-[15px] text-white/55">
                  Вспомнили пароль?{' '}
                  <Link to="/login" className="font-semibold text-[#B388FF] transition-colors hover:text-white">
                    Войти
                  </Link>
                </p>
              </>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  )
}
