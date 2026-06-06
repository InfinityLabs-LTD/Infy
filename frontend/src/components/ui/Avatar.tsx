const COLORS = [
  '#2b5278', '#1e6fa6', '#1a6b4e', '#5a3e8f', '#8c4a2f', '#2d6b6b',
]

function colorFor(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return COLORS[Math.abs(hash) % COLORS.length]
}

interface AvatarProps {
  url: string | null
  nickname: string
  size?: number
  rounded?: 'full' | '2xl' | 'xl'
}

export function Avatar({ url, nickname, size = 40, rounded = 'full' }: AvatarProps) {
  const initials = nickname
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  const rClass = rounded === 'full' ? 'rounded-full' : rounded === '2xl' ? 'rounded-2xl' : 'rounded-xl'

  if (url) {
    return (
      <img src={url} alt={nickname}
        style={{ width: size, height: size, minWidth: size }}
        className={`${rClass} object-cover`}
      />
    )
  }

  return (
    <div
      style={{ width: size, height: size, minWidth: size, fontSize: size * 0.38, background: colorFor(nickname) }}
      className={`${rClass} text-white flex items-center justify-center font-semibold select-none`}
    >
      {initials}
    </div>
  )
}
