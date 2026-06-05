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

  const clearTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      chunksRef.current = []

      const recorder = new MediaRecorder(stream, {
        mimeType: PREFERRED_AUDIO_MIME || undefined,
      })
      recorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.start(200)  // collect in 200ms chunks
      setState('recording')
      setDuration(0)

      timerRef.current = setInterval(() => setDuration(d => d + 1), 1000)
    } catch {
      setState('idle')
    }
  }, [])

  const stop = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const recorder = recorderRef.current
      if (!recorder || recorder.state === 'inactive') { resolve(null); return }

      resolveRef.current = resolve
      clearTimer()

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: PREFERRED_AUDIO_MIME || 'audio/webm',
        })
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
    streamRef.current?.getTracks().forEach(t => t.stop())
    recorderRef.current = null
    streamRef.current = null
    chunksRef.current = []
    setState('idle')
    setDuration(0)
    resolveRef.current?.(null)
  }, [])

  return { state, duration, start, stop, cancel }
}
