import { useChatStore } from '@/store/chat'

interface Props {
  userId: string
  lastSeenAt?: string
  showLabel?: boolean
}

export function OnlineIndicator({ userId, lastSeenAt, showLabel = false }: Props) {
  const isOnline = useChatStore((s) => s.onlineUsers.has(userId))
  const storedLastSeen = useChatStore((s) => s.lastSeenMap[userId])

  if (isOnline) {
    return (
      <span className="flex items-center gap-1">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: '#4ade80', boxShadow: '0 0 0 2px #17212b' }} />
        {showLabel && <span className="text-xs" style={{ color: '#4ade80' }}>в сети</span>}
      </span>
    )
  }

  const rawDate = storedLastSeen ?? lastSeenAt
  const label = rawDate ? formatLastSeen(rawDate) : null

  return (
    <span className="flex items-center gap-1">
      {showLabel
        ? label && <span className="text-xs" style={{ color: '#6c8998' }}>{label}</span>
        : null
      }
    </span>
  )
}

function formatLastSeen(iso: string): string {
  const d = new Date(iso)
  const now = Date.now()
  const diff = now - d.getTime()
  if (diff < 60_000) return 'только что'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} мин. назад`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} ч. назад`
  return d.toLocaleDateString('ru-RU')
}
