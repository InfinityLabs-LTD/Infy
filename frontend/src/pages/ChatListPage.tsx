import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { chatApi } from '@/api/chat'
import { useChatStore } from '@/store/chat'
import { useAuthStore } from '@/store/auth'
import { useSocket } from '@/hooks/useSocket'
import { Avatar } from '@/components/ui/Avatar'
import { OnlineIndicator } from '@/components/ui/OnlineIndicator'
import { Spinner } from '@/components/ui/Spinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'

export function ChatListPage() {
  const user = useAuthStore((s) => s.user)
  const { chats, setChats } = useChatStore()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const [search, setSearch] = useState('')

  useSocket()  // initialise socket connection

  useEffect(() => {
    chatApi.listChats()
      .then((r) => setChats(r.data.data))
      .catch(setError)
      .finally(() => setLoading(false))
  }, [])

  const filtered = chats.filter((c) => {
    const name = c.partner?.nickname ?? ''
    const uname = c.partner?.username ?? ''
    return (
      name.toLowerCase().includes(search.toLowerCase()) ||
      uname.toLowerCase().includes(search.toLowerCase())
    )
  })

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <h1 className="text-xl font-bold">Infy</h1>
        <div className="flex items-center gap-2">
          <Link to="/profile" className="btn-ghost p-2">
            <Avatar url={user?.avatarUrl ?? null} nickname={user?.nickname ?? '?'} size={32} />
          </Link>
        </div>
      </div>

      {/* Search */}
      <div className="px-4 pt-3 pb-1">
        <input
          className="input bg-gray-100 border-transparent focus:bg-white"
          placeholder="Поиск чатов…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {error !== null && <div className="px-4 py-3"><ErrorMessage error={error} /></div>}

        {loading ? (
          <div className="flex justify-center py-16"><Spinner size={32} /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            {search ? 'Чаты не найдены' : 'Пока нет чатов'}
          </div>
        ) : (
          filtered.map((chat) => (
            <Link
              key={chat.id}
              to={`/chat/${chat.id}`}
              className="flex items-center gap-3 px-4 py-3 hover:bg-gray-100 transition-colors border-b border-gray-50"
            >
              <div className="relative shrink-0">
                <Avatar
                  url={chat.partner?.avatarUrl ?? null}
                  nickname={chat.partner?.nickname ?? '?'}
                  size={48}
                />
                {chat.partner && (
                  <span className="absolute bottom-0 right-0">
                    <OnlineIndicator userId={chat.partner.id} />
                  </span>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline">
                  <p className="font-semibold truncate">{chat.partner?.nickname ?? 'Unknown'}</p>
                  {chat.lastMessage && (
                    <span className="text-xs text-gray-400 shrink-0 ml-2">
                      {formatTime(chat.lastMessage.createdAt)}
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500 truncate">
                  {chat.lastMessage?.content ?? 'Нет сообщений'}
                </p>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  )
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}
