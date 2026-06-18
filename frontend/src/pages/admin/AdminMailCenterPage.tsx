import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { adminApi, MailSettings, MailSettingsUpdate } from '@/api/admin'
import { Spinner } from '@/components/ui/Spinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { translateError } from '@/lib/errorMessages'

export function AdminMailCenterPage() {
  const [settings, setSettings] = useState<MailSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // Локальный draft полей формы.
  const [host, setHost] = useState('')
  const [port, setPort] = useState(587)
  const [secure, setSecure] = useState(false)
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')     // '' = не менять
  const [from, setFrom] = useState('')
  const [fromName, setFromName] = useState('')

  // Тестовая отправка.
  const [testTo, setTestTo] = useState('')
  const [testing, setTesting] = useState(false)
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null)

  function apply(s: MailSettings) {
    setSettings(s)
    setHost(s.host)
    setPort(s.port)
    setSecure(s.secure)
    setUser(s.user)
    setFrom(s.from)
    setFromName(s.fromName)
    setPass('')
  }

  useEffect(() => {
    adminApi.getMailSettings()
      .then(r => apply(r.data.data))
      .catch(() => setError('Не удалось загрузить настройки почты'))
      .finally(() => setLoading(false))
  }, [])

  async function patch(body: MailSettingsUpdate, keepDraft = false) {
    setSaving(true); setError(null); setSaved(false)
    try {
      const r = await adminApi.updateMailSettings(body)
      if (keepDraft) setSettings(r.data.data)
      else apply(r.data.data)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError(translateError(err))
    } finally { setSaving(false) }
  }

  function saveServer() {
    const body: MailSettingsUpdate = {
      host: host.trim(),
      port,
      secure,
      user: user.trim(),
      from: from.trim(),
      fromName: fromName.trim(),
    }
    if (pass.trim()) body.pass = pass.trim()
    patch(body)
  }

  async function sendTest() {
    setTesting(true); setTestMsg(null)
    try {
      await adminApi.sendTestEmail(testTo.trim())
      setTestMsg({ ok: true, text: 'Письмо отправлено. Проверьте ящик (и «Спам»).' })
    } catch (err) {
      setTestMsg({ ok: false, text: translateError(err) })
    } finally { setTesting(false) }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-24"><Spinner size={28} /></div>
  }
  if (!settings) {
    return <div className="p-6"><ErrorMessage error={error ?? 'Ошибка'} /></div>
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl">
      {/* Заголовок */}
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: 'var(--grad-own)', boxShadow: 'var(--glow-primary)' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 5L2 7" />
          </svg>
        </div>
        <div>
          <h1 className="font-display text-xl font-bold text-white leading-tight">Почта</h1>
          <p className="text-xs" style={{ color: 'var(--text-low)' }}>Настройка SMTP для отправки писем</p>
        </div>
        {saved && (
          <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="ml-auto text-xs px-2.5 py-1 rounded-full"
            style={{ background: 'rgba(52,211,153,0.15)', color: '#34D399' }}>
            Сохранено
          </motion.span>
        )}
      </div>

      {error && <div className="mb-4"><ErrorMessage error={error} /></div>}

      {/* Общий тумблер */}
      <div className="glass rounded-2xl p-4 mb-4 flex items-center justify-between">
        <div>
          <p className="font-semibold text-white text-sm">Отправка почты включена</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-low)' }}>
            Нужна для привязки почты и смены имени пользователя. Без неё эти функции недоступны.
          </p>
        </div>
        <Toggle checked={settings.enabled} disabled={saving}
          onChange={(v) => patch({ enabled: v }, true)} />
      </div>

      {/* SMTP-сервер */}
      <div className="glass rounded-2xl p-4 mb-4 space-y-4">
        <p className="font-semibold text-white text-sm">SMTP-сервер</p>
        <p className="text-[11px] -mt-2" style={{ color: 'var(--text-low)' }}>
          Параметры выдаёт провайдер. Для smtp.bz: host <code>connect.smtp.bz</code>, порт 587 (STARTTLS) или 465 (SSL), логин и пароль из кабинета.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <Field label="Хост">
              <input value={host} onChange={e => setHost(e.target.value)}
                placeholder="connect.smtp.bz" className={inputCls} />
            </Field>
          </div>
          <Field label="Порт">
            <input value={port} onChange={e => setPort(Number(e.target.value) || 0)}
              type="number" min={1} max={65535} placeholder="587" className={inputCls} />
          </Field>
        </div>

        <label className="flex items-center justify-between">
          <span className="text-xs" style={{ color: 'var(--text-mid)' }}>
            SSL/TLS (порт 465). Выкл — STARTTLS (587/25)
          </span>
          <Toggle checked={secure} disabled={saving} onChange={setSecure} />
        </label>

        <Field label="Логин (SMTP user)">
          <input value={user} onChange={e => setUser(e.target.value)}
            placeholder="логин из кабинета smtp.bz" className={inputCls} autoComplete="off" />
        </Field>
        <Field label={`Пароль${settings.hasPass ? ' (задан)' : ''}`}>
          <input value={pass} onChange={e => setPass(e.target.value)} type="password"
            placeholder={settings.hasPass ? '•••••••• (оставьте пустым, чтобы не менять)' : 'пароль из кабинета'}
            className={inputCls} autoComplete="new-password" />
        </Field>

        <div className="h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />

        <Field label="Адрес отправителя (From)">
          <input value={from} onChange={e => setFrom(e.target.value)}
            placeholder="no-reply@infyme.ru" className={inputCls} />
        </Field>
        <Field label="Имя отправителя">
          <input value={fromName} onChange={e => setFromName(e.target.value)}
            placeholder="Infy" className={inputCls} />
        </Field>

        <button onClick={saveServer} disabled={saving}
          className="w-full py-2.5 rounded-xl text-sm font-semibold transition-opacity disabled:opacity-50"
          style={{ background: 'var(--grad-own)', color: '#fff', boxShadow: 'var(--glow-primary)' }}>
          {saving ? 'Сохранение…' : 'Сохранить настройки SMTP'}
        </button>
      </div>

      {/* Тестовая отправка */}
      <div className="glass rounded-2xl p-4 mb-4 space-y-3">
        <p className="font-semibold text-white text-sm">Проверка</p>
        <p className="text-[11px] -mt-1" style={{ color: 'var(--text-low)' }}>
          Сначала сохраните настройки, затем отправьте тестовое письмо на любой адрес.
        </p>
        <div className="flex gap-2">
          <div className="flex-1" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12 }}>
            <input value={testTo} onChange={e => setTestTo(e.target.value)} type="email"
              placeholder="you@example.com" className={inputCls} />
          </div>
          <button onClick={sendTest} disabled={testing || !testTo.trim()}
            className="px-4 rounded-xl text-sm font-semibold transition-opacity disabled:opacity-50 shrink-0"
            style={{ background: 'rgba(255,255,255,0.08)', color: '#fff', border: '1px solid rgba(255,255,255,0.12)' }}>
            {testing ? 'Отправка…' : 'Отправить тест'}
          </button>
        </div>
        {testMsg && (
          <p className="text-xs" style={{ color: testMsg.ok ? '#34D399' : '#fca5a5' }}>{testMsg.text}</p>
        )}
      </div>

      <p className="text-[11px]" style={{ color: 'var(--text-low)' }}>
        Пароль хранится на сервере и не возвращается в открытом виде. Значения по умолчанию
        можно задать через переменные окружения (MAIL_SMTP_HOST, MAIL_SMTP_PORT, MAIL_SMTP_USER,
        MAIL_SMTP_PASS, MAIL_FROM …) — настройки из админки имеют приоритет.
      </p>
    </div>
  )
}

const inputCls = 'w-full px-3 py-2 rounded-xl text-sm text-white bg-transparent outline-none transition-colors'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs mb-1.5 block" style={{ color: 'var(--text-mid)' }}>{label}</span>
      <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12 }}>
        {children}
      </div>
    </label>
  )
}

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="relative w-12 h-7 rounded-full transition-colors shrink-0 disabled:opacity-50"
      style={{ background: checked ? 'var(--grad-own)' : 'rgba(255,255,255,0.12)' }}>
      <motion.span
        className="absolute top-1 left-1 w-5 h-5 rounded-full bg-white"
        animate={{ x: checked ? 20 : 0 }}
        transition={{ type: 'spring', stiffness: 500, damping: 32 }} />
    </button>
  )
}
