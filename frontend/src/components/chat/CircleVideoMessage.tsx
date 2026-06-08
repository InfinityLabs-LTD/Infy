import { useRef, useState } from 'react'

interface Props {
  url: string
  thumbnailUrl?: string | null
  durationMs?: number | null
  mirrored?: boolean
}

const SPEEDS = [1, 1.5, 2] as const

export function CircleVideoMessage({ url, thumbnailUrl, durationMs, mirrored = true }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [speedIdx, setSpeedIdx] = useState(0)
  const SIZE = 180

  const speed = SPEEDS[speedIdx]

  function toggle() {
    const v = videoRef.current
    if (!v) return
    if (playing) { v.pause(); setPlaying(false) }
    else { v.playbackRate = speed; v.play(); setPlaying(true) }
  }

  function onTimeUpdate() {
    const v = videoRef.current
    if (!v || !v.duration) return
    setProgress(v.currentTime / v.duration)
  }

  function onEnded() {
    setPlaying(false)
    setProgress(0)
    const v = videoRef.current
    if (v) v.currentTime = 0
  }

  function cycleSpeed(e: React.MouseEvent) {
    e.stopPropagation()
    const nextIdx = (speedIdx + 1) % SPEEDS.length
    setSpeedIdx(nextIdx)
    if (videoRef.current) videoRef.current.playbackRate = SPEEDS[nextIdx]
  }

  const radius = SIZE / 2 - 3
  const circumference = 2 * Math.PI * radius
  const strokeDash = circumference * progress

  return (
    <div
      className="relative cursor-pointer select-none"
      style={{ width: SIZE, height: SIZE }}
      onClick={toggle}
    >
      <video
        ref={videoRef}
        src={url}
        poster={thumbnailUrl ?? undefined}
        playsInline
        preload="metadata"
        onTimeUpdate={onTimeUpdate}
        onEnded={onEnded}
        className="absolute inset-0 w-full h-full object-cover"
        style={{ borderRadius: '50%', transform: mirrored ? 'scaleX(-1)' : 'none' }}
      />

      {/* Progress ring */}
      {playing && (
        <svg className="absolute inset-0 -rotate-90" width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          <circle cx={SIZE/2} cy={SIZE/2} r={radius} fill="none"
            stroke="white" strokeWidth="3" strokeOpacity="0.5"
            strokeDasharray={circumference}
            strokeDashoffset={circumference - strokeDash}
            strokeLinecap="round"
          />
        </svg>
      )}

      {/* Speed button while playing */}
      {playing && (
        <button
          onClick={cycleSpeed}
          className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs font-bold px-2 py-0.5 rounded-full"
          style={{ background: 'rgba(0,0,0,0.55)', color: 'white', backdropFilter: 'blur(4px)' }}>
          {speed}x
        </button>
      )}

      {/* Play overlay */}
      {!playing && (
        <div className="absolute inset-0 rounded-full flex items-center justify-center bg-black/20">
          <div className="w-12 h-12 rounded-full bg-black/50 flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
              <polygon points="5,3 19,12 5,21"/>
            </svg>
          </div>
          {durationMs && (
            <span className="absolute bottom-3 right-3 text-xs text-white bg-black/50 px-1.5 py-0.5 rounded">
              {formatDuration(durationMs)}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000)
  const m = Math.floor(s / 60)
  return `${m}:${(s % 60).toString().padStart(2, '0')}`
}
