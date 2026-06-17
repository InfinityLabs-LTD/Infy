import { useEffect, useRef, useState } from 'react'

interface Props {
  url: string
  durationMs?: number | null
  waveform?: number[] | null
  isOwn: boolean
}

const SPEEDS = [1, 1.5, 2] as const

export function AudioMessage({ url, durationMs, waveform, isOwn }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [speedIdx, setSpeedIdx] = useState(0)

  const speed = SPEEDS[speedIdx]
  const totalSec = durationMs ? Math.round(durationMs / 1000) : 0

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onEnded = () => { setPlaying(false); setProgress(0); setElapsed(0) }
    const onTimeUpdate = () => {
      if (!audio.duration) return
      setProgress(audio.currentTime / audio.duration)
      setElapsed(Math.floor(audio.currentTime))
    }
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('timeupdate', onTimeUpdate)
    return () => {
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('timeupdate', onTimeUpdate)
    }
  }, [])

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed
  }, [speed])

  function toggle() {
    const audio = audioRef.current
    if (!audio) return
    if (playing) audio.pause()
    else audio.play()
  }

  function seek(e: React.MouseEvent<HTMLDivElement>) {
    const audio = audioRef.current
    if (!audio?.duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = (e.clientX - rect.left) / rect.width
    audio.currentTime = ratio * audio.duration
  }

  function cycleSpeed() {
    setSpeedIdx(i => (i + 1) % SPEEDS.length)
  }

  // Плейсхолдер-дорожка той же плотности, что и реальная (≈сэмплов), чтобы
  // она занимала всю ширину и в момент отправки (pending), а не была короткой.
  const bars = waveform ?? Array(48).fill(0.45)
  const activeBars = Math.round(progress * bars.length)

  return (
    <div className="flex items-center gap-2.5 w-full" style={{ maxWidth: '100%' }}>
      <audio ref={audioRef} src={url} preload="metadata" />

      <button
        onClick={toggle}
        className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-colors"
        style={{ background: isOwn ? 'rgba(255,255,255,0.2)' : 'rgba(168,85,247,0.18)', color: isOwn ? 'white' : '#A855F7' }}
      >
        {playing ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5,3 19,12 5,21"/>
          </svg>
        )}
      </button>

      <div className="flex-1 min-w-0 flex flex-col gap-1">
        {/* Waveform */}
        <div className="flex items-center gap-px h-8 cursor-pointer overflow-hidden" onClick={seek}>
          {bars.map((amp, i) => (
            <div
              key={i}
              className="rounded-full transition-colors"
              style={{
                // Бары тянутся, заполняя всю дорожку при любом их количестве
                // (и плейсхолдер, и реальная волна одинаково «полные»).
                flex: '1 1 0',
                minWidth: 0,
                maxWidth: 3,
                height: `${Math.max(4, amp * 28)}px`,
                background: i < activeBars
                  ? (isOwn ? 'white' : '#A855F7')
                  : (isOwn ? 'rgba(255,255,255,0.35)' : 'rgba(168,85,247,0.3)'),
              }}
            />
          ))}
        </div>

        {/* Duration + speed */}
        <div className="flex items-center justify-between">
          <span className="text-xs" style={{ color: isOwn ? 'rgba(255,255,255,0.65)' : 'var(--text-low)' }}>
            {playing || elapsed > 0
              ? `${formatSec(elapsed)} / ${formatSec(totalSec)}`
              : formatSec(totalSec)}
          </span>
          {playing && (
            <button
              onClick={cycleSpeed}
              className="text-xs font-semibold px-1.5 py-0.5 rounded-md transition-colors"
              style={{
                color: isOwn ? 'rgba(255,255,255,0.9)' : '#A855F7',
                background: isOwn ? 'rgba(255,255,255,0.15)' : 'rgba(168,85,247,0.15)',
              }}
            >
              {speed}x
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function formatSec(s: number): string {
  const m = Math.floor(s / 60)
  return `${m}:${(s % 60).toString().padStart(2, '0')}`
}
