import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { profileApi } from '@/api/auth'
import { useAuthStore } from '@/store/auth'
import { Spinner } from '@/components/ui/Spinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'

function toDateInput(value: string | null | undefined): string {
  if (!value) return ''
  try {
    return new Date(value).toISOString().split('T')[0]
  } catch {
    return ''
  }
}

// Зона браузера по умолчанию (используем как авто-значение, если у пользователя не задано).
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

export function EditProfilePage() {
  const navigate = useNavigate()
  const { user, setUser } = useAuthStore()

  const [form, setForm] = useState({
    nickname: user?.nickname ?? '',
    username: user?.username ?? '',
    birthdate: toDateInput(user?.birthdate),
    bio: user?.bio ?? '',
    timezone: user?.timezone ?? browserTimezone(),
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const timezones = timezoneList(form.timezone)

  function set(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((prev) => ({
        ...prev,
        [field]: field === 'username' ? e.target.value.toLowerCase() : e.target.value,
      }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError(null)
    try {
      const res = await profileApi.updateMe({
        nickname: form.nickname || undefined,
        username: form.username || undefined,
        birthdate: form.birthdate || null,
        bio: form.bio.trim() || null,
        timezone: form.timezone || null,
      })
      setUser(res.data.data)
      navigate('/profile')
    } catch (err) { setError(err) }
    finally { setLoading(false) }
  }

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
        <h1 className="text-base font-semibold text-white">Редактировать профиль</h1>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5">
        <div className="rounded-2xl p-5" style={{ background: 'var(--glass-1)', border: '1px solid var(--glass-stroke)' }}>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error !== null && <ErrorMessage error={error} />}

            <div>
              <label className="label">Отображаемое имя</label>
              <input className="input" type="text" value={form.nickname}
                onChange={set('nickname')} maxLength={64} required />
            </div>

            <div>
              <label className="label">Имя пользователя</label>
              <input className="input" type="text" value={form.username}
                onChange={set('username')} pattern="[a-z0-9_]+" minLength={3} maxLength={32} required />
              <p className="text-xs mt-1" style={{ color: 'var(--text-low)' }}>3–32 символа, строчные буквы, цифры, _</p>
            </div>

            <div>
              <label className="label">Дата рождения <span className="font-normal" style={{ color: 'var(--text-low)' }}>(необязательно)</span></label>
              <input className="input" type="date" value={form.birthdate} onChange={set('birthdate')} />
            </div>

            <div>
              <label className="label">О себе <span className="font-normal" style={{ color: 'var(--text-low)' }}>(необязательно)</span></label>
              <textarea
                className="input resize-none"
                rows={4}
                value={form.bio}
                onChange={set('bio')}
                maxLength={500}
                placeholder="Расскажите немного о себе..."
                style={{ height: 'auto' }}
              />
              <p className="text-xs mt-1 text-right" style={{ color: 'var(--text-low)' }}>{form.bio.length}/500</p>
            </div>

            <div>
              <label className="label">Часовой пояс</label>
              <select className="input" value={form.timezone} onChange={set('timezone')}>
                {timezones.map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
              <p className="text-xs mt-1" style={{ color: 'var(--text-low)' }}>
                Время событий и напоминаний показывается в вашем поясе. У собеседника из другого пояса — в его.
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => navigate(-1)} disabled={loading}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors"
                style={{ color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.1)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                Отмена
              </button>
              <button type="submit" className="btn-primary flex-1 py-2.5" disabled={loading}>
                {loading ? <Spinner size={18} /> : 'Сохранить'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
