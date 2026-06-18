import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi, profileApi, sessionsApi, Session } from '@/api/auth'
import { useAuthStore } from '@/store/auth'
import { Spinner } from '@/components/ui/Spinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { translateError } from '@/lib/errorMessages'

export function SessionsPage() {
  const navigate = useNavigate()
  const logout = useAuthStore((s) => s.logout)
  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)

  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const [revoking, setRevoking] = useState<string | null>(null)

  // ── Привязка почты ──
  const [mailEnabled, setMailEnabled] = useState(true)
  const [emailInput, setEmailInput] = useState(user?.email ?? '')
  const [codeInput, setCodeInput] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [emailBusy, setEmailBusy] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)

  // ── Смена username ──
  const [usernameInput, setUsernameInput] = useState(user?.username ?? '')
  const [usernameBusy, setUsernameBusy] = useState(false)
  const [usernameError, setUsernameError] = useState<string | null>(null)

  const emailVerified = !!user?.emailVerified

  useEffect(() => {
    profileApi.emailStatus()
      .then(r => setMailEnabled(r.data.data.mailEnabled))
      .catch(() => { /* по умолчанию считаем доступной */ })
  }, [])

  async function handleRequestEmail() {
    setEmailError(null)
    setEmailBusy(true)
    try {
      await profileApi.requestEmail(emailInput.trim())
      setCodeSent(true)
    } catch (err) {
      setEmailError(translateError(err))
    } finally {
      setEmailBusy(false)
    }
  }

  async function handleConfirmEmail() {
    setEmailError(null)
    setEmailBusy(true)
    try {
      const res = await profileApi.confirmEmail(codeInput.trim())
      setUser(res.data.data)
      setCodeSent(false)
      setCodeInput('')
      setEmailInput('')
    } catch (err) {
      setEmailError(translateError(err))
    } finally {
      setEmailBusy(false)
    }
  }

  async function handleChangeUsername() {
    setUsernameError(null)
    const next = usernameInput.trim().toLowerCase()
    if (next === user?.username) {
      setUsernameError('Это уже ваше имя пользователя')
      return
    }
    if (!/^[a-z0-9_]{3,32}$/.test(next)) {
      setUsernameError('3–32 символа: строчные латинские буквы, цифры, _')
      return
    }
    if (!confirm('После смены имени пользователя вы выйдете со всех устройств. Продолжить?')) return
    setUsernameBusy(true)
    try {
      await profileApi.changeUsername(next)
      // Сервер отозвал все сессии — выходим и уводим на логин.
      logout()
      navigate('/login')
    } catch (err) {
      setUsernameError(translateError(err))
      setUsernameBusy(false)
    }
  }

  // ── Смена пароля ──
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwdSaving, setPwdSaving] = useState(false)
  const [pwdError, setPwdError] = useState<string | null>(null)
  const [pwdSaved, setPwdSaved] = useState(false)

  async function handleChangePassword() {
    setPwdError(null); setPwdSaved(false)
    if (newPassword.length < 8) {
      setPwdError('Новый пароль должен быть не короче 8 символов')
      return
    }
    if (newPassword !== confirmPassword) {
      setPwdError('Пароли не совпадают')
      return
    }
    setPwdSaving(true)
    try {
      await authApi.changePassword({ currentPassword, newPassword })
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('')
      setPwdSaved(true)
      setTimeout(() => setPwdSaved(false), 3000)
      // Смена пароля разлогинивает остальные устройства — обновим список.
      await load()
    } catch (err) {
      setPwdError(translateError(err))
    } finally {
      setPwdSaving(false)
    }
  }

  async function load() {
    setLoading(true); setError(null)
    try {
      const res = await sessionsApi.list()
      setSessions(res.data.data)
    } catch (err) { setError(err) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function revoke(id: string, isCurrent: boolean) {
    if (!confirm('Завершить эту сессию?')) return
    setRevoking(id)
    try {
      await sessionsApi.revoke(id)
      if (isCurrent) { logout(); navigate('/login'); return }
      setSessions((prev) => prev.filter((s) => s.id !== id))
    } catch (err) { setError(err) }
    finally { setRevoking(null) }
  }

  async function revokeAll() {
    if (!confirm('Выйти со всех других устройств?')) return
    try {
      await sessionsApi.logoutAll(true)
      await load()
    } catch (err) { setError(err) }
  }

  const otherCount = sessions.filter((s) => !s.isCurrent).length

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-deep)' }}>
      <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3"
        style={{
          background: 'rgba(8,11,22,0.7)',
          backdropFilter: 'blur(24px) saturate(140%)',
          WebkitBackdropFilter: 'blur(24px) saturate(140%)',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
        }}>
        <button onClick={() => navigate(-1)}
          className="w-9 h-9 flex items-center justify-center rounded-xl transition-colors -ml-1"
          style={{ color: 'rgba(255,255,255,0.5)' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
        </button>
        <h1 className="text-base font-semibold text-white">Безопасность</h1>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-3">
        {error !== null && <ErrorMessage error={error} />}

        {/* ── Почта ── */}
        <div className="rounded-2xl p-5" style={{ background: 'var(--glass-1)', border: '1px solid var(--glass-stroke)' }}>
          <h2 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-low)' }}>Почта</h2>

          {emailVerified ? (
            <div className="flex items-center gap-2 text-sm">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full shrink-0"
                style={{ background: 'rgba(34,197,94,0.15)' }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
              </span>
              <span className="text-white truncate">{user?.email}</span>
              <span className="text-xs px-2 py-0.5 rounded-full shrink-0" style={{ background: 'rgba(34,197,94,0.15)', color: '#22C55E' }}>Подтверждена</span>
            </div>
          ) : !mailEnabled ? (
            <p className="text-xs" style={{ color: '#FCD34D' }}>
              Отправка писем не настроена на сервере. Привязка почты временно недоступна.
            </p>
          ) : !codeSent ? (
            <>
              <p className="text-xs mb-3" style={{ color: 'var(--text-low)' }}>
                Привяжите почту, чтобы можно было менять имя пользователя и восстанавливать доступ.
              </p>
              <input
                type="email"
                className="input"
                placeholder="you@example.com"
                autoComplete="email"
                value={emailInput}
                onChange={e => setEmailInput(e.target.value)}
              />
              {emailError && <p className="text-xs mt-2" style={{ color: '#fca5a5' }}>{emailError}</p>}
              <button
                onClick={handleRequestEmail}
                className="btn-primary w-full py-2.5 mt-3"
                disabled={emailBusy || !emailInput.trim()}
              >
                {emailBusy ? <Spinner size={18} /> : 'Отправить код'}
              </button>
            </>
          ) : (
            <>
              <p className="text-xs mb-3" style={{ color: 'var(--text-low)' }}>
                Код отправлен на <span className="text-white">{emailInput}</span>. Введите его ниже (действует 15 минут).
              </p>
              <input
                type="text"
                inputMode="numeric"
                className="input text-center tracking-[0.5em] text-lg"
                placeholder="______"
                maxLength={6}
                value={codeInput}
                onChange={e => setCodeInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
              />
              {emailError && <p className="text-xs mt-2" style={{ color: '#fca5a5' }}>{emailError}</p>}
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => { setCodeSent(false); setCodeInput(''); setEmailError(null) }}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors"
                  style={{ color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.1)' }}>
                  Назад
                </button>
                <button
                  onClick={handleConfirmEmail}
                  className="btn-primary flex-1 py-2.5"
                  disabled={emailBusy || codeInput.length !== 6}
                >
                  {emailBusy ? <Spinner size={18} /> : 'Подтвердить'}
                </button>
              </div>
            </>
          )}
        </div>

        {/* ── Имя пользователя ── */}
        <div className="rounded-2xl p-5" style={{ background: 'var(--glass-1)', border: '1px solid var(--glass-stroke)' }}>
          <h2 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-low)' }}>Имя пользователя</h2>
          {!emailVerified ? (
            <p className="text-xs" style={{ color: 'var(--text-low)' }}>
              Сменить имя пользователя можно только после привязки почты.
            </p>
          ) : (
            <>
              <div className="flex items-stretch gap-2">
                <span className="flex items-center px-3 rounded-xl text-sm shrink-0"
                  style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text-low)' }}>@</span>
                <input
                  type="text"
                  className="input flex-1"
                  value={usernameInput}
                  onChange={e => setUsernameInput(e.target.value.toLowerCase())}
                  minLength={3}
                  maxLength={32}
                  autoComplete="off"
                />
              </div>
              {usernameError && <p className="text-xs mt-2" style={{ color: '#fca5a5' }}>{usernameError}</p>}
              <p className="text-xs mt-2" style={{ color: 'var(--text-low)' }}>
                После смены вы выйдете со всех устройств. 3–32 символа: строчные латинские буквы, цифры, _
              </p>
              <button
                onClick={handleChangeUsername}
                className="btn-primary w-full py-2.5 mt-3"
                disabled={usernameBusy || usernameInput.trim() === user?.username}
              >
                {usernameBusy ? <Spinner size={18} /> : 'Сменить имя пользователя'}
              </button>
            </>
          )}
        </div>

        {/* ── Смена пароля ── */}
        <div className="rounded-2xl p-5" style={{ background: 'var(--glass-1)', border: '1px solid var(--glass-stroke)' }}>
          <h2 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-low)' }}>Смена пароля</h2>
          <div className="space-y-3">
            <input
              type="password"
              className="input"
              placeholder="Текущий пароль"
              autoComplete="current-password"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
            />
            <input
              type="password"
              className="input"
              placeholder="Новый пароль"
              autoComplete="new-password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
            />
            <input
              type="password"
              className="input"
              placeholder="Повторите новый пароль"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
            />
          </div>
          {pwdError && (
            <p className="text-xs mt-2" style={{ color: '#fca5a5' }}>{pwdError}</p>
          )}
          <p className="text-xs mt-2" style={{ color: 'var(--text-low)' }}>
            После смены пароля все остальные устройства будут разлогинены. Минимум 8 символов.
          </p>
          <button
            onClick={handleChangePassword}
            className="btn-primary w-full py-2.5 mt-3"
            disabled={pwdSaving || !currentPassword || !newPassword || !confirmPassword}
          >
            {pwdSaving ? <Spinner size={18} /> : pwdSaved ? 'Пароль изменён ✓' : 'Сменить пароль'}
          </button>
        </div>

        {/* ── Устройства ── */}
        <h2 className="text-xs font-semibold uppercase tracking-wider pt-2 px-1" style={{ color: 'var(--text-low)' }}>Мои устройства</h2>

        {loading ? (
          <div className="flex justify-center py-12"><Spinner size={32} /></div>
        ) : (
          <>
            {sessions.map((session) => (
              <div key={session.id} className="flex items-start justify-between gap-4 rounded-2xl p-4"
                style={{ background: 'var(--glass-1)', border: '1px solid var(--glass-stroke)' }}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" className="shrink-0">
                      <rect x="2" y="3" width="20" height="14" rx="2"/>
                      <path d="M8 21h8M12 17v4"/>
                    </svg>
                    <span className="font-medium text-sm text-white truncate">
                      {session.deviceName ?? 'Неизвестное устройство'}
                    </span>
                    {session.isCurrent && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium shrink-0"
                        style={{ background: 'rgba(34,197,94,0.15)', color: '#22C55E' }}>
                        Текущий
                      </span>
                    )}
                  </div>
                  {session.userAgent && (
                    <p className="text-xs truncate mb-0.5" style={{ color: 'var(--text-low)' }}>{session.userAgent}</p>
                  )}
                  <p className="text-xs" style={{ color: 'var(--text-low)' }}>
                    {session.ip && `${session.ip} · `}
                    Активность {new Date(session.lastActiveAt).toLocaleDateString('ru-RU')}
                  </p>
                </div>
                <button
                  onClick={() => revoke(session.id, session.isCurrent)}
                  disabled={revoking === session.id}
                  className="shrink-0 text-xs font-medium disabled:opacity-50 transition-colors"
                  style={{ color: '#EF4444' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#f87171')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#EF4444')}>
                  {revoking === session.id ? <Spinner size={14} /> : 'Завершить'}
                </button>
              </div>
            ))}

            {otherCount > 0 && (
              <button onClick={revokeAll} className="w-full py-3 rounded-2xl text-sm font-medium transition-colors"
                style={{ color: '#EF4444', border: '1px solid rgba(239,68,68,0.2)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.08)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                Выйти со всех других устройств ({otherCount})
              </button>
            )}

            {sessions.length === 0 && (
              <p className="text-center py-8" style={{ color: 'var(--text-low)' }}>Нет активных сессий</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
