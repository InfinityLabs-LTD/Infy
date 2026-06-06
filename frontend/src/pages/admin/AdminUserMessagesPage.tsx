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
          Messages by{' '}
          <span className="text-primary-600">
            {user ? `@${user.username}` : `#${id}`}
          </span>
          <span className="text-gray-400 font-normal text-base ml-2">{total} total</span>
        </h1>
      </div>

      {error !== null && <div className="mb-4"><ErrorMessage error={error} /></div>}

      {loading && messages.length === 0 ? (
        <div className="flex justify-center py-16"><Spinner size={32} /></div>
      ) : (
        <div className="bg-white rounded-2xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                <th className="px-4 py-3 text-left w-8">Type</th>
                <th className="px-4 py-3 text-left">Content</th>
                <th className="px-4 py-3 text-left">Chat</th>
                <th className="px-4 py-3 text-left">Sent</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {messages.map(m => (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-lg">{TYPE_ICON[m.type] ?? '?'}</td>
                  <td className="px-4 py-3 max-w-xs">
                    <p className="truncate text-gray-800">
                      {m.content ?? (m.attachments.length > 0 ? `[${m.type.toLowerCase()}]` : '—')}
                    </p>
                    {m.attachments.length > 0 && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        {m.attachments[0].mimeType}
                        {m.attachments[0].sizeBytes
                          ? ` · ${(m.attachments[0].sizeBytes / 1024).toFixed(0)} KB`
                          : ''}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400 font-mono">{m.chat.id.slice(0, 8)}…</td>
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                    {new Date(m.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
              {messages.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-gray-400">No messages</td>
                </tr>
              )}
            </tbody>
          </table>

          {pages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
              <p className="text-xs text-gray-500">Page {page} of {pages}</p>
              <div className="flex gap-1">
                <button onClick={() => load(page - 1)} disabled={page <= 1}
                  className="btn-ghost py-1 px-2 text-xs disabled:opacity-40">← Prev</button>
                <button onClick={() => load(page + 1)} disabled={page >= pages}
                  className="btn-ghost py-1 px-2 text-xs disabled:opacity-40">Next →</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
