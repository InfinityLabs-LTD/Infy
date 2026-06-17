import { useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'

const SWIPE_THRESHOLD = 52  // дистанция, после которой свайп засчитывается
const SWIPE_MAX = 76        // максимальное визуальное смещение

/**
 * Свайп-жест «ответить на сообщение».
 *
 * Свои сообщения тянутся влево (dir = -1), чужие — вправо (dir = +1).
 * Возвращает текущее смещение, прогресс (0..1) для индикатора и
 * обработчики указателя. Логика общая для обычных и AI-сообщений,
 * чтобы поведение и плавность анимации совпадали.
 *
 * @param dir  направление: -1 (влево) или +1 (вправо)
 * @param onReply  вызывается, когда свайп пройдён за порог
 * @param onMoveAbort  опционально: вызвать при начале жеста (например, закрыть hold-таймер)
 */
export function useSwipeReply(dir: number, onReply?: () => void, onMoveAbort?: () => void) {
  const [swipeX, setSwipeX] = useState(0)
  const start = useRef<{ x: number; y: number } | null>(null)
  const active = useRef(false)    // зафиксировали горизонтальный жест
  const locked = useRef(false)    // зафиксировали вертикальный скролл — свайп отменён
  const buzzed = useRef(false)    // виброотклик уже сработал на пороге

  function onPointerDown(e: ReactPointerEvent) {
    if (e.pointerType !== 'touch') return
    start.current = { x: e.clientX, y: e.clientY }
    active.current = false
    locked.current = false
    buzzed.current = false
  }

  function onPointerMove(e: ReactPointerEvent) {
    if (e.pointerType !== 'touch' || !start.current || locked.current) return
    const dx = e.clientX - start.current.x
    const dy = e.clientY - start.current.y

    if (!active.current) {
      const adx = Math.abs(dx)
      const ady = Math.abs(dy)
      if (adx < 6 && ady < 8) return
      // Отдаём жест списку только при явном вертикальном преобладании,
      // иначе горизонтальный свайп проигрывает скроллу у нижних сообщений.
      if (ady > adx * 1.3) { locked.current = true; return }
      active.current = true
      onMoveAbort?.()
      try { (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId) } catch {}
    }

    // Тянем только в «правильную» сторону, с лёгким сопротивлением у предела
    const dist = dx * dir
    if (dist <= 0) { setSwipeX(0); return }
    const offset = dist <= SWIPE_MAX ? dist : SWIPE_MAX + (dist - SWIPE_MAX) * 0.18
    setSwipeX(offset * dir)

    if (offset >= SWIPE_THRESHOLD && !buzzed.current) {
      buzzed.current = true
      try { navigator.vibrate?.(15) } catch {}
    } else if (offset < SWIPE_THRESHOLD) {
      buzzed.current = false
    }
  }

  // Параметр события необязателен и не используется, но объявлен, чтобы сигнатура
  // совпадала и при прямом спреде {...handlers} в JSX, и при ручном вызове
  // onPointerUp(e) (например, из onPointerCancel в MessageBubble).
  function onPointerUp(_e?: ReactPointerEvent) {
    if (active.current && Math.abs(swipeX) >= SWIPE_THRESHOLD) onReply?.()
    start.current = null
    active.current = false
    locked.current = false
    buzzed.current = false
    setSwipeX(0)
  }

  const progress = Math.min(Math.abs(swipeX) / SWIPE_THRESHOLD, 1)

  // Стиль трансформации: во время перетаскивания без перехода (следует за пальцем),
  // после отпускания — плавно «отпружинивает» обратно.
  const transformStyle: CSSProperties = {
    transform: `translateX(${swipeX}px)`,
    transition: swipeX === 0 ? 'transform 0.32s cubic-bezier(0.22, 1, 0.36, 1)' : 'none',
    willChange: 'transform',
    touchAction: 'pan-y',
  }

  return { swipeX, progress, transformStyle, handlers: { onPointerDown, onPointerMove, onPointerUp } }
}
