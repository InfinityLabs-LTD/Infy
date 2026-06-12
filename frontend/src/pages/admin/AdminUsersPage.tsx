import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminApi, AdminUser } from '@/api/admin'
import { Avatar } from '@/components/ui/Avatar'
import { Spinner } from '@/components/ui/Spinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'

export function AdminUsersPage() {
  const navigate = useNavigate()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editRole, setEditRole] = useState<'USER' | 'ADMIN'>('USER')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async (p: number, q: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await adminApi.listUsers({ page: p, limit: 50, search: q || undefined })
      const d = res.data.data
      setUsers(d.users)
      setTotal(d.total)
      setPage(d.page)
      setPages(d.pages)
    } catch (e) { setError(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load(1, '') }, [])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    load(1, search)
  }

  async function saveRole(userId: string) {
    setSaving(true)
    try {
      const res = await adminApi.updateUser(userId, { role: editRole })
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: res.data.data.role } : u))
      setEditingId(null)
    } catch (e) { setError(e) }
    finally { setSaving(false) }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">Пользователи <span className="text-ink-low font-normal text-base ml-2">{total} всего</span></h1>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-2 mb-4">
        <input
          className="input flex-1 max-w-sm"
          placeholder="Поиск по имени, нику или email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <button type="submit" className="btn-primary px-4">Найти</button>
      </form>

      {error !== null && <div className="mb-4"><ErrorMessage error={error} /></div>}

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size={32} /></div>
      ) : (
        <div className="glass rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 bg-white/[0.03] text-ink-low text-xs uppercase tracking-wide">
                <th className="px-4 py-3 text-left">Пользователь</th>
                <th className="px-4 py-3 text-left">Email</th>
                <th className="px-4 py-3 text-left">Роль</th>
                <th className="px-4 py-3 text-left">Регистрация</th>
                <th className="px-4 py-3 text-left">Последний вход</th>
                <th className="px-4 py-3 text-left">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-white/5 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <Avatar url={u.avatarUrl} nickname={u.nickname} size={32} />
                      <div>
                        <p className="font-medium">{u.nickname}</p>
                        <p className="text-ink-low text-xs">@{u.username}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-ink-low">{u.email ?? '—'}</td>
                  <td className="px-4 py-3">
                    {editingId === u.id ? (
                      <div className="flex items-center gap-1.5">
                        <select
                          className="input py-1 text-xs"
                          value={editRole}
                          onChange={e => setEditRole(e.target.value as 'USER' | 'ADMIN')}
                        >
                          <option value="USER">USER</option>
                          <option value="ADMIN">ADMIN</option>
                        </select>
                        <button
                          onClick={() => saveRole(u.id)}
                          disabled={saving}
                          className="btn-primary py-1 px-2 text-xs"
                        >
                          {saving ? <Spinner size={12} /> : 'Сохранить'}
                        </button>
                        <button onClick={() => setEditingId(null)} className="btn-ghost py-1 px-2 text-xs">✕</button>
                      </div>
                    ) : (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        u.role === 'ADMIN' ? 'bg-accent/20 text-highlight' : 'bg-white/10 text-ink-mid'
                      }`}>
                        {u.role}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-low text-xs">{new Date(u.createdAt).toLocaleDateString('ru-RU')}</td>
                  <td className="px-4 py-3 text-ink-low text-xs">{new Date(u.lastSeenAt).toLocaleDateString('ru-RU')}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button
                        onClick={() => {
                          setEditingId(u.id)
                          setEditRole(u.role as 'USER' | 'ADMIN')
                        }}
                        className="btn-ghost py-1 px-2 text-xs text-ink-low"
                        title="Изменить роль"
                      >
                        Роль
                      </button>
                      <button
                        onClick={() => navigate(`/admin/users/${u.id}/messages`)}
                        className="btn-ghost py-1 px-2 text-xs text-ink-low"
                        title="Просмотр сообщений"
                      >
                        Сообщения
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          {pages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
              <p className="text-xs text-ink-low">Страница {page} из {pages}</p>
              <div className="flex gap-1">
                <button
                  onClick={() => load(page - 1, search)}
                  disabled={page <= 1}
                  className="btn-ghost py-1 px-2 text-xs disabled:opacity-40"
                >← Назад</button>
                <button
                  onClick={() => load(page + 1, search)}
                  disabled={page >= pages}
                  className="btn-ghost py-1 px-2 text-xs disabled:opacity-40"
                >Далее →</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
