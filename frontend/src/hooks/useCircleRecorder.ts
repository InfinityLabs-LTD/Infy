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
const CANVAS_SIZE = 400

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
  // Стрим текущей камеры (видео+аудио), отдаётся в превью и canvas
  const camStreamRef = useRef<MediaStream | null>(null)
  // Поток, который пишет рекордер: canvas-видео + аудиодорожка камеры
  const recordStreamRef = useRef<MediaStream | null>(null)
  // Скрытый <video> — источник кадров для canvas (не привязан к DOM)
  const sourceVideoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const mirrorRef = useRef(true)

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const drawLoop = useCallback(() => {
    const canvas = canvasRef.current
    const src = sourceVideoRef.current
    if (canvas && src && src.readyState >= 2) {
      const ctx = canvas.getContext('2d')
      if (ctx) {
        const vw = src.videoWidth || CANVAS_SIZE
        const vh = src.videoHeight || CANVAS_SIZE
        // object-cover: масштабируем по меньшей стороне и центрируем
        const scale = Math.max(CANVAS_SIZE / vw, CANVAS_SIZE / vh)
        const dw = vw * scale
        const dh = vh * scale
        const dx = (CANVAS_SIZE - dw) / 2
        const dy = (CANVAS_SIZE - dh) / 2
        ctx.save()
        if (mirrorRef.current) {
          ctx.translate(CANVAS_SIZE, 0)
          ctx.scale(-1, 1)
        }
        ctx.drawImage(src, dx, dy, dw, dh)
        ctx.restore()
      }
    }
    rafRef.current = requestAnimationFrame(drawLoop)
  }, [])

  const cleanup = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    if (autoStopRef.current) { clearTimeout(autoStopRef.current); autoStopRef.current = null }
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    camStreamRef.current?.getTracks().forEach(t => t.stop())
    recordStreamRef.current?.getTracks().forEach(t => t.stop())
    camStreamRef.current = null
    recordStreamRef.current = null
    if (sourceVideoRef.current) { sourceVideoRef.current.srcObject = null; sourceVideoRef.current = null }
    canvasRef.current = null
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
    mirrorRef.current = true
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: CANVAS_SIZE }, height: { ideal: CANVAS_SIZE } },
        audio: true,
      })
      camStreamRef.current = stream

      // Превью для пользователя
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.muted = true
        await videoRef.current.play().catch(() => {})
      }

      // Скрытый video-источник для canvas
      const srcVideo = document.createElement('video')
      srcVideo.muted = true
      srcVideo.playsInline = true
      srcVideo.srcObject = stream
      await srcVideo.play().catch(() => {})
      sourceVideoRef.current = srcVideo

      // Canvas + цикл отрисовки
      const canvas = document.createElement('canvas')
      canvas.width = CANVAS_SIZE
      canvas.height = CANVAS_SIZE
      canvasRef.current = canvas
      rafRef.current = requestAnimationFrame(drawLoop)

      // Поток для записи: видео из canvas + аудио из камеры
      const canvasStream = canvas.captureStream(30)
      const audioTrack = stream.getAudioTracks()[0]
      if (audioTrack) canvasStream.addTrack(audioTrack)
      recordStreamRef.current = canvasStream

      chunksRef.current = []
      const recorder = new MediaRecorder(canvasStream, { mimeType: PREFERRED_VIDEO_MIME })
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
  }, [stop, cleanup, drawLoop])

  const switchCamera = useCallback(async () => {
    if (state !== 'recording') return
    const newFacing = isFrontCamera ? 'environment' : 'user'
    try {
      // Запрашиваем новую камеру (без аудио — аудиодорожка остаётся прежней,
      // чтобы запись звука не прерывалась)
      const newCamStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: newFacing, width: { ideal: CANVAS_SIZE }, height: { ideal: CANVAS_SIZE } },
        audio: false,
      })

      // Переключаем источник кадров для canvas — рекордер продолжает писать тот же поток
      const srcVideo = sourceVideoRef.current
      if (srcVideo) {
        srcVideo.srcObject = newCamStream
        await srcVideo.play().catch(() => {})
      }
      // Превью
      if (videoRef.current) {
        videoRef.current.srcObject = newCamStream
        await videoRef.current.play().catch(() => {})
      }

      // Останавливаем только старую видеодорожку камеры; аудио сохраняем
      const oldCam = camStreamRef.current
      const keptAudio = oldCam?.getAudioTracks() ?? []
      oldCam?.getVideoTracks().forEach(t => t.stop())
      // Собираем новый cam-стрим: новое видео + прежнее аудио (для cleanup)
      const merged = new MediaStream([...newCamStream.getVideoTracks(), ...keptAudio])
      camStreamRef.current = merged

      mirrorRef.current = newFacing === 'user'
      setIsFrontCamera(f => !f)
    } catch {
      // Камера не переключилась — игнорируем
    }
  }, [isFrontCamera, state])

  const cancel = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.onstop = null
      recorderRef.current.stop()
    }
    recorderRef.current = null
    chunksRef.current = []
    cleanup()
    setState('idle')
    setError(null)
    setDuration(0)
    setIsFrontCamera(true)
    mirrorRef.current = true
  }, [cleanup])

  return { state, error, duration, isFrontCamera, videoRef, start, stop, cancel, switchCamera }
}
