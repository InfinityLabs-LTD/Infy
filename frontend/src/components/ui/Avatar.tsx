const COLORS = [
  'linear-gradient(135deg,#7C3AED,#A855F7)',
  'linear-gradient(135deg,#6D28D9,#C084FC)',
  'linear-gradient(135deg,#4F46E5,#A855F7)',
  'linear-gradient(135deg,#9333EA,#E879F9)',
  'linear-gradient(135deg,#5B21B6,#8B5CF6)',
  'linear-gradient(135deg,#7C3AED,#EC4899)',
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
