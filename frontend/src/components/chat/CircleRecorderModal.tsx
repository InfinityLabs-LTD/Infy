import { useEffect } from 'react'
import { useCircleRecorder } from '@/hooks/useCircleRecorder'
import { Spinner } from '@/components/ui/Spinner'

interface Props {
  onSend: (blob: Blob) => void
  onClose: () => void
}

export function CircleRecorderModal({ onSend, onClose }: Props) {
  const { state, error, duration, videoRef, start, stop, cancel } = useCircleRecorder()

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
  const circumference = 2 * Math.PI * 116

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center gap-6">
      {state === 'error' ? (
        <div className="flex flex-col items-center gap-4 text-center px-8 max-w-xs">
          <div className="w-16 h-16 rounded-2xl bg-red-500/20 flex items-center justify-center">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <div>
            <p className="text-white font-semibold mb-1">Ошибка камеры</p>
            <p className="text-white/50 text-sm leading-relaxed">{error}</p>
          </div>
          <div className="flex gap-3">
            <button onClick={handleCancel}
              className="px-5 py-2 rounded-xl bg-white/10 text-white text-sm hover:bg-white/20 transition-colors">
              Закрыть
            </button>
            <button onClick={() => start()}
              className="px-5 py-2 rounded-xl bg-primary-600 text-white text-sm hover:bg-primary-500 transition-colors">
              Повторить
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Video preview circle */}
          <div className="relative" style={{ width: 240, height: 240 }}>
            <video ref={videoRef} muted playsInline
              className="absolute inset-0 w-full h-full object-cover rounded-full"
            />

            {/* Static ring */}
            <svg className="absolute inset-0" width={240} height={240} viewBox="0 0 240 240">
              <circle cx={120} cy={120} r={118} fill="none" stroke="white" strokeWidth="2" strokeOpacity="0.12"/>
            </svg>

            {/* Animated progress ring */}
            {state === 'recording' && (
              <svg className="absolute inset-0 -rotate-90" width={240} height={240} viewBox="0 0 240 240">
                <defs>
                  <linearGradient id="ring-grad" x1="1" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#a78bfa"/>
                    <stop offset="100%" stopColor="#7c3aed"/>
                  </linearGradient>
                </defs>
                <circle cx={120} cy={120} r={116} fill="none"
                  stroke="url(#ring-grad)" strokeWidth="4"
                  strokeDasharray={circumference}
                  strokeDashoffset={circumference * (1 - pct / 100)}
                  strokeLinecap="round"
                  style={{ transition: 'stroke-dashoffset 1s linear' }}
                />
              </svg>
            )}

            {(state === 'requesting' || state === 'processing') && (
              <div className="absolute inset-0 rounded-full bg-black/60 flex flex-col items-center justify-center gap-2">
                <Spinner size={32} />
                <p className="text-white/60 text-xs">
                  {state === 'requesting' ? 'Запрос камеры…' : 'Обработка…'}
                </p>
              </div>
            )}

            {state === 'recording' && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-black/50 px-3 py-1 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse"/>
                <span className="text-white text-xs font-mono">
                  {Math.floor(duration / 60)}:{String(duration % 60).padStart(2, '0')}
                </span>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="flex gap-6 items-center">
            <button onClick={handleCancel}
              className="w-12 h-12 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 active:scale-95 transition-all">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>

            <button onClick={handleSend}
              disabled={state !== 'recording' || duration < 1}
              className="w-16 h-16 rounded-full bg-primary-600 text-white flex items-center justify-center disabled:opacity-30 hover:bg-primary-500 hover:scale-105 active:scale-95 transition-all shadow-lg">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>

          <p className="text-white/25 text-xs">
            {state === 'requesting' && 'Разрешите доступ к камере'}
            {state === 'recording' && 'Максимум 60 секунд'}
            {state === 'processing' && 'Сохранение…'}
          </p>
        </>
      )}
    </div>
  )
}
