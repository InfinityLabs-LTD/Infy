interface AvatarProps {
  url: string | null
  nickname: string
  size?: number
}

export function Avatar({ url, nickname, size = 40 }: AvatarProps) {
  const initials = nickname
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  if (url) {
    return (
      <img
        src={url}
        alt={nickname}
        style={{ width: size, height: size }}
        className="rounded-full object-cover"
      />
    )
  }

  return (
    <div
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      className="rounded-full bg-primary-600 text-white flex items-center justify-center font-semibold select-none"
    >
      {initials}
    </div>
  )
}
