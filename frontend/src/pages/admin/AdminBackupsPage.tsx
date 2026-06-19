import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  adminApi, BackupInfo, BackupSchedule, BackupScheduleUpdate, BackupFrequency,
} from '@/api/admin'
import { Spinner } from '@/components/ui/Spinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { translateError } from '@/lib/errorMessages'

const WEEKDAYS = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота']

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} ГБ`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })
}

const TRIGGER_LABEL: Record<BackupInfo['trigger'], { text: string; color: string; bg: string }> = {
  manual:    { text: 'Вручную',     color: '#C084FC', bg: 'rgba(168,85,247,0.18)' },
  scheduled: { text: 'По расписанию', color: '#60A5FA', bg: 'rgba(59,130,246,0.18)' },
  upload:    { text: 'Загружен',     color: '#34D399', bg: 'rgba(52,211,153,0.15)' },
}

export function AdminBackupsPage() {
  const [backups, setBackups] = useState<BackupInfo[]>([])
  const [schedule, setSchedule] = useState<BackupSchedule | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [creating, setCreating] = useState(false)
  const [busyName, setBusyName] = useState<string | null>(null)   // удаление/восстановление конкретной копии
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null)

  // Расписание (локальный draft).
  const [savingSchedule, setSavingSchedule] = useState(false)

  // Загрузка файла.
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploadPct, setUploadPct] = useState<number | null>(null)

  function flash(ok: boolean, text: string) {
    setToast({ ok, text })
    setTimeout(() => setToast(null), 3500)
  }

  async function load() {
    setError(null)
    try {
      const r = await adminApi.getBackups()
      setBackups(r.data.data.backups)
      setSchedule(r.data.data.schedule)
    } catch (err) {
      // Показываем реальную причину с сервера, а не общую заглушку —
      // иначе по «Что-то пошло не так» невозможно понять, что чинить.
      setError(translateError(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function create() {
    setCreating(true)
    try {
      await adminApi.createBackup()
      flash(true, 'Резервная копия создана')
      await load()
    } catch (err) {
      flash(false, translateError(err))
    } finally {
      setCreating(false)
    }
  }

  async function download(name: string) {
    try {
      const r = await adminApi.getBackupLink(name)
      // Presigned-ссылка MinIO работает без авторизации — открываем напрямую.
      window.open(r.data.data.url, '_blank')
    } catch (err) {
      flash(false, translateError(err))
    }
  }

  async function remove(name: string) {
    if (!confirm(`Удалить резервную копию «${name}»? Действие необратимо.`)) return
    setBusyName(name)
    try {
      await adminApi.deleteBackup(name)
      setBackups(bs => bs.filter(b => b.name !== name))
      flash(true, 'Копия удалена')
    } catch (err) {
      flash(false, translateError(err))
    } finally {
      setBusyName(null)
    }
  }

  async function restore(name: string) {
    if (!confirm(
      `ВНИМАНИЕ! Восстановление перезапишет ВСЮ текущую базу данных содержимым копии «${name}».\n\n` +
      `Текущие данные будут потеряны. Продолжить?`,
    )) return
    setBusyName(name)
    try {
      await adminApi.restoreBackup(name)
      flash(true, 'База данных восстановлена из копии')
    } catch (err) {
      flash(false, translateError(err))
    } finally {
      setBusyName(null)
    }
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) e.target.value = ''
    if (!file) return
    setUploadPct(0)
    try {
      await adminApi.uploadBackup(file, setUploadPct)
      flash(true, 'Файл загружен')
      await load()
    } catch (err) {
      flash(false, translateError(err))
    } finally {
      setUploadPct(null)
    }
  }

  async function patchSchedule(body: BackupScheduleUpdate) {
    if (!schedule) return
    setSavingSchedule(true)
    // Оптимистично применяем локально.
    setSchedule({ ...schedule, ...body })
    try {
      const r = await adminApi.updateBackupSchedule(body)
      setSchedule(r.data.data)
    } catch (err) {
      flash(false, translateError(err))
      await load()
    } finally {
      setSavingSchedule(false)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-24"><Spinner size={28} /></div>
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl">
      {/* Заголовок */}
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: 'var(--grad-own)', boxShadow: 'var(--glow-primary)' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
          </svg>
        </div>
        <div>
          <h1 className="font-display text-xl font-bold text-white leading-tight">Резервные копии</h1>
          <p className="text-xs" style={{ color: 'var(--text-low)' }}>Бэкап базы данных, загрузка и расписание</p>
        </div>
        {toast && (
          <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="ml-auto text-xs px-2.5 py-1 rounded-full"
            style={{
              background: toast.ok ? 'rgba(52,211,153,0.15)' : 'rgba(239,68,68,0.15)',
              color: toast.ok ? '#34D399' : '#fca5a5',
            }}>
            {toast.text}
          </motion.span>
        )}
      </div>

      {error && <div className="mb-4"><ErrorMessage error={error} /></div>}

      {/* Действия */}
      <div className="glass rounded-2xl p-4 mb-4">
        <div className="flex flex-wrap gap-2">
          <button onClick={create} disabled={creating}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold transition-opacity disabled:opacity-50"
            style={{ background: 'var(--grad-own)', color: '#fff', boxShadow: 'var(--glow-primary)' }}>
            {creating ? 'Создание…' : '+ Создать копию'}
          </button>

          <button onClick={() => fileRef.current?.click()} disabled={uploadPct !== null}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold transition-opacity disabled:opacity-50"
            style={{ background: 'rgba(255,255,255,0.08)', color: '#fff', border: '1px solid rgba(255,255,255,0.12)' }}>
            {uploadPct !== null ? `Загрузка… ${uploadPct}%` : '↑ Загрузить файл'}
          </button>
          <input ref={fileRef} type="file" accept=".sql.gz,.gz,.sql" className="hidden" onChange={onUpload} />
        </div>
        <p className="text-[11px] mt-2.5" style={{ color: 'var(--text-low)' }}>
          Копия создаётся через <code>pg_dump</code> и хранится в объектном хранилище (S3/MinIO).
          Можно загрузить ранее скачанный файл <code>.sql.gz</code> обратно на сервер.
        </p>
      </div>

      {/* Расписание */}
      {schedule && (
        <div className="glass rounded-2xl p-4 mb-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-white text-sm">Автоматические бэкапы</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-low)' }}>
                Создаются по расписанию воркером планировщика (время в UTC).
              </p>
            </div>
            <Toggle checked={schedule.enabled} disabled={savingSchedule}
              onChange={(v) => patchSchedule({ enabled: v })} />
          </div>

          {schedule.enabled && (
            <div className="space-y-3 pt-1">
              {/* Периодичность */}
              <Field label="Периодичность">
                <select value={schedule.frequency} disabled={savingSchedule}
                  onChange={e => patchSchedule({ frequency: e.target.value as BackupFrequency })}
                  className={selectCls}>
                  <option value="daily">Ежедневно</option>
                  <option value="weekly">Еженедельно</option>
                  <option value="monthly">Ежемесячно</option>
                </select>
              </Field>

              {schedule.frequency === 'weekly' && (
                <Field label="День недели">
                  <select value={schedule.weekday} disabled={savingSchedule}
                    onChange={e => patchSchedule({ weekday: Number(e.target.value) })}
                    className={selectCls}>
                    {WEEKDAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                  </select>
                </Field>
              )}

              {schedule.frequency === 'monthly' && (
                <Field label="День месяца (1–28)">
                  <input type="number" min={1} max={28} value={schedule.day} disabled={savingSchedule}
                    onChange={e => patchSchedule({ day: Number(e.target.value) || 1 })}
                    className={inputCls} />
                </Field>
              )}

              {/* Время */}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Час (UTC, 0–23)">
                  <input type="number" min={0} max={23} value={schedule.hour} disabled={savingSchedule}
                    onChange={e => patchSchedule({ hour: Math.min(23, Math.max(0, Number(e.target.value) || 0)) })}
                    className={inputCls} />
                </Field>
                <Field label="Минута (0–59)">
                  <input type="number" min={0} max={59} value={schedule.minute} disabled={savingSchedule}
                    onChange={e => patchSchedule({ minute: Math.min(59, Math.max(0, Number(e.target.value) || 0)) })}
                    className={inputCls} />
                </Field>
              </div>

              {/* Ретеншн */}
              <Field label="Хранить последних авто-копий">
                <input type="number" min={1} max={365} value={schedule.retention} disabled={savingSchedule}
                  onChange={e => patchSchedule({ retention: Math.min(365, Math.max(1, Number(e.target.value) || 1)) })}
                  className={inputCls} />
              </Field>
              <p className="text-[11px] -mt-1" style={{ color: 'var(--text-low)' }}>
                Старые автоматические копии сверх лимита удаляются. Ручные и загруженные копии сохраняются всегда.
              </p>

              {schedule.lastRunAt && (
                <p className="text-[11px]" style={{ color: 'var(--text-low)' }}>
                  Последний авто-запуск: {formatDate(schedule.lastRunAt)}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Список копий */}
      <div className="glass rounded-2xl p-4">
        <p className="font-semibold text-white text-sm mb-3">
          Копии {backups.length > 0 && <span style={{ color: 'var(--text-low)' }}>({backups.length})</span>}
        </p>

        {backups.length === 0 ? (
          <p className="text-sm py-6 text-center" style={{ color: 'var(--text-low)' }}>
            Резервных копий пока нет. Создайте первую кнопкой выше.
          </p>
        ) : (
          <div className="space-y-2">
            {backups.map(b => {
              const tag = TRIGGER_LABEL[b.trigger]
              const busy = busyName === b.name
              return (
                <div key={b.name}
                  className="flex items-center gap-3 p-3 rounded-xl"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm text-white font-medium truncate">{b.name}</p>
                      <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full shrink-0"
                        style={{ background: tag.bg, color: tag.color }}>{tag.text}</span>
                    </div>
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-low)' }}>
                      {formatDate(b.createdAt)} · {formatSize(b.size)}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <IconBtn title="Скачать" onClick={() => download(b.name)} color="rgba(255,255,255,0.6)">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                    </IconBtn>
                    <IconBtn title="Восстановить БД из копии" onClick={() => restore(b.name)} color="#60A5FA" disabled={busy}>
                      <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
                    </IconBtn>
                    <IconBtn title="Удалить" onClick={() => remove(b.name)} color="#EF4444" disabled={busy}>
                      <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                    </IconBtn>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Мелкие компоненты ─────────────────────────────────────────

const inputCls = 'w-full px-3 py-2 rounded-xl text-sm text-white bg-white/[0.04] border border-white/10 outline-none transition-colors focus:border-white/25 disabled:opacity-50'
const selectCls = inputCls + ' appearance-none cursor-pointer [&>option]:bg-[#1a1030] [&>option]:text-white'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs mb-1.5 block" style={{ color: 'var(--text-mid)' }}>{label}</span>
      {children}
    </label>
  )
}

function IconBtn({ title, onClick, color, disabled, children }: {
  title: string; onClick: () => void; color: string; disabled?: boolean; children: React.ReactNode
}) {
  return (
    <button type="button" title={title} onClick={onClick} disabled={disabled}
      className="w-9 h-9 flex items-center justify-center rounded-lg transition-colors hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
      style={{ color }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </button>
  )
}

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={() => onChange(!checked)}
      className="relative w-12 h-7 rounded-full transition-colors shrink-0 disabled:opacity-50"
      style={{ background: checked ? 'var(--grad-own)' : 'rgba(255,255,255,0.12)' }}>
      <motion.span className="absolute top-1 left-1 w-5 h-5 rounded-full bg-white"
        animate={{ x: checked ? 20 : 0 }} transition={{ type: 'spring', stiffness: 500, damping: 32 }} />
    </button>
  )
}
