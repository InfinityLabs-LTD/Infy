import { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { reportsApi, type ReportCategory } from '@/api/reports'
import { mediaApi } from '@/api/media'
import { Avatar } from '@/components/ui/Avatar'
import { Spinner } from '@/components/ui/Spinner'

interface Props {
  target: { id: string; nickname: string; username: string; avatarUrl: string | null }
  chatId?: string
  messageId?: string
  onClose: () => void
  onSent: () => void
}

const CATEGORIES: { value: ReportCategory; label: string; hint: string }[] = [
  { value: 'SPAM',       label: 'Спам',          hint: 'Реклама, рассылки' },
  { value: 'HARASSMENT', label: 'Оскорбления',   hint: 'Травля, унижения' },
  { value: 'HATE',       label: 'Ненависть',     hint: 'Разжигание вражды' },
  { value: 'VIOLENCE',   label: 'Угрозы',        hint: 'Насилие, угрозы' },
  { value: 'SEXUAL',     label: '18+',           hint: 'Сексуальный контент' },
  { value: 'SCAM',       label: 'Мошенничество', hint: 'Обман, фишинг' },
  { value: 'ILLEGAL',    label: 'Запрещённое',   hint: 'Незаконный контент' },
  { value: 'OTHER',      label: 'Другое',        hint: 'Иная причина' },
]

const MAX_EVIDENCE = 5
const ALLOWED = 'image/jpeg,image/png,image/gif,image/webp'

interface Evidence {
  key: string
  previewUrl: string
}

export function ReportModal({ target, chatId, messageId, onClose, onSent }: Props) {
  const [category, setCategory] = useState<ReportCategory | null>(null)
  const [description, setDescription] = useState('')
  const [evidence, setEvidence] = useState<Evidence[]>([])
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length === 0) return
    const room = MAX_EVIDENCE - evidence.length
    if (room <= 0) return
    setUploading(true); setError(null)
    try {
      for (const file of files.slice(0, room)) {
        const r = await mediaApi.upload(file)
        setEvidence(prev => [...prev, {
          key: r.data.data.storageKey,
          previewUrl: URL.createObjectURL(file),
        }])
      }
    } catch {
      setError('Не удалось загрузить скриншот')
    } finally {
      setUploading(false)
    }
  }

  function removeEvidence(i: number) {
    setEvidence(prev => prev.filter((_, idx) => idx !== i))
  }

  async function submit() {
    if (!category || !description.trim()) {
      setError('Выберите категорию и опишите проблему')
      return
    }
    setSaving(true); setError(null)
    try {
      await reportsApi.create({
        targetId: target.id,
        category,
        description: description.trim(),
        chatId,
        messageId,
        evidenceKeys: evidence.map(e => e.key),
      })
      setDone(true)
      setTimeout(() => onSent(), 1400)
    } catch (e) {
      const err = e as { response?: { data?: { error?: { message?: string } } } }
      setError(err.response?.data?.error?.message ?? 'Не удалось отправить жалобу')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end md:items-center justify-center" onClick={onClose}>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0" style={{ background: 'rgba(8,11,22,0.6)', backdropFilter: 'blur(4px)' }} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: 'spring', stiffness: 360, damping: 30 }}
        className="glass-pop relative w-full md:w-[460px] max-h-[90vh] overflow-y-auto rounded-t-3xl md:rounded-3xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Шапка */}
        <div className="flex items-center gap-2 px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(239,68,68,0.15)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" />
            </svg>
          </div>
          <h2 className="font-display text-base font-bold text-white flex-1">Пожаловаться</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
            style={{ color: 'rgba(255,255,255,0.5)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {done ? (
          <div className="px-5 py-12 flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-full flex items-center justify-center mb-3"
              style={{ background: 'rgba(34,197,94,0.14)' }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <p className="text-white font-semibold">Жалоба отправлена</p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-low)' }}>
              Модераторы рассмотрят её в ближайшее время
            </p>
          </div>
        ) : (
          <div className="px-5 py-4 space-y-4">
            {/* На кого */}
            <div className="flex items-center gap-2.5 glass rounded-xl px-3 py-2.5">
              <Avatar url={target.avatarUrl} nickname={target.nickname} size={32} />
              <div className="flex-1 min-w-0">
                <p className="text-xs" style={{ color: 'var(--text-low)' }}>Жалоба на</p>
                <p className="text-sm font-semibold text-white truncate">{target.nickname} · @{target.username}</p>
              </div>
            </div>

            {/* Категория */}
            <div>
              <label className="label">Категория</label>
              <div className="grid grid-cols-2 gap-2">
                {CATEGORIES.map(c => {
                  const sel = category === c.value
                  return (
                    <button key={c.value} onClick={() => setCategory(c.value)}
                      className="text-left px-3 py-2 rounded-xl transition-all"
                      style={{
                        background: sel ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.04)',
                        border: sel ? '1px solid rgba(239,68,68,0.5)' : '1px solid transparent',
                      }}>
                      <p className="text-sm font-medium" style={{ color: sel ? '#fca5a5' : '#fff' }}>{c.label}</p>
                      <p className="text-[11px]" style={{ color: 'var(--text-low)' }}>{c.hint}</p>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Описание */}
            <div>
              <label className="label">Что случилось</label>
              <textarea className="input resize-none" rows={3} maxLength={1000}
                placeholder="Кратко опишите нарушение…"
                value={description} onChange={e => setDescription(e.target.value)} />
              <p className="text-[11px] mt-1 text-right" style={{ color: 'var(--text-low)' }}>
                {description.length}/1000
              </p>
            </div>

            {/* Доказательства */}
            <div>
              <label className="label">Доказательства <span style={{ color: 'var(--text-low)' }}>(до {MAX_EVIDENCE} скриншотов)</span></label>
              <div className="flex flex-wrap gap-2">
                {evidence.map((ev, i) => (
                  <div key={i} className="relative w-16 h-16 rounded-xl overflow-hidden">
                    <img src={ev.previewUrl} alt="" className="w-full h-full object-cover" />
                    <button onClick={() => removeEvidence(i)}
                      className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full flex items-center justify-center"
                      style={{ background: 'rgba(0,0,0,0.6)' }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                ))}
                {evidence.length < MAX_EVIDENCE && (
                  <button onClick={() => fileRef.current?.click()} disabled={uploading}
                    className="w-16 h-16 rounded-xl flex items-center justify-center transition-colors disabled:opacity-40"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px dashed rgba(255,255,255,0.15)' }}>
                    {uploading ? <Spinner size={16} /> : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2">
                        <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                    )}
                  </button>
                )}
              </div>
              <input ref={fileRef} type="file" accept={ALLOWED} multiple className="hidden" onChange={onPickFiles} />
            </div>

            {error && <p className="text-xs" style={{ color: '#EF4444' }}>{error}</p>}

            <button onClick={submit} disabled={saving || !category || !description.trim()}
              className="btn-primary w-full disabled:opacity-50"
              style={{ background: '#dc2626' }}>
              {saving ? <Spinner size={16} /> : 'Отправить жалобу'}
            </button>
          </div>
        )}
      </motion.div>
    </div>
  )
}
