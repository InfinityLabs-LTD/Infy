import { useRef, useState, useCallback } from 'react'

export type RecordingState = 'idle' | 'recording' | 'paused'

export interface UseMediaRecorderResult {
  state: RecordingState
  duration: number          // seconds
  start: () => Promise<void>
  stop: () => Promise<Blob | null>
  cancel: () => void
}

const PREFERRED_AUDIO_MIME =
  ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg']
    .find(m => MediaRecorder.isTypeSupported(m)) ?? ''

export function useMediaRecorder(): UseMediaRecorderResult {
  const [state, setState] = useState<RecordingState>('idle')
  const [duration, setDuration] = useState(0)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const resolveRef = useRef<((blob: Blob | null) => void) | null>(null)
  const startPromiseRef = useRef<Promise<void> | null>(null)

  const clearTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }

  // Получить стрим — переиспользуем существующий чтобы не запрашивать разрешение повторно
  const ensureStream = useCallback(async (): Promise<MediaStream | null> => {
    if (streamRef.current?.active) return streamRef.current
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      return stream
    } catch {
      return null
    }
  }, [])

  const start = useCallback(() => {
    const promise = (async () => {
      const stream = await ensureStream()
      if (!stream) { setState('idle'); return }

      chunksRef.current = []
      const recorder = new MediaRecorder(stream, {
        mimeType: PREFERRED_AUDIO_MIME || undefined,
      })
      recorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.start(200)
      setState('recording')
      setDuration(0)
      timerRef.current = setInterval(() => setDuration(d => d + 1), 1000)
    })()
    startPromiseRef.current = promise
    promise.finally(() => { startPromiseRef.current = null })
    return promise
  }, [ensureStream])

  const stop = useCallback(async (): Promise<Blob | null> => {
    // Ждём завершения start() если он ещё выполняется
    if (startPromiseRef.current) await startPromiseRef.current

    return new Promise((resolve) => {
      const recorder = recorderRef.current
      if (!recorder || recorder.state === 'inactive') { resolve(null); return }

      resolveRef.current = resolve
      clearTimer()

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: PREFERRED_AUDIO_MIME || 'audio/webm',
        })
        // Останавливаем трек чтобы браузер убрал индикатор микрофона.
        // При следующей записи ensureStream() запросит стрим заново — разрешение
        // браузер помнит и больше не спрашивает.
        streamRef.current?.getTracks().forEach(t => t.stop())
        streamRef.current = null
        recorderRef.current = null
        setState('idle')
        setDuration(0)
        resolve(blob)
      }

      recorder.stop()
    })
  }, [])

  const cancel = useCallback(() => {
    clearTimer()
    recorderRef.current?.stop()
    recorderRef.current = null
    chunksRef.current = []
    setState('idle')
    setDuration(0)
    resolveRef.current?.(null)
  }, [])

  // Освобождаем стрим только при размонтировании компонента
  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }, [])

  return { state, duration, start, stop, cancel, releaseStream } as UseMediaRecorderResult & { releaseStream: () => void }
}
