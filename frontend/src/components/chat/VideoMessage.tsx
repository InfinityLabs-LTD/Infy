interface Props {
  url: string
  thumbnailUrl?: string | null
  durationMs?: number | null
}

export function VideoMessage({ url, thumbnailUrl, durationMs }: Props) {
  const duration = durationMs ? formatDuration(durationMs) : null

  return (
    <div className="relative rounded-xl overflow-hidden" style={{ maxWidth: 280 }}>
      <video
        src={url}
        poster={thumbnailUrl ?? undefined}
        controls
        playsInline
        preload="metadata"
        className="w-full rounded-xl"
        style={{ maxHeight: 200 }}
      />
      {duration && !thumbnailUrl && (
        <span className="absolute bottom-2 right-2 text-xs text-white bg-black/60 px-1.5 py-0.5 rounded">
          {duration}
        </span>
      )}
    </div>
  )
}

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000)
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}
