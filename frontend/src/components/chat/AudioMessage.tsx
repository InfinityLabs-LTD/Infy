import { useEffect, useRef, useState } from 'react'

interface Props {
  url: string
  durationMs?: number | null
  waveform?: number[] | null
  isOwn: boolean
}

export function AudioMessage({ url, durationMs, waveform, isOwn }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)   // 0-1
  const [elapsed, setElapsed] = useState(0)

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

  const bars = waveform ?? Array(40).fill(0.5)
  const activeBars = Math.round(progress * bars.length)

  return (
    <div className="flex items-center gap-2.5" style={{ minWidth: 200, maxWidth: 260 }}>
      <audio ref={audioRef} src={url} preload="metadata" />

      <button
        onClick={toggle}
        className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
          isOwn ? 'bg-white/20 hover:bg-white/30 text-white' : 'bg-primary-100 hover:bg-primary-200 text-primary-600'
        }`}
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

      <div className="flex-1 flex flex-col gap-1">
        {/* Waveform */}
        <div
          className="flex items-center gap-px h-8 cursor-pointer"
          onClick={seek}
        >
          {bars.map((amp, i) => (
            <div
              key={i}
              className={`rounded-full transition-colors ${
                i < activeBars
                  ? (isOwn ? 'bg-white' : 'bg-primary-500')
                  : (isOwn ? 'bg-white/40' : 'bg-gray-300')
              }`}
              style={{
                width: 2,
                height: `${Math.max(4, amp * 28)}px`,
                flex: '0 0 auto',
              }}
            />
          ))}
        </div>

        {/* Duration */}
        <div className={`text-xs ${isOwn ? 'text-white/70' : 'text-gray-400'}`}>
          {playing || elapsed > 0
            ? `${formatSec(elapsed)} / ${formatSec(totalSec)}`
            : formatSec(totalSec)}
        </div>
      </div>
    </div>
  )
}

function formatSec(s: number): string {
  const m = Math.floor(s / 60)
  return `${m}:${(s % 60).toString().padStart(2, '0')}`
}
