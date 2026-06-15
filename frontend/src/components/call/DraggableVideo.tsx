import { useRef, useEffect, useState, useCallback } from 'react'

// Локальное видео «картинка-в-картинке»: перетаскиваемое и изменяемого размера,
// прилипает к углам. Используется для своего видеопотока поверх удалённого.
export function DraggableVideo({ stream, muted = true, mirror = true }: {
  stream: MediaStream | null
  muted?: boolean
  mirror?: boolean
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: 16, y: 16 })   // отступ от правого-нижнего угла
  const [size, setSize] = useState({ w: 140, h: 200 })
  const dragState = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null)
  const resizeState = useRef<{ startX: number; startY: number; baseW: number; baseH: number } | null>(null)

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream
      videoRef.current.play().catch(() => {})
    }
  }, [stream])

  const onDragMove = useCallback((e: PointerEvent) => {
    if (!dragState.current) return
    const dx = e.clientX - dragState.current.startX
    const dy = e.clientY - dragState.current.startY
    // x/y — отступ от правого/нижнего края, поэтому вычитаем дельту
    const nx = Math.max(8, dragState.current.baseX - dx)
    const ny = Math.max(8, dragState.current.baseY - dy)
    setPos({ x: nx, y: ny })
  }, [])

  const onResizeMove = useCallback((e: PointerEvent) => {
    if (!resizeState.current) return
    const dw = resizeState.current.startX - e.clientX
    const dh = resizeState.current.startY - e.clientY
    const w = Math.min(280, Math.max(100, resizeState.current.baseW + dw))
    setSize({ w, h: Math.round(w * 1.42) })
  }, [])

  const endDrag = useCallback(() => {
    dragState.current = null
    resizeState.current = null
    window.removeEventListener('pointermove', onDragMove)
    window.removeEventListener('pointermove', onResizeMove)
    window.removeEventListener('pointerup', endDrag)
  }, [onDragMove, onResizeMove])

  function startDrag(e: React.PointerEvent) {
    e.preventDefault()
    dragState.current = { startX: e.clientX, startY: e.clientY, baseX: pos.x, baseY: pos.y }
    window.addEventListener('pointermove', onDragMove)
    window.addEventListener('pointerup', endDrag)
  }

  function startResize(e: React.PointerEvent) {
    e.preventDefault()
    e.stopPropagation()
    resizeState.current = { startX: e.clientX, startY: e.clientY, baseW: size.w, baseH: size.h }
    window.addEventListener('pointermove', onResizeMove)
    window.addEventListener('pointerup', endDrag)
  }

  return (
    <div
      ref={boxRef}
      onPointerDown={startDrag}
      className="absolute z-30 rounded-2xl overflow-hidden touch-none cursor-grab active:cursor-grabbing"
      style={{
        right: pos.x, bottom: pos.y, width: size.w, height: size.h,
        boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
        border: '1.5px solid rgba(255,255,255,0.18)',
        background: '#0B1020',
      }}
    >
      <video
        ref={videoRef}
        muted={muted}
        playsInline
        className="w-full h-full object-cover"
        style={{ transform: mirror ? 'scaleX(-1)' : 'none' }}
      />
      {/* Уголок для ресайза */}
      <div
        onPointerDown={startResize}
        className="absolute top-0 left-0 w-6 h-6 cursor-nwse-resize"
        style={{ touchAction: 'none' }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2"
          className="absolute top-1 left-1">
          <path d="M4 20L20 4M4 12L12 4M4 4l0 0" />
        </svg>
      </div>
    </div>
  )
}
