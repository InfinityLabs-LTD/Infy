import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { adminApi, AdminMessage, AdminUserDetail } from '@/api/admin'
import { Spinner } from '@/components/ui/Spinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'

export function AdminUserMessagesPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [user, setUser]       = useState<AdminUserDetail | null>(null)
  const [messages, setMessages] = useState<AdminMessage[]>([])
  const [total, setTotal]     = useState(0)
  const [page, setPage]       = useState(1)
  const [pages, setPages]     = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<unknown>(null)

  async function load(p: number) {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const [userRes, msgRes] = await Promise.all([
        user ? null : adminApi.getUser(id),
        adminApi.getUserMessages(id, { page: p, limit: 50 }),
      ])
      if (userRes) setUser(userRes.data.data)
      const d = msgRes.data.data
      setMessages(d.messages)
      setTotal(d.total)
      setPage(d.page)
      setPages(d.pages)
    } catch (e) { setError(e) }
    finally { setLoading(false) }
  }

  useEffect(() => { load(1) }, [id])

  const TYPE_ICON: Record<string, string> = {
    TEXT:         '💬',
    IMAGE:        '🖼️',
    VIDEO:        '🎥',
    AUDIO:        '🎤',
    CIRCLE_VIDEO: '⭕',
  }

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/admin/users')} className="btn-ghost p-1">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
        </button>
        <h1 className="text-xl font-bold">
          Сообщения{' '}
          <span className="text-highlight">
            {user ? `@${user.username}` : `#${id}`}
          </span>
          <span className="text-ink-low font-normal text-base ml-2">{total} всего</span>
        </h1>
      </div>

      {error !== null && <div className="mb-4"><ErrorMessage error={error} /></div>}

      {loading && messages.length === 0 ? (
        <div className="flex justify-center py-16"><Spinner size={32} /></div>
      ) : (
        <div className="glass rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 bg-white/[0.03] text-ink-low text-xs uppercase tracking-wide">
                <th className="px-4 py-3 text-left w-8">Тип</th>
                <th className="px-4 py-3 text-left">Текст</th>
                <th className="px-4 py-3 text-left">Чат</th>
                <th className="px-4 py-3 text-left">Отправлено</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {messages.map(m => (
                <tr key={m.id} className="hover:bg-white/5 transition-colors">
                  <td className="px-4 py-3 text-lg">{TYPE_ICON[m.type] ?? '?'}</td>
                  <td className="px-4 py-3 max-w-xs">
                    <p className="truncate text-white/90">
                      {m.content ?? (m.attachments.length > 0 ? `[${m.type.toLowerCase()}]` : '—')}
                    </p>
                    {m.attachments.length > 0 && (
                      <p className="text-xs text-ink-low mt-0.5">
                        {m.attachments[0].mimeType}
                        {m.attachments[0].sizeBytes
                          ? ` · ${(m.attachments[0].sizeBytes / 1024).toFixed(0)} КБ`
                          : ''}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-low font-mono">{m.chat.id.slice(0, 8)}…</td>
                  <td className="px-4 py-3 text-xs text-ink-low whitespace-nowrap">
                    {new Date(m.createdAt).toLocaleString('ru-RU')}
                  </td>
                </tr>
              ))}
              {messages.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-ink-low">Нет сообщений</td>
                </tr>
              )}
            </tbody>
          </table>

          {pages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
              <p className="text-xs text-ink-low">Страница {page} из {pages}</p>
              <div className="flex gap-1">
                <button onClick={() => load(page - 1)} disabled={page <= 1}
                  className="btn-ghost py-1 px-2 text-xs disabled:opacity-40">← Назад</button>
                <button onClick={() => load(page + 1)} disabled={page >= pages}
                  className="btn-ghost py-1 px-2 text-xs disabled:opacity-40">Далее →</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
