export function TypingIndicator({ names }: { names: string[] }) {
  if (names.length === 0) return null

  const label =
    names.length === 1
      ? `${names[0]} печатает`
      : `${names.slice(0, 2).join(', ')} печатают`

  return (
    <div className="flex items-center gap-2 px-4 py-1 text-xs" style={{ color: '#6c8998' }}>
      <span className="flex gap-0.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-1.5 h-1.5 rounded-full typing-dot"
            style={{ background: '#6c8998', animationDelay: `${i * 150}ms` }}
          />
        ))}
      </span>
      {label}…
    </div>
  )
}
