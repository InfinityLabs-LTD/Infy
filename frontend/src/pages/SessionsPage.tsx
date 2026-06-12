import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { sessionsApi, Session } from '@/api/auth'
import { useAuthStore } from '@/store/auth'
import { Spinner } from '@/components/ui/Spinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'

export function SessionsPage() {
  const navigate = useNavigate()
  const logout = useAuthStore((s) => s.logout)

  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const [revoking, setRevoking] = useState<string | null>(null)

  async function load() {
    setLoading(true); setError(null)
    try {
      const res = await sessionsApi.list()
      setSessions(res.data.data)
    } catch (err) { setError(err) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function revoke(id: string, isCurrent: boolean) {
    if (!confirm('Завершить эту сессию?')) return
    setRevoking(id)
    try {
      await sessionsApi.revoke(id)
      if (isCurrent) { logout(); navigate('/login'); return }
      setSessions((prev) => prev.filter((s) => s.id !== id))
    } catch (err) { setError(err) }
    finally { setRevoking(null) }
  }

  async function revokeAll() {
    if (!confirm('Выйти со всех других устройств?')) return
    try {
      await sessionsApi.logoutAll(true)
      await load()
    } catch (err) { setError(err) }
  }

  const otherCount = sessions.filter((s) => !s.isCurrent).length

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
        <h1 className="text-base font-semibold text-white">Мои устройства</h1>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-3">
        {error !== null && <ErrorMessage error={error} />}

        {loading ? (
          <div className="flex justify-center py-12"><Spinner size={32} /></div>
        ) : (
          <>
            {sessions.map((session) => (
              <div key={session.id} className="flex items-start justify-between gap-4 rounded-2xl p-4"
                style={{ background: 'var(--glass-1)', border: '1px solid var(--glass-stroke)' }}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" className="shrink-0">
                      <rect x="2" y="3" width="20" height="14" rx="2"/>
                      <path d="M8 21h8M12 17v4"/>
                    </svg>
                    <span className="font-medium text-sm text-white truncate">
                      {session.deviceName ?? 'Неизвестное устройство'}
                    </span>
                    {session.isCurrent && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium shrink-0"
                        style={{ background: 'rgba(34,197,94,0.15)', color: '#22C55E' }}>
                        Текущий
                      </span>
                    )}
                  </div>
                  {session.userAgent && (
                    <p className="text-xs truncate mb-0.5" style={{ color: 'var(--text-low)' }}>{session.userAgent}</p>
                  )}
                  <p className="text-xs" style={{ color: 'var(--text-low)' }}>
                    {session.ip && `${session.ip} · `}
                    Активность {new Date(session.lastActiveAt).toLocaleDateString('ru-RU')}
                  </p>
                </div>
                <button
                  onClick={() => revoke(session.id, session.isCurrent)}
                  disabled={revoking === session.id}
                  className="shrink-0 text-xs font-medium disabled:opacity-50 transition-colors"
                  style={{ color: '#EF4444' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#f87171')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#EF4444')}>
                  {revoking === session.id ? <Spinner size={14} /> : 'Завершить'}
                </button>
              </div>
            ))}

            {otherCount > 0 && (
              <button onClick={revokeAll} className="w-full py-3 rounded-2xl text-sm font-medium transition-colors"
                style={{ color: '#EF4444', border: '1px solid rgba(239,68,68,0.2)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.08)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                Выйти со всех других устройств ({otherCount})
              </button>
            )}

            {sessions.length === 0 && (
              <p className="text-center py-8" style={{ color: 'var(--text-low)' }}>Нет активных сессий</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
