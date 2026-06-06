const COLORS = [
  'bg-primary-600', 'bg-violet-600', 'bg-indigo-600',
  'bg-purple-700', 'bg-fuchsia-600', 'bg-pink-600',
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
      style={{ width: size, height: size, minWidth: size, fontSize: size * 0.38 }}
      className={`${rClass} ${colorFor(nickname)} text-white flex items-center justify-center font-semibold select-none`}
    >
      {initials}
    </div>
  )
}
