import { useRef, useState, useCallback } from 'react'

export type CircleRecordState = 'idle' | 'requesting' | 'recording' | 'processing'

export interface UseCircleRecorderResult {
  state: CircleRecordState
  duration: number
  videoRef: React.RefObject<HTMLVideoElement>
  start: () => Promise<void>
  stop: () => Promise<Blob | null>
  cancel: () => void
}

const MAX_DURATION_SEC = 60

const PREFERRED_VIDEO_MIME =
  ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
    .find(m => MediaRecorder.isTypeSupported(m)) ?? 'video/webm'

export function useCircleRecorder(): UseCircleRecorderResult {
  const [state, setState] = useState<CircleRecordState>('idle')
  const [duration, setDuration] = useState(0)
  const videoRef = useRef<HTMLVideoElement>(null)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stopPromiseRef = useRef<((b: Blob | null) => void) | null>(null)

  const cleanup = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    if (autoStopRef.current) { clearTimeout(autoStopRef.current); autoStopRef.current = null }
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  const start = useCallback(async () => {
    setState('requesting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 400, height: 400 },
        audio: true,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.muted = true
        await videoRef.current.play().catch(() => {})
      }

      chunksRef.current = []
      const recorder = new MediaRecorder(stream, { mimeType: PREFERRED_VIDEO_MIME })
      recorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.start(200)
      setState('recording')
      setDuration(0)

      timerRef.current = setInterval(() => setDuration(d => d + 1), 1000)
      autoStopRef.current = setTimeout(() => {
        stop()
      }, MAX_DURATION_SEC * 1000)
    } catch {
      setState('idle')
      cleanup()
    }
  }, [])

  const stop = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const recorder = recorderRef.current
      if (!recorder || recorder.state === 'inactive') {
        cleanup()
        setState('idle')
        resolve(null)
        return
      }

      stopPromiseRef.current = resolve
      setState('processing')

      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
      if (autoStopRef.current) { clearTimeout(autoStopRef.current); autoStopRef.current = null }

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: PREFERRED_VIDEO_MIME })
        cleanup()
        recorderRef.current = null
        setState('idle')
        setDuration(0)
        resolve(blob)
      }

      recorder.stop()
    })
  }, [cleanup])

  const cancel = useCallback(() => {
    recorderRef.current?.stop()
    recorderRef.current = null
    chunksRef.current = []
    cleanup()
    setState('idle')
    setDuration(0)
    stopPromiseRef.current?.(null)
  }, [cleanup])

  return { state, duration, videoRef, start, stop, cancel }
}
