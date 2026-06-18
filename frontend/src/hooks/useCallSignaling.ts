import { useEffect } from 'react'
import { getActiveSocket } from '@/lib/socket'
import { callController } from '@/lib/callController'
import { useCallStore, type CallPeer } from '@/store/call'
import { useAuthStore } from '@/store/auth'
import { useChatStore } from '@/store/chat'
import type { CallMedia } from '@/api/calls'
import type { Signal } from '@/lib/webrtc'

// Подключает обработчики сигналинга звонков к активному сокету.
// Монтируется один раз на уровне приложения (рядом с CallOverlay).
// Завязан на socketReady — сокет создаётся асинхронно в useSocket(), поэтому
// навешиваемся ТОЛЬКО когда соединение готово, и перенавешиваемся при реконнекте.
export function useCallSignaling(): void {
  const accessToken = useAuthStore((s) => s.accessToken)
  const socketReady = useChatStore((s) => s.socketReady)

  useEffect(() => {
    if (!accessToken || !socketReady) return
    const socket = getActiveSocket()
    if (!socket) return

    const onIncoming = (p: { callId: string; chatId: string; media: CallMedia; from: CallPeer }) => {
      const store = useCallStore.getState()
      // Уже в звонке — игнорируем (сервер шлёт busy, но подстрахуемся).
      if (store.phase !== 'idle') return
      store.receiveIncoming({ callId: p.callId, chatId: p.chatId, media: p.media, peer: p.from })
      // Браузерное уведомление, если вкладка свёрнута.
      const me = useAuthStore.getState().user
      if (document.hidden && Notification.permission === 'granted' && (me?.notifyPopup ?? true)) {
        const body = p.media === 'VIDEO' ? '📹 Входящий видеозвонок' : '📞 Входящий звонок'
        new Notification(p.from.nickname, {
          body, icon: p.from.avatarUrl ?? '/logo.png', tag: 'call',
          silent: !(me?.notifySound ?? true),
        } as NotificationOptions)
      }
    }

    const onAccepted = () => callController.onAccepted()
    const onSignal = (p: { data: Signal }) => { void callController.onSignal(p.data) }
    const onMediaState = (p: { micOn?: boolean; camOn?: boolean; screenOn?: boolean }) =>
      callController.onPeerMediaState(p)
    const onEnded = (p: { reason: string }) => callController.onEnded(p.reason ?? null)
    const onTakenElsewhere = () => {
      // Звонок принят на другом устройстве — сбрасываем экран входящего здесь.
      const s = useCallStore.getState()
      if (s.phase === 'incoming') s.reset()
    }
    const onPeerBusy = () => { /* startCall ack уже обработал — заглушка для полноты */ }

    socket.on('call:incoming', onIncoming)
    socket.on('call:accepted', onAccepted)
    socket.on('call:signal', onSignal)
    socket.on('call:media-state', onMediaState)
    socket.on('call:ended', onEnded)
    socket.on('call:taken-elsewhere', onTakenElsewhere)
    socket.on('call:peer-busy', onPeerBusy)

    return () => {
      socket.off('call:incoming', onIncoming)
      socket.off('call:accepted', onAccepted)
      socket.off('call:signal', onSignal)
      socket.off('call:media-state', onMediaState)
      socket.off('call:ended', onEnded)
      socket.off('call:taken-elsewhere', onTakenElsewhere)
      socket.off('call:peer-busy', onPeerBusy)
    }
  }, [accessToken, socketReady])
}
