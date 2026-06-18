import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi, profileApi } from '@/api/auth'
import { translateError } from '@/lib/errorMessages'
import { useAuthStore } from '@/store/auth'
import { useNotifications } from '@/hooks/useNotifications'
import { Spinner } from '@/components/ui/Spinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'

// Зона браузера по умолчанию (авто-значение, если у пользователя не задано).
function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

// Список IANA-зон. Intl.supportedValuesOf есть в современных браузерах; иначе
// — небольшой фолбэк-набор плюс текущая зона пользователя.
function timezoneList(current: string): string[] {
  let list: string[] = []
  try {
    const sv = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf
    if (sv) list = sv('timeZone')
  } catch { /* ignore */ }
  if (list.length === 0) {
    list = [
      'UTC', 'Europe/London', 'Europe/Moscow', 'Europe/Kaliningrad',
      'Asia/Yekaterinburg', 'Asia/Omsk', 'Asia/Krasnoyarsk', 'Asia/Irkutsk',
      'Asia/Yakutsk', 'Asia/Vladivostok', 'Asia/Magadan', 'Asia/Kamchatka',
      'Europe/Kyiv', 'Asia/Almaty', 'Asia/Tashkent', 'America/New_York',
      'America/Los_Angeles', 'Asia/Dubai', 'Asia/Tokyo', 'Asia/Shanghai',
    ]
  }
  if (current && !list.includes(current)) list = [current, ...list]
  return list
}

// Переключатель в стиле приложения.
function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onChange} disabled={disabled}
      className="shrink-0 w-11 h-6 rounded-full relative transition-colors disabled:opacity-50"
      style={{ background: checked ? 'var(--grad-own)' : 'rgba(255,255,255,0.12)' }}>
      <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all"
        style={{ left: checked ? '22px' : '2px' }} />
    </button>
  )
}

export function SettingsPage() {
  const navigate = useNavigate()
  const { user, setUser } = useAuthStore()
  const notifications = useNotifications()

  const [timezone, setTimezone] = useState(user?.timezone ?? browserTimezone())
  const [aiSuggestReplies, setAiSuggestReplies] = useState(user?.aiSuggestReplies ?? true)
  const [notifyPopup, setNotifyPopup] = useState(user?.notifyPopup ?? true)
  const [notifySound, setNotifySound] = useState(user?.notifySound ?? true)
  const [notifyVibrate, setNotifyVibrate] = useState(user?.notifyVibrate ?? true)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [notifBusy, setNotifBusy] = useState(false)

  // ── Смена пароля ──
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwdSaving, setPwdSaving] = useState(false)
  const [pwdError, setPwdError] = useState<string | null>(null)
  const [pwdSaved, setPwdSaved] = useState(false)

  const timezones = timezoneList(timezone)

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
    } catch (err) {
      setPwdError(translateError(err))
    } finally {
      setPwdSaving(false)
    }
  }

  async function handleSave() {
    setSaving(true); setError(null)
    try {
      const res = await profileApi.updateMe({
        timezone: timezone || null,
        aiSuggestReplies,
      })
      setUser(res.data.data)
      setSavedAt(Date.now())
    } catch (err) { setError(err) }
    finally { setSaving(false) }
  }

  // Сохраняем настройку уведомления сразу при переключении (оптимистично).
  async function patchNotifyPref(patch: { notifyPopup?: boolean; notifySound?: boolean; notifyVibrate?: boolean }) {
    try {
      const res = await profileApi.updateMe(patch)
      setUser(res.data.data)
    } catch (err) { setError(err) }
  }

  // Переключение уведомлений: запрос разрешения + подписка / отписка.
  async function toggleNotifications() {
    if (notifBusy) return
    setNotifBusy(true)
    try {
      if (notifications.subscribed) await notifications.disable()
      else await notifications.enable()
    } finally { setNotifBusy(false) }
  }

  if (!user) return null

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
        <h1 className="text-base font-semibold text-white">Настройки</h1>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-3">
        {error !== null && <ErrorMessage error={error} />}

        {/* ── Уведомления ── */}
        <div className="rounded-2xl p-5" style={{ background: 'var(--glass-1)', border: '1px solid var(--glass-stroke)' }}>
          <h2 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-low)' }}>Уведомления</h2>
          {!notifications.supported ? (
            <p className="text-xs" style={{ color: 'var(--text-low)' }}>
              Этот браузер не поддерживает push-уведомления.
            </p>
          ) : notifications.needsIosInstall ? (
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-low)' }}>
              На iOS уведомления работают только в установленном на экран «Домой» приложении.
              Добавьте Infy на экран «Домой» и включите их снова.
            </p>
          ) : notifications.permission === 'denied' ? (
            <p className="text-xs leading-relaxed" style={{ color: '#FCD34D' }}>
              Уведомления заблокированы в настройках браузера. Разрешите их для этого сайта, чтобы включить.
            </p>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white">Push-уведомления</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-low)' }}>
                    Сообщения и напоминания, когда вкладка закрыта или неактивна.
                  </p>
                </div>
                {notifBusy ? <Spinner size={18} /> : (
                  <Toggle checked={notifications.subscribed} onChange={toggleNotifications} />
                )}
              </div>

              {/* Подробные настройки — только при включённых уведомлениях */}
              {notifications.subscribed && (
                <div className="mt-4 pt-4 space-y-4" style={{ borderTop: '1px solid var(--glass-stroke)' }}>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white">Всплывающие уведомления</p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-low)' }}>Показывать баннер уведомления</p>
                    </div>
                    <Toggle checked={notifyPopup} onChange={() => {
                      const v = !notifyPopup; setNotifyPopup(v); patchNotifyPref({ notifyPopup: v })
                    }} />
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white">Звук</p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-low)' }}>Звуковой сигнал уведомления</p>
                    </div>
                    <Toggle checked={notifySound} disabled={!notifyPopup} onChange={() => {
                      const v = !notifySound; setNotifySound(v); patchNotifyPref({ notifySound: v })
                    }} />
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white">Вибрация</p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-low)' }}>Вибрация при уведомлении (на телефоне)</p>
                    </div>
                    <Toggle checked={notifyVibrate} disabled={!notifyPopup} onChange={() => {
                      const v = !notifyVibrate; setNotifyVibrate(v); patchNotifyPref({ notifyVibrate: v })
                    }} />
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Infy Pulse ── */}
        <div className="rounded-2xl p-5" style={{ background: 'var(--glass-1)', border: '1px solid var(--glass-stroke)' }}>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: 'var(--grad-own)', boxShadow: 'var(--glow-primary)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-white">Infy Pulse</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white">Предлагать ответы</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-low)' }}>
                Подсказки над полем ввода: варианты ответа на сообщение собеседника в вашей манере.
              </p>
            </div>
            <Toggle checked={aiSuggestReplies} onChange={() => setAiSuggestReplies(v => !v)} />
          </div>
        </div>

        {/* ── Часовой пояс ── */}
        <div className="rounded-2xl p-5" style={{ background: 'var(--glass-1)', border: '1px solid var(--glass-stroke)' }}>
          <h2 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-low)' }}>Часовой пояс</h2>
          <select className="input" value={timezone} onChange={e => setTimezone(e.target.value)}>
            {timezones.map((tz) => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
          </select>
          <p className="text-xs mt-2" style={{ color: 'var(--text-low)' }}>
            Время событий и напоминаний показывается в вашем поясе. У собеседника из другого пояса — в его.
          </p>
        </div>

        <button onClick={handleSave} className="btn-primary w-full py-2.5" disabled={saving}>
          {saving ? <Spinner size={18} /> : savedAt ? 'Сохранено ✓' : 'Сохранить'}
        </button>

        {/* ── Смена пароля ── */}
        <div className="rounded-2xl p-5" style={{ background: 'var(--glass-1)', border: '1px solid var(--glass-stroke)' }}>
          <h2 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-low)' }}>Пароль</h2>
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
      </div>
    </div>
  )
}
