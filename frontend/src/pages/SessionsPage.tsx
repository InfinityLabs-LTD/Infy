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
    setLoading(true)
    setError(null)
    try {
      const res = await sessionsApi.list()
      setSessions(res.data.data)
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function revoke(id: string, isCurrent: boolean) {
    if (!confirm('Завершить эту сессию?')) return
    setRevoking(id)
    try {
      await sessionsApi.revoke(id)
      if (isCurrent) {
        logout()
        navigate('/login')
        return
      }
      setSessions((prev) => prev.filter((s) => s.id !== id))
    } catch (err) {
      setError(err)
    } finally {
      setRevoking(null)
    }
  }

  async function revokeAll() {
    if (!confirm('Выйти со всех других устройств?')) return
    try {
      await sessionsApi.logoutAll(true)
      await load()
    } catch (err) {
      setError(err)
    }
  }

  const otherCount = sessions.filter((s) => !s.isCurrent).length

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="btn-ghost p-1">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
        </button>
        <h1 className="text-lg font-semibold">Мои устройства</h1>
      </div>

      <div className="max-w-lg mx-auto px-4 py-8 space-y-4">
        {error !== null && <ErrorMessage error={error} />}

        {loading ? (
          <div className="flex justify-center py-12"><Spinner size={32} /></div>
        ) : (
          <>
            {sessions.map((session) => (
              <div key={session.id} className="card flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <DeviceIcon />
                    <span className="font-medium text-sm truncate">
                      {session.deviceName ?? 'Неизвестное устройство'}
                    </span>
                    {session.isCurrent && (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                        Текущий
                      </span>
                    )}
                  </div>
                  {session.userAgent && (
                    <p className="text-xs text-gray-400 mt-1 truncate">{session.userAgent}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-0.5">
                    {session.ip && `${session.ip} · `}
                    Последняя активность {new Date(session.lastActiveAt).toLocaleDateString('ru-RU')}
                  </p>
                </div>
                <button
                  onClick={() => revoke(session.id, session.isCurrent)}
                  disabled={revoking === session.id}
                  className="shrink-0 text-xs text-red-500 hover:text-red-700 font-medium disabled:opacity-50"
                >
                  {revoking === session.id ? <Spinner size={14} /> : 'Завершить'}
                </button>
              </div>
            ))}

            {otherCount > 0 && (
              <button onClick={revokeAll} className="btn-ghost w-full text-red-500 mt-2">
                Выйти со всех других устройств ({otherCount})
              </button>
            )}

            {sessions.length === 0 && (
              <p className="text-center text-gray-400 py-8">Нет активных сессий</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function DeviceIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-400 shrink-0">
      <rect x="2" y="3" width="20" height="14" rx="2"/>
      <path d="M8 21h8M12 17v4"/>
    </svg>
  )
}
