import { useState } from 'react'
import {
  calendarApi,
  type CalendarEvent,
  type CategoryPreset,
  type CustomCategory,
  type ReminderTarget,
  type EventInput,
} from '@/api/calendar'
import { CategoryIcon } from './categoryIcons'
import { Spinner } from '@/components/ui/Spinner'

interface Props {
  chatId: string
  partnerNickname: string
  presets: CategoryPreset[]
  customCategories: CustomCategory[]
  initialDate?: Date            // предзаполненная дата (клик по дню сетки)
  event?: CalendarEvent | null  // редактирование
  onSaved: (event: CalendarEvent) => void
  onDeleted?: (id: string) => void
  onClose: () => void
}

// Пресеты смещений напоминания.
const OFFSET_OPTIONS: { label: string; value: number }[] = [
  { label: 'В момент события', value: 0 },
  { label: 'За 10 минут',      value: 10 },
  { label: 'За 30 минут',      value: 30 },
  { label: 'За 1 час',         value: 60 },
  { label: 'За 1 день',        value: 60 * 24 },
  { label: 'За 1 неделю',      value: 60 * 24 * 7 },
]

const TARGET_LABELS: Record<ReminderTarget, string> = {
  SELF: 'Только мне',
  PARTNER: 'Только партнёру',
  BOTH: 'Обоим',
}

interface DraftReminder {
  offsetMin: number
  target: ReminderTarget
  notify: boolean
}

function toLocalInputValue(d: Date): string {
  // datetime-local требует YYYY-MM-DDTHH:mm в локальном времени
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function EventModal({
  chatId, partnerNickname, presets, customCategories,
  initialDate, event, onSaved, onDeleted, onClose,
}: Props) {
  const editing = !!event

  const [title, setTitle] = useState(event?.title ?? '')
  const [notes, setNotes] = useState(event?.notes ?? '')
  const [allDay, setAllDay] = useState(event?.allDay ?? false)
  const [dateValue, setDateValue] = useState(() => {
    const base = event ? new Date(event.eventAt) : (initialDate ?? defaultStart())
    return toLocalInputValue(base)
  })

  // Выбранная категория: 'preset:<key>' | 'custom:<id>' | ''
  const [categorySel, setCategorySel] = useState<string>(() => {
    if (event?.categoryId) return `custom:${event.categoryId}`
    if (event?.presetKey) return `preset:${event.presetKey}`
    return `preset:${presets[0]?.key ?? ''}`
  })

  const [reminders, setReminders] = useState<DraftReminder[]>(
    event?.reminders.map(r => ({ offsetMin: r.offsetMin, target: r.target, notify: r.notify }))
      ?? [{ offsetMin: 30, target: 'BOTH', notify: true }],
  )

  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function addReminder() {
    if (reminders.length >= 5) return
    setReminders(rs => [...rs, { offsetMin: 60, target: 'BOTH', notify: true }])
  }
  function updateReminder(i: number, patch: Partial<DraftReminder>) {
    setReminders(rs => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }
  function removeReminder(i: number) {
    setReminders(rs => rs.filter((_, idx) => idx !== i))
  }

  async function save() {
    if (!title.trim()) { setError('Введите название'); return }
    setSaving(true)
    setError(null)

    const localDate = new Date(dateValue)
    if (Number.isNaN(localDate.getTime())) { setError('Некорректная дата'); setSaving(false); return }

    const input: EventInput = {
      title: title.trim(),
      notes: notes.trim() || null,
      eventAt: localDate.toISOString(),
      allDay,
      presetKey: categorySel.startsWith('preset:') ? categorySel.slice(7) : null,
      categoryId: categorySel.startsWith('custom:') ? categorySel.slice(7) : null,
      reminders: reminders.map(r => ({ offsetMin: r.offsetMin, target: r.target, notify: r.notify })),
    }

    try {
      const r = editing
        ? await calendarApi.updateEvent(event!.id, input)
        : await calendarApi.createEvent(chatId, input)
      onSaved(r.data.data)
      onClose()
    } catch {
      setError('Не удалось сохранить событие')
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!event) return
    if (!confirm('Удалить событие?')) return
    setDeleting(true)
    try {
      await calendarApi.deleteEvent(event.id)
      onDeleted?.(event.id)
      onClose()
    } catch {
      setError('Не удалось удалить')
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end md:items-center justify-center"
      onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative w-full md:w-[440px] max-h-[90vh] overflow-y-auto rounded-t-3xl md:rounded-3xl shadow-2xl modal-up"
        style={{
          background: 'rgba(13,17,35,0.92)',
          backdropFilter: 'blur(40px) saturate(150%)',
          WebkitBackdropFilter: 'blur(40px) saturate(150%)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center gap-2 px-4 py-3"
          style={{ background: 'rgba(13,17,35,0.92)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <span className="text-[15px] font-semibold text-white flex-1">
            {editing ? 'Событие' : 'Новое событие'}
          </span>
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/8 transition-colors"
            style={{ color: 'rgba(255,255,255,0.5)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="px-4 py-4 space-y-4">
          {/* Title */}
          <div>
            <input
              autoFocus
              value={title}
              onChange={e => setTitle(e.target.value)}
              maxLength={120}
              placeholder="Название события"
              className="w-full rounded-xl px-3.5 py-2.5 text-sm text-white outline-none placeholder-white/30"
              style={{ background: 'var(--glass-2)', caretColor: '#A855F7' }}
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-low)' }}>Категория</label>
            <div className="flex flex-wrap gap-2">
              {presets.map(p => {
                const sel = categorySel === `preset:${p.key}`
                return (
                  <button key={p.key} onClick={() => setCategorySel(`preset:${p.key}`)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                    style={{
                      background: sel ? p.color : 'rgba(255,255,255,0.06)',
                      color: sel ? '#fff' : 'var(--text-mid)',
                    }}>
                    <CategoryIcon icon={p.icon} size={13} color={sel ? '#fff' : p.color} />
                    {p.name}
                  </button>
                )
              })}
              {customCategories.map(c => {
                const sel = categorySel === `custom:${c.id}`
                return (
                  <button key={c.id} onClick={() => setCategorySel(`custom:${c.id}`)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                    style={{
                      background: sel ? c.color : 'rgba(255,255,255,0.06)',
                      color: sel ? '#fff' : 'var(--text-mid)',
                    }}>
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: sel ? '#fff' : c.color }} />
                    {c.name}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Date + all-day */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium" style={{ color: 'var(--text-low)' }}>Дата и время</label>
              <button onClick={() => setAllDay(v => !v)}
                className="flex items-center gap-1.5 text-xs"
                style={{ color: allDay ? '#A855F7' : 'var(--text-low)' }}>
                <span className="w-8 h-4 rounded-full relative transition-colors"
                  style={{ background: allDay ? '#A855F7' : 'rgba(255,255,255,0.15)' }}>
                  <span className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all"
                    style={{ left: allDay ? '18px' : '2px' }} />
                </span>
                Весь день
              </button>
            </div>
            <input
              type={allDay ? 'date' : 'datetime-local'}
              value={allDay ? dateValue.slice(0, 10) : dateValue}
              onChange={e => {
                const v = e.target.value
                setDateValue(allDay ? `${v}T00:00` : v)
              }}
              className="w-full rounded-xl px-3.5 py-2.5 text-sm text-white outline-none"
              style={{ background: 'var(--glass-2)', caretColor: '#A855F7', colorScheme: 'dark' }}
            />
          </div>

          {/* Notes */}
          <div>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              maxLength={1000}
              rows={2}
              placeholder="Заметка (необязательно)"
              className="w-full resize-none rounded-xl px-3.5 py-2.5 text-sm text-white outline-none placeholder-white/30"
              style={{ background: 'var(--glass-2)', caretColor: '#A855F7' }}
            />
          </div>

          {/* Reminders */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium" style={{ color: 'var(--text-low)' }}>Напоминания</label>
              {reminders.length < 5 && (
                <button onClick={addReminder} className="text-xs" style={{ color: '#A855F7' }}>
                  + Добавить
                </button>
              )}
            </div>
            <div className="space-y-2">
              {reminders.length === 0 && (
                <p className="text-xs" style={{ color: 'var(--text-low)' }}>Без напоминаний</p>
              )}
              {reminders.map((r, i) => (
                <div key={i} className="rounded-xl p-2.5 space-y-2"
                  style={{ background: 'rgba(255,255,255,0.04)' }}>
                  <div className="flex items-center gap-2">
                    <select
                      value={r.offsetMin}
                      onChange={e => updateReminder(i, { offsetMin: Number(e.target.value) })}
                      className="flex-1 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none"
                      style={{ background: 'var(--glass-2)', colorScheme: 'dark' }}>
                      {OFFSET_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    <button onClick={() => removeReminder(i)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/8 shrink-0"
                      style={{ color: 'rgba(255,255,255,0.4)' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={r.target}
                      onChange={e => updateReminder(i, { target: e.target.value as ReminderTarget })}
                      className="flex-1 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none"
                      style={{ background: 'var(--glass-2)', colorScheme: 'dark' }}>
                      {(['SELF', 'PARTNER', 'BOTH'] as ReminderTarget[]).map(t => (
                        <option key={t} value={t}>
                          {t === 'PARTNER' ? partnerNickname : TARGET_LABELS[t]}
                        </option>
                      ))}
                    </select>
                    {/* Кнопка уведомления — включается на выбор пользователя */}
                    <button
                      onClick={() => updateReminder(i, { notify: !r.notify })}
                      title={r.notify ? 'Уведомление включено' : 'Уведомление выключено'}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors shrink-0"
                      style={{
                        background: r.notify ? 'rgba(168,85,247,0.18)' : 'rgba(255,255,255,0.05)',
                        color: r.notify ? '#A855F7' : 'var(--text-low)',
                      }}>
                      {r.notify ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                          <path d="M13.73 21a2 2 0 01-3.46 0"/>
                        </svg>
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M13.73 21a2 2 0 01-3.46 0"/>
                          <path d="M18.63 13A17.89 17.89 0 0118 8"/>
                          <path d="M6.26 6.26A5.86 5.86 0 006 8c0 7-3 9-3 9h14"/>
                          <line x1="1" y1="1" x2="23" y2="23"/>
                        </svg>
                      )}
                      Push
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            {editing && (
              <button onClick={remove} disabled={deleting}
                className="px-4 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
                style={{ background: 'rgba(239,68,68,0.12)', color: '#EF4444' }}>
                {deleting ? <Spinner size={13} /> : 'Удалить'}
              </button>
            )}
            <button onClick={save} disabled={saving}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center"
              style={{ background: 'var(--grad-own)', boxShadow: 'var(--glow-primary)' }}>
              {saving ? <Spinner size={14} /> : editing ? 'Сохранить' : 'Создать'}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes modalUp { from { transform: translateY(30px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
        .modal-up { animation: modalUp 0.22s ease-out both; }
      `}</style>
    </div>
  )
}

function defaultStart(): Date {
  const d = new Date()
  d.setHours(d.getHours() + 1, 0, 0, 0)   // следующий круглый час
  return d
}
