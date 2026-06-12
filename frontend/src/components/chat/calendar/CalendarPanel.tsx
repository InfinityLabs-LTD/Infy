import { useEffect, useMemo, useState } from 'react'
import {
  calendarApi,
  type CalendarEvent,
  type CategoryPreset,
  type CustomCategory,
} from '@/api/calendar'
import { getActiveSocket } from '@/lib/socket'
import { CategoryIcon } from './categoryIcons'
import { EventModal } from './EventModal'
import { Spinner } from '@/components/ui/Spinner'

interface Props {
  chatId: string
  partnerNickname: string
  onClose: () => void
}

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

// Цвет события: своя категория > пресет > дефолт.
function eventColor(e: CalendarEvent, presets: CategoryPreset[]): string {
  if (e.category) return e.category.color
  if (e.presetKey) return presets.find(p => p.key === e.presetKey)?.color ?? '#2aabee'
  return '#2aabee'
}

function eventCategoryLabel(e: CalendarEvent, presets: CategoryPreset[]): string {
  if (e.category) return e.category.name
  if (e.presetKey) return presets.find(p => p.key === e.presetKey)?.name ?? ''
  return ''
}

export function CalendarPanel({ chatId, partnerNickname, onClose }: Props) {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [presets, setPresets] = useState<CategoryPreset[]>([])
  const [customCategories, setCustomCategories] = useState<CustomCategory[]>([])
  const [remindersEnabled, setRemindersEnabled] = useState(true)
  const [loading, setLoading] = useState(true)

  const [viewMonth, setViewMonth] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d })
  const [selectedDay, setSelectedDay] = useState<Date>(() => new Date())

  const [modalOpen, setModalOpen] = useState(false)
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null)
  const [showCategoryMgr, setShowCategoryMgr] = useState(false)

  // ── Загрузка ────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      calendarApi.listEvents(chatId),
      calendarApi.listCategories(chatId),
      calendarApi.getSettings(chatId),
    ]).then(([ev, cat, set]) => {
      if (cancelled) return
      setEvents(ev.data.data)
      setPresets(cat.data.data.presets)
      setCustomCategories(cat.data.data.custom)
      setRemindersEnabled(set.data.data.remindersEnabled)
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [chatId])

  // ── Realtime-синхронизация ──────────────────────────────────
  useEffect(() => {
    const socket = getActiveSocket()
    if (!socket) return

    const onCreated = (e: CalendarEvent) => { if (e.chatId === chatId) upsertEvent(e) }
    const onUpdated = (e: CalendarEvent) => { if (e.chatId === chatId) upsertEvent(e) }
    const onDeleted = ({ id, chatId: cid }: { id: string; chatId: string }) => {
      if (cid === chatId) setEvents(prev => prev.filter(x => x.id !== id))
    }
    const onCatCreated = ({ chatId: cid, category }: { chatId: string; category: CustomCategory }) => {
      if (cid === chatId) setCustomCategories(prev => prev.some(c => c.id === category.id) ? prev : [...prev, category])
    }
    const onCatDeleted = ({ id, chatId: cid }: { id: string; chatId: string }) => {
      if (cid === chatId) setCustomCategories(prev => prev.filter(c => c.id !== id))
    }

    socket.on('event_created', onCreated)
    socket.on('event_updated', onUpdated)
    socket.on('event_deleted', onDeleted)
    socket.on('category_created', onCatCreated)
    socket.on('category_deleted', onCatDeleted)
    return () => {
      socket.off('event_created', onCreated)
      socket.off('event_updated', onUpdated)
      socket.off('event_deleted', onDeleted)
      socket.off('category_created', onCatCreated)
      socket.off('category_deleted', onCatDeleted)
    }
  }, [chatId])

  function upsertEvent(e: CalendarEvent) {
    setEvents(prev => {
      const idx = prev.findIndex(x => x.id === e.id)
      if (idx >= 0) { const next = [...prev]; next[idx] = e; return next }
      return [...prev, e]
    })
  }

  // ── Группировка событий по дню ──────────────────────────────
  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const e of events) {
      const k = dayKey(new Date(e.eventAt))
      const arr = map.get(k) ?? []
      arr.push(e)
      map.set(k, arr)
    }
    return map
  }, [events])

  const selectedDayEvents = useMemo(() => {
    return (eventsByDay.get(dayKey(selectedDay)) ?? [])
      .slice()
      .sort((a, b) => new Date(a.eventAt).getTime() - new Date(b.eventAt).getTime())
  }, [eventsByDay, selectedDay])

  // ── Сетка месяца ────────────────────────────────────────────
  const grid = useMemo(() => {
    const year = viewMonth.getFullYear()
    const month = viewMonth.getMonth()
    const first = new Date(year, month, 1)
    // Пн = 0 … Вс = 6
    const startOffset = (first.getDay() + 6) % 7
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const cells: (Date | null)[] = []
    for (let i = 0; i < startOffset; i++) cells.push(null)
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d))
    while (cells.length % 7 !== 0) cells.push(null)
    return cells
  }, [viewMonth])

  function changeMonth(delta: number) {
    setViewMonth(m => new Date(m.getFullYear(), m.getMonth() + delta, 1))
  }

  async function toggleReminders() {
    const next = !remindersEnabled
    setRemindersEnabled(next)
    try { await calendarApi.updateSettings(chatId, next) }
    catch { setRemindersEnabled(!next) }
  }

  function openCreate() {
    setEditingEvent(null)
    setModalOpen(true)
  }
  function openEdit(e: CalendarEvent) {
    setEditingEvent(e)
    setModalOpen(true)
  }

  const today = new Date()

  return (
    <>
      <div className="fixed inset-0 z-20 bg-black/50" onClick={onClose} />
      <div
        className="fixed right-0 top-0 bottom-0 z-30 flex flex-col w-96 max-w-full overflow-hidden panel-slide-in"
        style={{ background: '#17212b', borderLeft: '1px solid rgba(255,255,255,0.07)' }}
      >
        {/* Header */}
        <div className="shrink-0 flex items-center gap-2 px-3 py-3"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/8 transition-colors shrink-0"
            style={{ color: 'rgba(255,255,255,0.5)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
          <span className="text-sm font-semibold text-white flex-1">Календарь</span>
          <button onClick={openCreate}
            className="w-8 h-8 flex items-center justify-center rounded-full transition-colors shrink-0"
            style={{ background: 'rgba(42,171,238,0.15)', color: '#2aabee' }}
            title="Новое событие">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Spinner size={24} /></div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto">
            {/* Общий тумблер напоминаний */}
            <button onClick={toggleReminders}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                style={{ background: 'rgba(42,171,238,0.12)' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2aabee" strokeWidth="2">
                  <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                  <path d="M13.73 21a2 2 0 01-3.46 0"/>
                </svg>
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm text-white">Напоминания из этого чата</p>
                <p className="text-xs" style={{ color: '#6c8998' }}>
                  {remindersEnabled ? 'Включены' : 'Выключены'}
                </p>
              </div>
              <span className="w-10 h-5 rounded-full relative transition-colors shrink-0"
                style={{ background: remindersEnabled ? '#2aabee' : 'rgba(255,255,255,0.15)' }}>
                <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all"
                  style={{ left: remindersEnabled ? '22px' : '2px' }} />
              </span>
            </button>

            {/* Месячная навигация */}
            <div className="px-4 pt-3">
              <div className="flex items-center justify-between mb-3">
                <button onClick={() => changeMonth(-1)}
                  className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/8"
                  style={{ color: 'rgba(255,255,255,0.6)' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
                <span className="text-sm font-semibold text-white">
                  {MONTHS[viewMonth.getMonth()]} {viewMonth.getFullYear()}
                </span>
                <button onClick={() => changeMonth(1)}
                  className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/8"
                  style={{ color: 'rgba(255,255,255,0.6)' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
              </div>

              {/* Weekday header */}
              <div className="grid grid-cols-7 mb-1">
                {WEEKDAYS.map(w => (
                  <div key={w} className="text-center text-[11px] font-medium py-1" style={{ color: '#6c8998' }}>{w}</div>
                ))}
              </div>

              {/* Day cells */}
              <div className="grid grid-cols-7 gap-0.5">
                {grid.map((d, i) => {
                  if (!d) return <div key={i} />
                  const dayEvents = eventsByDay.get(dayKey(d)) ?? []
                  const isToday = sameDay(d, today)
                  const isSelected = sameDay(d, selectedDay)
                  // до 3 цветных точек
                  const dots = dayEvents.slice(0, 3).map(e => eventColor(e, presets))
                  return (
                    <button key={i} onClick={() => setSelectedDay(d)}
                      className="aspect-square flex flex-col items-center justify-center rounded-lg relative transition-colors"
                      style={{
                        background: isSelected ? '#2b5278' : 'transparent',
                      }}>
                      <span className="text-[13px]"
                        style={{
                          color: isSelected ? '#fff' : isToday ? '#2aabee' : 'rgba(255,255,255,0.8)',
                          fontWeight: isToday || isSelected ? 600 : 400,
                        }}>
                        {d.getDate()}
                      </span>
                      {dots.length > 0 && (
                        <span className="flex gap-0.5 mt-0.5 absolute bottom-1">
                          {dots.map((c, di) => (
                            <span key={di} className="w-1 h-1 rounded-full" style={{ background: c }} />
                          ))}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* События выбранного дня */}
            <div className="px-4 pt-4 pb-2">
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#6c8998' }}>
                {selectedDay.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
              {selectedDayEvents.length === 0 ? (
                <p className="text-sm py-3 text-center" style={{ color: '#6c8998' }}>Нет событий</p>
              ) : (
                <div className="space-y-1.5">
                  {selectedDayEvents.map(e => {
                    const color = eventColor(e, presets)
                    const catLabel = eventCategoryLabel(e, presets)
                    const time = e.allDay
                      ? 'Весь день'
                      : new Date(e.eventAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
                    return (
                      <button key={e.id} onClick={() => openEdit(e)}
                        className="w-full text-left flex items-stretch gap-2.5 rounded-xl p-2.5 hover:bg-white/[0.04] transition-colors"
                        style={{ background: 'rgba(255,255,255,0.02)' }}>
                        <span className="w-1 rounded-full shrink-0" style={{ background: color }} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-white truncate">{e.title}</p>
                          <p className="text-xs mt-0.5" style={{ color: '#9bb0bf' }}>
                            {time}{catLabel && ` · ${catLabel}`}
                          </p>
                          {e.notes && (
                            <p className="text-xs mt-0.5 truncate" style={{ color: '#6c8998' }}>{e.notes}</p>
                          )}
                          {e.reminders.length > 0 && (
                            <span className="inline-flex items-center gap-1 mt-1 text-[11px]" style={{ color: '#6c8998' }}>
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>
                              </svg>
                              {e.reminders.length}
                            </span>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Управление категориями */}
            <div className="px-4 pb-6 pt-2">
              <button onClick={() => setShowCategoryMgr(v => !v)}
                className="flex items-center gap-1.5 text-xs" style={{ color: '#6c8998' }}>
                <CategoryIcon icon="bookmark" size={13} color="#6c8998" />
                Свои категории {showCategoryMgr ? '▴' : '▾'}
              </button>
              {showCategoryMgr && (
                <CategoryManager
                  chatId={chatId}
                  categories={customCategories}
                  onCreated={c => setCustomCategories(prev => [...prev, c])}
                  onDeleted={id => setCustomCategories(prev => prev.filter(c => c.id !== id))}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {modalOpen && (
        <EventModal
          chatId={chatId}
          partnerNickname={partnerNickname}
          presets={presets}
          customCategories={customCategories}
          initialDate={editingEvent ? undefined : startOfSelected(selectedDay)}
          event={editingEvent}
          onSaved={upsertEvent}
          onDeleted={id => setEvents(prev => prev.filter(x => x.id !== id))}
          onClose={() => setModalOpen(false)}
        />
      )}

      <style>{`
        @keyframes slideInRight { from { transform: translateX(100%) } to { transform: translateX(0) } }
        .panel-slide-in { animation: slideInRight 0.22s ease-out both; }
      `}</style>
    </>
  )
}

// Предзаполнить дату выбранного дня (с текущим часом + 1).
function startOfSelected(day: Date): Date {
  const now = new Date()
  const d = new Date(day)
  d.setHours(now.getHours() + 1, 0, 0, 0)
  return d
}

const SWATCHES = ['#2aabee', '#f59e0b', '#ec4899', '#34d399', '#a78bfa', '#ef4444', '#06b6d4', '#eab308']

function CategoryManager({
  chatId, categories, onCreated, onDeleted,
}: {
  chatId: string
  categories: CustomCategory[]
  onCreated: (c: CustomCategory) => void
  onDeleted: (id: string) => void
}) {
  const [name, setName] = useState('')
  const [color, setColor] = useState(SWATCHES[0])
  const [busy, setBusy] = useState(false)

  async function create() {
    if (!name.trim() || busy) return
    setBusy(true)
    try {
      const r = await calendarApi.createCategory(chatId, name.trim(), color)
      onCreated(r.data.data)
      setName('')
    } catch { /* ignore */ }
    finally { setBusy(false) }
  }

  async function remove(id: string) {
    try { await calendarApi.deleteCategory(id); onDeleted(id) }
    catch { /* ignore */ }
  }

  return (
    <div className="mt-3 space-y-2">
      {categories.map(c => (
        <div key={c.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg"
          style={{ background: 'rgba(255,255,255,0.03)' }}>
          <span className="w-3 h-3 rounded-full shrink-0" style={{ background: c.color }} />
          <span className="text-sm text-white flex-1 truncate">{c.name}</span>
          <button onClick={() => remove(c.id)}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/8 shrink-0"
            style={{ color: 'rgba(255,255,255,0.4)' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      ))}

      <div className="rounded-xl p-2.5 space-y-2" style={{ background: 'rgba(255,255,255,0.03)' }}>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          maxLength={40}
          placeholder="Название категории"
          className="w-full rounded-lg px-2.5 py-1.5 text-sm text-white outline-none placeholder-white/30"
          style={{ background: '#242f3d', caretColor: '#2aabee' }}
          onKeyDown={e => { if (e.key === 'Enter') create() }}
        />
        <div className="flex items-center gap-1.5 flex-wrap">
          {SWATCHES.map(s => (
            <button key={s} onClick={() => setColor(s)}
              className="w-6 h-6 rounded-full transition-transform"
              style={{ background: s, outline: color === s ? '2px solid #fff' : 'none', outlineOffset: 1 }} />
          ))}
          <button onClick={create} disabled={busy || !name.trim()}
            className="ml-auto px-3 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-40"
            style={{ background: '#2aabee' }}>
            {busy ? <Spinner size={11} /> : 'Добавить'}
          </button>
        </div>
      </div>
    </div>
  )
}
