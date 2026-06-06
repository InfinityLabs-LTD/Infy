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
        <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
        {showLabel && <span className="text-xs text-green-600">в сети</span>}
      </span>
    )
  }

  const rawDate = storedLastSeen ?? lastSeenAt
  const label = rawDate ? formatLastSeen(rawDate) : null

  return (
    <span className="flex items-center gap-1">
      <span className="w-2 h-2 rounded-full bg-gray-300 shrink-0" />
      {showLabel && label && <span className="text-xs text-gray-400">{label}</span>}
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
