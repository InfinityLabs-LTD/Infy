import { useEffect, useRef, useState } from 'react'
import { adminApi, Container } from '@/api/admin'
import { useAuthStore } from '@/store/auth'
import { Spinner } from '@/components/ui/Spinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'

const STATE_COLOR: Record<string, string> = {
  running: 'bg-green-100 text-green-700',
  exited:  'bg-gray-100 text-gray-500',
  paused:  'bg-yellow-100 text-yellow-700',
  created: 'bg-blue-100 text-blue-700',
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

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">Контейнеры</h1>
        <button onClick={load} disabled={loading} className="btn-ghost text-sm gap-1.5">
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

      <div className="bg-white rounded-2xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
              <th className="px-4 py-3 text-left">Имя</th>
              <th className="px-4 py-3 text-left">Образ</th>
              <th className="px-4 py-3 text-left">Статус</th>
              <th className="px-4 py-3 text-left">Состояние</th>
              <th className="px-4 py-3 text-left">Действия</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading && containers.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center"><Spinner size={24} /></td></tr>
            ) : containers.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400">Контейнеры не найдены</td></tr>
            ) : containers.map(c => (
              <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-medium">{c.names[0] ?? c.id.slice(0, 12)}</td>
                <td className="px-4 py-3 text-gray-500 text-xs font-mono max-w-[200px] truncate">
                  {c.image}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                    STATE_COLOR[c.state] ?? 'bg-gray-100 text-gray-600'
                  }`}>
                    {STATE_LABEL[c.state] ?? c.state}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">{c.status}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    <button
                      onClick={() => openLogs(c)}
                      className="btn-ghost py-1 px-2 text-xs text-gray-600"
                      title="Просмотр логов"
                    >
                      Логи
                    </button>
                    <button
                      onClick={() => restart(c.id)}
                      disabled={restarting === c.id}
                      className="btn-ghost py-1 px-2 text-xs text-orange-600 hover:bg-orange-50 disabled:opacity-40"
                      title="Перезапустить контейнер"
                    >
                      {restarting === c.id ? <Spinner size={12} /> : 'Перезапустить'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Log drawer */}
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
      <div className="flex-1 bg-black/50" onClick={onClose} />

      <div className="w-full max-w-3xl bg-gray-950 flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <div className="flex items-center gap-2.5">
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`} />
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
      </div>
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
