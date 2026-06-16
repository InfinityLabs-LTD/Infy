import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Avatar } from '@/components/ui/Avatar'
import { useCallStore } from '@/store/call'
import { callController } from '@/lib/callController'
import { ActiveControls, IncomingControls } from './CallControls'
import { QualityBadge } from './QualityBadge'
import { DraggableVideo } from './DraggableVideo'

function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  const h = Math.floor(m / 60)
  if (h > 0) return `${h}:${String(m % 60).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function statusText(phase: string, isCaller: boolean, endedReason: string | null): string {
  switch (phase) {
    case 'outgoing': return 'Вызов…'
    case 'incoming': return isCaller ? '' : 'Входящий звонок'
    case 'connecting': return 'Соединение…'
    case 'active': return ''
    case 'ended':
      if (endedReason === 'declined') return 'Звонок отклонён'
      if (endedReason === 'busy') return 'Абонент занят'
      if (endedReason === 'cancelled') return 'Звонок отменён'
      if (endedReason === 'missed') return 'Нет ответа'
      if (endedReason === 'failed') return 'Не удалось соединиться'
      return 'Звонок завершён'
    default: return ''
  }
}

export function CallOverlay() {
  const navigate = useNavigate()
  const s = useCallStore()
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const remoteAudioRef = useRef<HTMLAudioElement>(null)

  const isVideo = s.media === 'VIDEO'
  // Показываем удалённое видео, если в удалённом потоке реально есть живой
  // видеотрек (камера ИЛИ демонстрация экрана) — независимо от типа звонка.
  // Демонстрацию экрана можно включить и в аудиозвонке, поэтому на isVideo не завязываемся.
  const remoteHasVideo = !!s.remoteStream
    && s.remoteStream.getVideoTracks().some(t => t.readyState === 'live')
  const showRemoteVideo = remoteHasVideo && (s.peerCamOn || s.peerScreenOn || isVideo)

  // Привязка удалённого потока к media-элементам.
  useEffect(() => {
    if (remoteVideoRef.current && s.remoteStream) {
      remoteVideoRef.current.srcObject = s.remoteStream
      remoteVideoRef.current.play().catch(() => {})
    }
    if (remoteAudioRef.current && s.remoteStream) {
      remoteAudioRef.current.srcObject = s.remoteStream
      remoteAudioRef.current.play().catch(() => {})
    }
  }, [s.remoteStream, s.streamVersion, showRemoteVideo])

  if (s.phase === 'idle') return null

  const showSelfPip = isVideo && s.camOn && !!s.localStream && (s.phase === 'active' || s.phase === 'connecting')
  const showControls = s.phase === 'active' || s.phase === 'connecting' || s.phase === 'outgoing'

  return (
    <AnimatePresence>
      <motion.div
        key="call-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        className="fixed inset-0 z-[100] flex flex-col"
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {/* Фон: удалённое видео на весь экран ИЛИ брендовый glow-фон */}
        {showRemoteVideo ? (
          <video
            ref={remoteVideoRef}
            autoPlay playsInline
            className="absolute inset-0 w-full h-full object-cover"
            style={{ background: '#05070F' }}
          />
        ) : (
          <div className="absolute inset-0" style={{
            background: `
              radial-gradient(1000px 700px at 50% 20%, rgba(124,58,237,0.35), transparent 60%),
              radial-gradient(800px 600px at 80% 90%, rgba(168,85,247,0.22), transparent 55%),
              linear-gradient(160deg,#070B1D 0%,#0B1020 60%,#05070F 100%)`,
          }} />
        )}

        {/* Затемнение поверх видео для читаемости элементов */}
        {showRemoteVideo && (
          <div className="absolute inset-0" style={{
            background: 'linear-gradient(180deg, rgba(0,0,0,0.45) 0%, transparent 25%, transparent 60%, rgba(0,0,0,0.55) 100%)',
          }} />
        )}

        {/* Удалённый звук всегда подключён */}
        <audio ref={remoteAudioRef} autoPlay />

        {/* Перетаскиваемое локальное видео */}
        {showSelfPip && <DraggableVideo stream={s.localStream} />}

        {/* ── Верх: качество + имя ── */}
        <div className="relative z-10 flex flex-col items-center pt-6 px-4">
          {s.phase === 'active' && (
            <div className="mb-3"><QualityBadge quality={s.quality} /></div>
          )}
        </div>

        {/* ── Центр: аватар / имя / статус ── */}
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 text-center">
          {!showRemoteVideo && (
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
              className="relative mb-6"
            >
              {/* Пульсирующий ореол при дозвоне */}
              {(s.phase === 'outgoing' || s.phase === 'incoming') && (
                <span className="absolute inset-0 rounded-full animate-[callRipple_2s_ease-out_infinite]"
                  style={{ boxShadow: '0 0 0 0 rgba(168,85,247,0.5)' }} />
              )}
              <div className="rounded-full p-1" style={{
                background: 'var(--grad-own)',
                boxShadow: '0 0 60px rgba(124,58,237,0.55)',
              }}>
                <Avatar url={s.peer?.avatarUrl ?? null} nickname={s.peer?.nickname ?? '?'} size={128} />
              </div>
            </motion.div>
          )}

          <h2 className="text-2xl font-semibold text-white drop-shadow-lg">
            {s.peer?.nickname ?? '—'}
          </h2>

          <p className="mt-2 text-[15px] text-white/70 min-h-[22px]">
            {s.phase === 'active'
              ? fmtDuration(s.durationSec)
              : statusText(s.phase, s.isCaller, s.endedReason)}
          </p>

          {/* Подпись типа звонка на входящем */}
          {s.phase === 'incoming' && (
            <p className="mt-1 text-sm text-white/50">
              {isVideo ? '📹 Видеозвонок Infy' : '📞 Аудиозвонок Infy'}
            </p>
          )}

          {/* Индикатор «собеседник без звука» */}
          {s.phase === 'active' && !s.peerMicOn && (
            <p className="mt-3 text-xs text-white/50">Микрофон собеседника выключен</p>
          )}
          {s.phase === 'active' && s.peerScreenOn && (
            <p className="mt-3 text-xs" style={{ color: '#C084FC' }}>Идёт демонстрация экрана</p>
          )}
        </div>

        {/* ── Низ: контролы ── */}
        <div className="relative z-10 pb-10 px-4">
          {s.phase === 'incoming' ? (
            <IncomingControls
              onAccept={() => callController.accept()}
              onDecline={() => callController.decline()}
              onMessage={() => {
                callController.decline()
                if (s.peer) navigate(`/chat/${s.peer.id}`)
              }}
            />
          ) : showControls ? (
            <ActiveControls
              micOn={s.micOn}
              camOn={s.camOn}
              screenOn={s.screenOn}
              isVideo={isVideo}
              onToggleMic={() => callController.toggleMic()}
              onToggleCam={() => void callController.toggleCam()}
              onToggleScreen={() => void callController.toggleScreen()}
              onHangup={() => callController.hangup()}
              onSwitchAudio={(id) => void callController.switchAudioInput(id)}
              onSwitchVideo={(id) => void callController.switchVideoInput(id)}
            />
          ) : null}
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
