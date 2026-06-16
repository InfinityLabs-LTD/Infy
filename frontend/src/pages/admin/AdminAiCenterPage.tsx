import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { adminApi, AiSettings, AiProvider, AiSettingsUpdate } from '@/api/admin'
import { Spinner } from '@/components/ui/Spinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'

const PROVIDERS: { value: AiProvider; label: string; hint: string }[] = [
  { value: 'ANTHROPIC', label: 'Anthropic · Claude', hint: 'claude-opus-4-8, claude-sonnet-4-6 …' },
  { value: 'OPENAI', label: 'OpenAI · ChatGPT', hint: 'gpt-4o, gpt-4o-mini …' },
]

// Известные модели для выпадающего списка. Всегда доступна опция «Своя…»
// для произвольного ID (нужно при работе со сторонними API типа Artemox/OpenRouter).
const ANTHROPIC_MODELS = [
  'claude-opus-4-8',
  'claude-sonnet-4-6',
  'claude-haiku-4-5-20251001',
  'claude-3-7-sonnet-latest',
]
const OPENAI_MODELS = [
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-4.1',
  'gpt-4.1-mini',
  'o3',
  'o4-mini',
]
const CUSTOM = '__custom__'

export function AdminAiCenterPage() {
  const [settings, setSettings] = useState<AiSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // Локальный draft полей моделей, ключей и base URL.
  const [anthropicModel, setAnthropicModel] = useState('')
  const [openaiModel, setOpenaiModel] = useState('')
  const [anthropicKey, setAnthropicKey] = useState('')   // '' = не менять
  const [openaiKey, setOpenaiKey] = useState('')
  const [anthropicBaseUrl, setAnthropicBaseUrl] = useState('')
  const [openaiBaseUrl, setOpenaiBaseUrl] = useState('')

  function apply(s: AiSettings) {
    setSettings(s)
    setAnthropicModel(s.anthropic.model)
    setOpenaiModel(s.openai.model)
    setAnthropicBaseUrl(s.anthropic.baseUrl)
    setOpenaiBaseUrl(s.openai.baseUrl)
    setAnthropicKey('')
    setOpenaiKey('')
  }

  useEffect(() => {
    adminApi.getAiSettings()
      .then(r => apply(r.data.data))
      .catch(() => setError('Не удалось загрузить настройки AI'))
      .finally(() => setLoading(false))
  }, [])

  async function patch(body: AiSettingsUpdate, keepKeys = false) {
    setSaving(true); setError(null); setSaved(false)
    try {
      const r = await adminApi.updateAiSettings(body)
      // Сохраняем введённые модели/ключи в драфте, если просили.
      const cur = r.data.data
      setSettings(cur)
      if (!keepKeys) { setAnthropicKey(''); setOpenaiKey('') }
      setAnthropicModel(cur.anthropic.model)
      setOpenaiModel(cur.openai.model)
      setAnthropicBaseUrl(cur.anthropic.baseUrl)
      setOpenaiBaseUrl(cur.openai.baseUrl)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {
      setError('Не удалось сохранить настройки')
    } finally { setSaving(false) }
  }

  function saveProviderFields() {
    const body: AiSettingsUpdate = {
      anthropicModel,
      openaiModel,
      anthropicBaseUrl: anthropicBaseUrl.trim(),
      openaiBaseUrl: openaiBaseUrl.trim(),
    }
    if (anthropicKey.trim()) body.anthropicKey = anthropicKey.trim()
    if (openaiKey.trim()) body.openaiKey = openaiKey.trim()
    patch(body)
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
            <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
          </svg>
        </div>
        <div>
          <h1 className="font-display text-xl font-bold text-white leading-tight">AI Center</h1>
          <p className="text-xs" style={{ color: 'var(--text-low)' }}>Управление ассистентом Infy AI</p>
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
          <p className="font-semibold text-white text-sm">Ассистент включён</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-low)' }}>
            Доступ к Infy AI в чатах: поиск по переписке, веб-поиск, планы, подсказки, /ask
          </p>
        </div>
        <Toggle checked={settings.enabled} disabled={saving}
          onChange={(v) => patch({ enabled: v }, true)} />
      </div>

      {/* Выбор провайдера */}
      <div className="glass rounded-2xl p-4 mb-4">
        <p className="font-semibold text-white text-sm mb-3">Провайдер модели</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {PROVIDERS.map(p => {
            const active = settings.provider === p.value
            const hasKey = p.value === 'ANTHROPIC' ? settings.anthropic.hasKey : settings.openai.hasKey
            return (
              <button key={p.value} disabled={saving}
                onClick={() => patch({ provider: p.value }, true)}
                className="text-left rounded-xl p-3 transition-colors"
                style={{
                  background: active ? 'var(--glass-3)' : 'transparent',
                  border: `1px solid ${active ? '#C084FC' : 'rgba(255,255,255,0.08)'}`,
                }}>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm" style={{ color: active ? '#fff' : 'rgba(255,255,255,0.7)' }}>
                    {p.label}
                  </span>
                  {active && <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(168,85,247,0.2)', color: '#C084FC' }}>Активен</span>}
                </div>
                <p className="text-[11px] mt-1" style={{ color: 'var(--text-low)' }}>{p.hint}</p>
                <p className="text-[11px] mt-1" style={{ color: hasKey ? '#34D399' : '#F59E0B' }}>
                  {hasKey ? '● Ключ задан' : '○ Ключ не задан'}
                </p>
              </button>
            )
          })}
        </div>
      </div>

      {/* Веб-поиск */}
      <div className="glass rounded-2xl p-4 mb-4 flex items-center justify-between">
        <div>
          <p className="font-semibold text-white text-sm">Веб-поиск</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-low)' }}>
            Разрешить ассистенту искать актуальную информацию в интернете
          </p>
        </div>
        <Toggle checked={settings.webSearch} disabled={saving}
          onChange={(v) => patch({ webSearch: v }, true)} />
      </div>

      {/* Модели и ключи */}
      <div className="glass rounded-2xl p-4 mb-4 space-y-4">
        <p className="font-semibold text-white text-sm">Модели и API-ключи</p>

        <Field label="Anthropic — модель">
          <ModelSelect value={anthropicModel} options={ANTHROPIC_MODELS}
            placeholder="claude-opus-4-8" onChange={setAnthropicModel} />
        </Field>
        <Field label={`Anthropic — API-ключ${settings.anthropic.hasKey ? ' (задан)' : ''}`}>
          <input value={anthropicKey} onChange={e => setAnthropicKey(e.target.value)} type="password"
            placeholder={settings.anthropic.hasKey ? '•••••••• (оставьте пустым, чтобы не менять)' : 'sk-ant-…'}
            className={inputCls} />
        </Field>
        <Field label="Anthropic — базовый URL (необязательно)">
          <input value={anthropicBaseUrl} onChange={e => setAnthropicBaseUrl(e.target.value)}
            placeholder="https://api.anthropic.com (по умолчанию)" className={inputCls} />
        </Field>

        <div className="h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />

        <Field label="OpenAI — модель">
          <ModelSelect value={openaiModel} options={OPENAI_MODELS}
            placeholder="gpt-4o" onChange={setOpenaiModel} />
        </Field>
        <Field label={`OpenAI — API-ключ${settings.openai.hasKey ? ' (задан)' : ''}`}>
          <input value={openaiKey} onChange={e => setOpenaiKey(e.target.value)} type="password"
            placeholder={settings.openai.hasKey ? '•••••••• (оставьте пустым, чтобы не менять)' : 'sk-…'}
            className={inputCls} />
        </Field>
        <Field label="OpenAI — базовый URL (необязательно)">
          <input value={openaiBaseUrl} onChange={e => setOpenaiBaseUrl(e.target.value)}
            placeholder="https://api.openai.com/v1 · напр. https://api.artemox.com/v1" className={inputCls} />
        </Field>

        <button onClick={saveProviderFields} disabled={saving}
          className="w-full py-2.5 rounded-xl text-sm font-semibold transition-opacity disabled:opacity-50"
          style={{ background: 'var(--grad-own)', color: '#fff', boxShadow: 'var(--glow-primary)' }}>
          {saving ? 'Сохранение…' : 'Сохранить модели и ключи'}
        </button>
      </div>

      <p className="text-[11px]" style={{ color: 'var(--text-low)' }}>
        Ключи хранятся на сервере и не возвращаются в открытом виде. Значения по умолчанию
        можно задать через переменные окружения (ANTHROPIC_API_KEY, OPENAI_API_KEY,
        OPENAI_BASE_URL …). Базовый URL позволяет использовать сторонние OpenAI-совместимые
        провайдеры — выберите провайдер «OpenAI», укажите его URL, ключ и модель.
      </p>
    </div>
  )
}

// bg задаём явно (а не полагаемся на обёртку Field) — иначе input рендерится
// с белым системным фоном, и белый текст/автозаполнение на нём не видны.
const inputCls = 'w-full px-3 py-2 rounded-xl text-sm text-white bg-transparent outline-none transition-colors'

// Опции <select> рендерятся системно — задаём тёмный фон и белый текст явно,
// иначе на белом системном фоне светлый текст сливается.
const optionStyle: React.CSSProperties = { background: '#1a1530', color: '#fff' }

// Выпадающий список моделей с опцией ручного ввода произвольного ID.
function ModelSelect({ value, options, placeholder, onChange }: {
  value: string
  options: string[]
  placeholder: string
  onChange: (v: string) => void
}) {
  // Режим «своя модель»: текущее значение отсутствует в списке (включая пустое),
  // либо пользователь явно выбрал «Своя…».
  const inList = options.includes(value)
  const [custom, setCustom] = useState(!inList && value !== '')

  const showCustom = custom || (!inList && value !== '')
  const selectValue = showCustom ? CUSTOM : (inList ? value : '')

  return (
    <div className="space-y-2">
      <select
        value={selectValue}
        onChange={e => {
          if (e.target.value === CUSTOM) { setCustom(true); onChange('') }
          else { setCustom(false); onChange(e.target.value) }
        }}
        className={inputCls}
        style={{ background: '#1a1530', color: '#fff' }}>
        {selectValue === '' && <option value="" disabled style={optionStyle}>Выберите модель…</option>}
        {options.map(m => (
          <option key={m} value={m} style={optionStyle}>{m}</option>
        ))}
        <option value={CUSTOM} style={optionStyle}>Своя модель…</option>
      </select>
      {showCustom && (
        <input value={value} onChange={e => onChange(e.target.value)}
          placeholder={placeholder} className={inputCls} autoFocus />
      )}
    </div>
  )
}

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
