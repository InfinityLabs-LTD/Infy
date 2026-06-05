import { useEffect } from 'react'
import { useCircleRecorder } from '@/hooks/useCircleRecorder'
import { Spinner } from '@/components/ui/Spinner'

interface Props {
  onSend: (blob: Blob) => void
  onClose: () => void
}

export function CircleRecorderModal({ onSend, onClose }: Props) {
  const { state, duration, videoRef, start, stop, cancel } = useCircleRecorder()

  useEffect(() => {
    start()
    return () => { cancel() }
  }, [])

  async function handleSend() {
    const blob = await stop()
    if (blob && blob.size > 0) onSend(blob)
    else onClose()
  }

  function handleCancel() {
    cancel()
    onClose()
  }

  const pct = Math.min(100, (duration / 60) * 100)

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-center gap-6">
      {/* Preview */}
      <div className="relative" style={{ width: 240, height: 240 }}>
        <video
          ref={videoRef}
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
          style={{ borderRadius: '50%' }}
        />

        {/* Progress ring */}
        {state === 'recording' && (
          <svg
            className="absolute inset-0 -rotate-90"
            width={240}
            height={240}
            viewBox="0 0 240 240"
          >
            <circle cx={120} cy={120} r={116} fill="none" stroke="white" strokeWidth="4"
              strokeOpacity="0.3" strokeDasharray={2 * Math.PI * 116}
            />
            <circle cx={120} cy={120} r={116} fill="none" stroke="white" strokeWidth="4"
              strokeDasharray={2 * Math.PI * 116}
              strokeDashoffset={2 * Math.PI * 116 * (1 - pct / 100)}
              strokeLinecap="round"
            />
          </svg>
        )}

        {(state === 'requesting' || state === 'processing') && (
          <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
            <Spinner size={36} />
          </div>
        )}
      </div>

      {/* Duration */}
      {state === 'recording' && (
        <p className="text-white text-lg font-mono">
          {Math.floor(duration / 60)}:{(duration % 60).toString().padStart(2, '0')} / 1:00
        </p>
      )}

      {/* Controls */}
      <div className="flex gap-8 items-center">
        <button
          onClick={handleCancel}
          className="w-14 h-14 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        <button
          onClick={handleSend}
          disabled={state !== 'recording' || duration < 1}
          className="w-16 h-16 rounded-full bg-primary-600 text-white flex items-center justify-center disabled:opacity-40 hover:bg-primary-700 transition shadow-lg"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </div>
    </div>
  )
}
