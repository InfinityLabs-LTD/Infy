import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { adminApi, Container } from '@/api/admin'
import { useAuthStore } from '@/store/auth'
import { Spinner } from '@/components/ui/Spinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'

const STATE_DOT: Record<string, string> = {
  running: '#22C55E',
  paused:  '#F59E0B',
  exited:  '#64748B',
  created: '#A855F7',
}

const STATE_LABEL: Record<string, string> = {
  running: 'запущен',
  exited:  'остановлен',
  paused:  'на паузе',
  created: 'создан',
}

export function AdminContainersPage() {
  const accessToken = useAuthStore((s) => s.accessToken)
  const [containers, setContainers] = useState<Container[]>([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<unknown>(null)
  const [restarting, setRestarting] = useState<string | null>(null)
  const [logsId, setLogsId]         = useState<string | null>(null)
  const [logsName, setLogsName]     = useState('')

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await adminApi.listContainers()
      setContainers(res.data.data)
    } catch (e) { setError(e) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function restart(id: string) {
    if (!confirm('Перезапустить контейнер?')) return
    setRestarting(id)
    try {
      await adminApi.restartContainer(id)
      await load()
    } catch (e) { setError(e) }
    finally { setRestarting(null) }
  }

  function openLogs(c: Container) {
    setLogsId(c.id)
    setLogsName(c.names[0] ?? c.id.slice(0, 12))
  }

  const runningCount = containers.filter(c => c.state === 'running').length

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center gap-3 mb-5">
        <h1 className="font-display text-xl font-bold text-white">Контейнеры</h1>
        {containers.length > 0 && (
          <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
            style={{
              background: runningCount === containers.length ? 'rgba(34,197,94,0.12)' : 'rgba(245,158,11,0.12)',
              color: runningCount === containers.length ? '#22C55E' : '#F59E0B',
            }}>
            {runningCount}/{containers.length} активны
          </span>
        )}
        <button onClick={load} disabled={loading} className="btn-ghost text-sm gap-1.5 ml-auto">
          {loading ? <Spinner size={14} /> : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="23 4 23 10 17 10"/>
              <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
            </svg>
          )}
          Обновить
        </button>
      </div>

      {error !== null && <div className="mb-4"><ErrorMessage error={error} /></div>}

      {loading && containers.length === 0 ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="glass rounded-2xl h-[64px] animate-pulse" style={{ opacity: 1 - i * 0.18 }} />
          ))}
        </div>
      ) : containers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="w-14 h-14 rounded-full flex items-center justify-center mb-3"
            style={{ background: 'rgba(124,58,237,0.15)' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#A855F7" strokeWidth="1.5">
              <rect x="2" y="7" width="20" height="14" rx="2"/>
              <path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/>
            </svg>
          </div>
          <p className="text-sm" style={{ color: 'var(--text-low)' }}>Контейнеры не найдены</p>
        </div>
      ) : (
        <div className="space-y-2">
          {containers.map((c, i) => (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 32, delay: Math.min(i * 0.03, 0.3) }}
              className="glass rounded-2xl px-4 py-3 flex items-center gap-3.5 transition-colors hover:bg-white/[0.06]"
            >
              {/* Статус-точка */}
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${c.state === 'running' ? 'animate-pulse' : ''}`}
                style={{ background: STATE_DOT[c.state] ?? '#64748B' }} />

              {/* Имя + образ */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate font-mono">
                  {c.names[0] ?? c.id.slice(0, 12)}
                </p>
                <p className="text-[11px] font-mono truncate" style={{ color: 'var(--text-low)' }}>
                  {c.image}
                </p>
              </div>

              {/* Состояние */}
              <div className="hidden sm:block w-40 shrink-0">
                <p className="text-xs font-medium" style={{ color: STATE_DOT[c.state] ?? 'var(--text-mid)' }}>
                  {STATE_LABEL[c.state] ?? c.state}
                </p>
                <p className="text-[11px] truncate" style={{ color: 'var(--text-low)' }}>{c.status}</p>
              </div>

              {/* Действия */}
              <div className="flex gap-1 shrink-0">
                <button onClick={() => openLogs(c)} title="Просмотр логов"
                  className="btn-ghost py-1.5 px-3 text-xs">
                  Логи
                </button>
                <button onClick={() => restart(c.id)} disabled={restarting === c.id}
                  title="Перезапустить контейнер"
                  className="btn-ghost py-1.5 px-3 text-xs text-warn hover:bg-warn/10 disabled:opacity-40">
                  {restarting === c.id ? <Spinner size={12} /> : 'Перезапуск'}
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {logsId && accessToken && (
        <LogsDrawer
          containerId={logsId}
          name={logsName}
          accessToken={accessToken}
          onClose={() => setLogsId(null)}
        />
      )}
    </div>
  )
}

// ── Log Drawer ───────────────────────────────────────────────

function LogsDrawer({
  containerId,
  name,
  accessToken,
  onClose,
}: {
  containerId: string
  name: string
  accessToken: string
  onClose: () => void
}) {
  const [lines, setLines]   = useState<string[]>([])
  const [err, setErr]       = useState<string | null>(null)
  const [connected, setConnected] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const apiBase = import.meta.env.VITE_API_URL ?? '/api'
    const ctrl = new AbortController()

    ;(async () => {
      try {
        const res = await fetch(
          `${apiBase}/admin/containers/${containerId}/logs?tail=300`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
            signal: ctrl.signal,
          },
        )
        if (!res.ok || !res.body) { setErr(`HTTP ${res.status}`); return }
        setConnected(true)

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buf = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          const parts = buf.split('\n\n')
          buf = parts.pop() ?? ''
          for (const part of parts) {
            const dataLine = part.split('\n').find(l => l.startsWith('data:'))
            if (!dataLine) continue
            try {
              const text = JSON.parse(dataLine.slice(5))
              setLines(prev => [...prev.slice(-2000), text])
            } catch { /* skip */ }
          }
        }
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setErr((e as Error).message)
      } finally {
        setConnected(false)
      }
    })()

    return () => ctrl.abort()
  }, [containerId, accessToken])

  useEffect(() => {
    bottomRef.current?.scrollIntoView()
  }, [lines.length])

  return (
    <div className="fixed inset-0 z-50 flex">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.18 }}
        className="flex-1"
        style={{ background: 'rgba(8,11,22,0.6)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
      />

      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 32 }}
        className="w-full max-w-3xl flex flex-col shadow-2xl"
        style={{ background: 'rgba(5,7,15,0.97)', borderLeft: '1px solid rgba(255,255,255,0.08)' }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-ok animate-pulse' : 'bg-ink-low'}`} />
            <p className="text-white font-medium text-sm font-mono">{name}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setLines([])}
              className="text-xs text-gray-400 hover:text-white transition-colors"
            >
              Очистить
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors ml-2">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 font-mono text-xs leading-relaxed">
          {err && <p className="text-red-400 mb-2">Ошибка: {err}</p>}
          {lines.length === 0 && !err && (
            <p className="text-gray-500 italic">Ожидание логов…</p>
          )}
          {lines.map((line, i) => (
            <LogLine key={i} line={line} />
          ))}
          <div ref={bottomRef} />
        </div>
      </motion.div>
    </div>
  )
}

function LogLine({ line }: { line: string }) {
  const lower = line.toLowerCase()
  const color =
    lower.includes('error') || lower.includes('err ') || lower.includes('fatal')
      ? 'text-red-400'
      : lower.includes('warn')
      ? 'text-yellow-400'
      : lower.includes('info')
      ? 'text-green-400'
      : lower.includes('debug')
      ? 'text-gray-500'
      : 'text-gray-300'

  return <p className={`${color} whitespace-pre-wrap break-all`}>{line}</p>
}
