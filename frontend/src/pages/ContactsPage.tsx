import { useChatStore } from '@/store/chat'
import { useNavigate } from 'react-router-dom'
import { Avatar } from '@/components/ui/Avatar'
import { OnlineIndicator } from '@/components/ui/OnlineIndicator'

function formatLastSeen(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'только что'
  if (diffMin < 60) return `${diffMin} мин. назад`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH} ч. назад`
  const diffD = Math.floor(diffH / 24)
  if (diffD < 7) return `${diffD} дн. назад`
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

export function ContactsPage() {
  const navigate = useNavigate()
  const { chats, onlineUsers, lastSeenMap } = useChatStore()

  const contacts = chats
    .filter(c => c.partner)
    .map(c => ({
      ...c.partner!,
      chatId: c.id,
      isOnline: onlineUsers.has(c.partner!.id),
      lastSeenAt: lastSeenMap[c.partner!.id] ?? c.partner!.lastSeenAt,
    }))
    .sort((a, b) => {
      if (a.isOnline && !b.isOnline) return -1
      if (!a.isOnline && b.isOnline) return 1
      return new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime()
    })

  return (
    <div className="flex flex-col flex-1 min-h-0" style={{ background: 'var(--bg-deep)' }}>
      <div className="shrink-0 px-4 py-3 flex items-center" style={{
        background: 'rgba(255,255,255,0.04)',
        backdropFilter: 'blur(24px) saturate(140%)',
        WebkitBackdropFilter: 'blur(24px) saturate(140%)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <h1 className="text-base font-semibold text-white">Контакты</h1>
        <span className="ml-2 text-sm" style={{ color: 'var(--text-low)' }}>{contacts.length}</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
            <div className="w-14 h-14 rounded-full flex items-center justify-center mb-3"
              style={{ background: 'rgba(124,58,237,0.15)' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#A855F7" strokeWidth="1.5">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
              </svg>
            </div>
            <p className="text-sm" style={{ color: 'var(--text-low)' }}>Нет контактов</p>
          </div>
        ) : (
          contacts.map(contact => (
            <button
              key={contact.id}
              className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              onClick={() => navigate(`/chat/${contact.id}`)}
            >
              <div className="relative shrink-0">
                <Avatar url={contact.avatarUrl} nickname={contact.nickname} size={46} />
                <span className="absolute bottom-0 right-0">
                  <OnlineIndicator userId={contact.id} />
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{contact.nickname}</p>
                <p className="text-xs truncate mt-0.5" style={{ color: contact.isOnline ? '#22C55E' : 'var(--text-low)' }}>
                  {contact.isOnline ? 'в сети' : formatLastSeen(contact.lastSeenAt)}
                </p>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
