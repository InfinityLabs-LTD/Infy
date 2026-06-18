import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { adminApi, AdminBadge } from '@/api/admin'
import { Spinner } from '@/components/ui/Spinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'

// Несколько готовых RGB-пресетов цвета, чтобы быстро выбрать оттенок бейджа.
const COLOR_PRESETS = [
  { name: 'Sky', rgb: '56,189,248' },
  { name: 'Violet', rgb: '168,85,247' },
  { name: 'Green', rgb: '34,197,94' },
  { name: 'Amber', rgb: '251,191,36' },
  { name: 'Pink', rgb: '236,72,153' },
  { name: 'Indigo', rgb: '99,102,241' },
  { name: 'Red', rgb: '239,68,68' },
]

const EMPTY = { slug: '', label: '', color: '168,85,247', icon: '⭐', description: '' }

export function AdminBadgesPage() {
  const [badges, setBadges] = useState<AdminBadge[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const [editing, setEditing] = useState<AdminBadge | null>(null)
  const [creating, setCreating] = useState(false)

  function reload() {
    setLoading(true)
    adminApi.listBadges()
      .then(r => setBadges(r.data.data))
      .catch(e => setError(e))
      .finally(() => setLoading(false))
  }

  useEffect(reload, [])

  async function remove(b: AdminBadge) {
    if (!confirm(`Удалить бейдж «${b.label}»? Он снимется у всех пользователей.`)) return
    try {
      await adminApi.deleteBadge(b.id)
      setBadges(prev => prev.filter(x => x.id !== b.id))
    } catch (e) { setError(e) }
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="font-display text-xl font-bold text-white">Бейджи профиля</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-low)' }}>
            Каталог бейджей, которые можно выдавать пользователям на странице профиля.
          </p>
        </div>
        <button onClick={() => { setCreating(true); setEditing(null) }} className="btn-primary px-4 py-2 text-sm">
          + Создать
        </button>
      </div>

      {error !== null && <div className="mb-4"><ErrorMessage error={error} /></div>}

      {(creating || editing) && (
        <BadgeForm
          initial={editing ?? EMPTY}
          isEdit={!!editing}
          onCancel={() => { setCreating(false); setEditing(null) }}
          onSaved={() => { setCreating(false); setEditing(null); reload() }}
          onError={setError}
        />
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size={28} /></div>
      ) : badges.length === 0 ? (
        <p className="text-sm py-8 text-center" style={{ color: 'var(--text-low)' }}>
          Бейджей пока нет. Создайте первый.
        </p>
      ) : (
        <div className="space-y-2">
          {badges.map(b => (
            <motion.div key={b.id}
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              className="glass rounded-2xl p-4 flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full shrink-0"
                style={{ background: `rgba(${b.color},0.16)`, color: `rgb(${b.color})` }}>
                <span aria-hidden>{b.icon}</span>{b.label}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white/90 truncate">
                  <span className="font-mono text-xs" style={{ color: 'var(--text-low)' }}>{b.slug}</span>
                  {b.description && <span className="ml-2" style={{ color: 'var(--text-low)' }}>— {b.description}</span>}
                </p>
              </div>
              <button onClick={() => { setEditing(b); setCreating(false) }}
                className="btn-ghost text-xs" style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
                Изменить
              </button>
              <button onClick={() => remove(b)}
                className="btn-ghost text-xs" style={{ color: '#EF4444', border: '1px solid rgba(239,68,68,0.25)' }}>
                Удалить
              </button>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}

function BadgeForm({ initial, isEdit, onCancel, onSaved, onError }: {
  initial: { slug: string; label: string; color: string; icon: string; description: string | null }
  isEdit: boolean
  onCancel: () => void
  onSaved: () => void
  onError: (e: unknown) => void
}) {
  const [form, setForm] = useState({
    slug: initial.slug,
    label: initial.label,
    color: initial.color,
    icon: initial.icon,
    description: initial.description ?? '',
  })
  const [saving, setSaving] = useState(false)

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm(prev => ({ ...prev, [k]: v }))
  }

  async function save() {
    setSaving(true)
    try {
      if (isEdit) {
        // slug менять нельзя — он опущен.
        await adminApi.updateBadge((initial as AdminBadge).id, {
          label: form.label, color: form.color, icon: form.icon,
          description: form.description.trim() || null,
        })
      } else {
        await adminApi.createBadge({
          slug: form.slug, label: form.label, color: form.color, icon: form.icon,
          description: form.description.trim() || null,
        })
      }
      onSaved()
    } catch (e) { onError(e); setSaving(false) }
  }

  const valid = form.label.trim() && form.icon.trim() && /^\d{1,3},\d{1,3},\d{1,3}$/.test(form.color)
    && (isEdit || /^[a-z0-9_-]{2,40}$/.test(form.slug))

  return (
    <div className="glass rounded-2xl p-5 mb-4 space-y-4">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full"
          style={{ background: `rgba(${form.color},0.16)`, color: `rgb(${form.color})` }}>
          <span aria-hidden>{form.icon || '⭐'}</span>{form.label || 'Превью'}
        </span>
        <span className="text-xs" style={{ color: 'var(--text-low)' }}>предпросмотр</span>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {!isEdit && (
          <div>
            <label className="label">Slug</label>
            <input className="input" value={form.slug}
              onChange={e => set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
              placeholder="verified" minLength={2} maxLength={40} />
            <p className="text-xs mt-1" style={{ color: 'var(--text-low)' }}>a-z, 0-9, _ или - (не меняется потом)</p>
          </div>
        )}
        <div>
          <label className="label">Название</label>
          <input className="input" value={form.label} onChange={e => set('label', e.target.value)}
            placeholder="Verified" maxLength={40} />
        </div>
        <div>
          <label className="label">Иконка (emoji)</label>
          <input className="input" value={form.icon} onChange={e => set('icon', e.target.value)}
            placeholder="✓" maxLength={8} />
        </div>
      </div>

      <div>
        <label className="label">Цвет</label>
        <div className="flex flex-wrap gap-2 mb-2">
          {COLOR_PRESETS.map(c => (
            <button key={c.rgb} type="button" onClick={() => set('color', c.rgb)}
              className="w-7 h-7 rounded-full transition-transform hover:scale-110"
              style={{
                background: `rgb(${c.rgb})`,
                outline: form.color === c.rgb ? '2px solid #fff' : 'none',
                outlineOffset: '2px',
              }}
              title={c.name} />
          ))}
        </div>
        <input className="input font-mono text-sm" value={form.color}
          onChange={e => set('color', e.target.value)} placeholder="168,85,247" />
        <p className="text-xs mt-1" style={{ color: 'var(--text-low)' }}>RGB-триплет «R,G,B»</p>
      </div>

      <div>
        <label className="label">Описание <span className="font-normal" style={{ color: 'var(--text-low)' }}>(необязательно)</span></label>
        <input className="input" value={form.description} onChange={e => set('description', e.target.value)}
          maxLength={200} placeholder="Подтверждённый аккаунт" />
      </div>

      <div className="flex gap-3 pt-1">
        <button onClick={onCancel} disabled={saving}
          className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors"
          style={{ color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.1)' }}>
          Отмена
        </button>
        <button onClick={save} disabled={!valid || saving} className="btn-primary flex-1 py-2.5 disabled:opacity-50">
          {saving ? <Spinner size={18} /> : isEdit ? 'Сохранить' : 'Создать'}
        </button>
      </div>
    </div>
  )
}
