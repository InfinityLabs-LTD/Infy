import { useRef, useState, useCallback } from 'react'

export type CircleRecordState = 'idle' | 'requesting' | 'recording' | 'processing' | 'error'

export interface UseCircleRecorderResult {
  state: CircleRecordState
  error: string | null
  duration: number
  isFrontCamera: boolean
  videoRef: React.RefObject<HTMLVideoElement>
  start: () => Promise<void>
  stop: () => Promise<Blob | null>
  cancel: () => void
  switchCamera: () => Promise<void>
}

const MAX_DURATION_SEC = 60

const PREFERRED_VIDEO_MIME =
  ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
    .find(m => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) ?? 'video/webm'

export function useCircleRecorder(): UseCircleRecorderResult {
  const [state, setState] = useState<CircleRecordState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [duration, setDuration] = useState(0)
  const [isFrontCamera, setIsFrontCamera] = useState(true)
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

  const start = useCallback(async () => {
    setError(null)
    setState('requesting')
    setIsFrontCamera(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 400 }, height: { ideal: 400 } },
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
      autoStopRef.current = setTimeout(() => { stop() }, MAX_DURATION_SEC * 1000)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('Permission') || msg.includes('NotAllowed') || msg.includes('denied')) {
        setError('Разрешите доступ к камере и микрофону в настройках браузера')
      } else if (msg.includes('NotFound') || msg.includes('Requested device')) {
        setError('Камера не найдена. Подключите камеру и повторите попытку')
      } else {
        setError('Не удалось запустить запись. Попробуйте ещё раз')
      }
      setState('error')
      cleanup()
    }
  }, [stop, cleanup])

  const switchCamera = useCallback(async () => {
    if (!streamRef.current || state !== 'recording') return
    const newFacing = isFrontCamera ? 'environment' : 'user'
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: newFacing, width: { ideal: 400 }, height: { ideal: 400 } },
        audio: true,
      })

      // Останавливаем старый рекордер без resolve — заменим его ниже
      const oldRecorder = recorderRef.current
      if (oldRecorder && oldRecorder.state !== 'inactive') {
        oldRecorder.ondataavailable = null
        oldRecorder.onstop = null
        oldRecorder.stop()
      }

      // Останавливаем старый стрим
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = newStream

      if (videoRef.current) {
        videoRef.current.srcObject = newStream
        await videoRef.current.play().catch(() => {})
      }

      // Пересоздаём MediaRecorder на новом стриме, сохраняем накопленные чанки
      const recorder = new MediaRecorder(newStream, { mimeType: PREFERRED_VIDEO_MIME })
      recorderRef.current = recorder
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.start(200)

      setIsFrontCamera(f => !f)
    } catch {
      // Камера не переключилась — игнорируем
    }
  }, [isFrontCamera, state])

  const cancel = useCallback(() => {
    recorderRef.current?.stop()
    recorderRef.current = null
    chunksRef.current = []
    cleanup()
    setState('idle')
    setError(null)
    setDuration(0)
    setIsFrontCamera(true)
    stopPromiseRef.current?.(null)
  }, [cleanup])

  return { state, error, duration, isFrontCamera, videoRef, start, stop, cancel, switchCamera }
}
