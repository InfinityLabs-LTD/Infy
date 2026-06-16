import { useState, useEffect } from 'react'
import {
  Mic, MicOff, Video, VideoOff, MonitorUp, PhoneOff, Volume2,
  Settings, Phone, MessageSquare, ChevronUp,
} from 'lucide-react'
import { enumerateDevices, type MediaDeviceLists } from '@/lib/webrtc'

// Круглая стеклянная кнопка управления звонком.
export function GlassButton({
  onClick, active, danger, accent, title, size = 60, children, disabled,
}: {
  onClick?: () => void
  active?: boolean      // включённое состояние (подсветка)
  danger?: boolean      // красная (завершить/отклонить)
  accent?: boolean      // фиолетовая (принять/основное действие)
  title?: string
  size?: number
  children: React.ReactNode
  disabled?: boolean
}) {
  const [hov, setHov] = useState(false)
  const bg = danger
    ? 'linear-gradient(135deg,#EF4444,#DC2626)'
    : accent
      ? 'var(--grad-own)'
      : active
        ? 'rgba(168,85,247,0.28)'
        : 'rgba(255,255,255,0.10)'
  const glow = danger
    ? '0 8px 28px rgba(239,68,68,0.45)'
    : accent
      ? 'var(--glow-primary)'
      : active
        ? '0 0 20px rgba(168,85,247,0.35)'
        : 'none'
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className="flex items-center justify-center rounded-full transition-all duration-200 active:scale-90 disabled:opacity-40 select-none"
      style={{
        width: size, height: size,
        background: bg,
        boxShadow: glow,
        backdropFilter: 'blur(16px) saturate(140%)',
        WebkitBackdropFilter: 'blur(16px) saturate(140%)',
        border: '1px solid rgba(255,255,255,0.14)',
        color: '#fff',
        transform: hov && !disabled ? 'translateY(-2px)' : 'none',
      }}
    >
      {children}
    </button>
  )
}

// Поддерживается ли программный выбор аудиовыхода (нет на iOS Safari).
const SINK_SUPPORTED = typeof document !== 'undefined'
  && 'setSinkId' in HTMLMediaElement.prototype

// Полоса управления активным звонком + меню выбора устройств.
export function ActiveControls({
  micOn, camOn, screenOn, isVideo, audioOutputId,
  onToggleMic, onToggleCam, onToggleScreen, onHangup,
  onSwitchAudio, onSwitchVideo, onSwitchOutput,
}: {
  micOn: boolean
  camOn: boolean
  screenOn: boolean
  isVideo: boolean
  audioOutputId: string
  onToggleMic: () => void
  onToggleCam: () => void
  onToggleScreen: () => void
  onHangup: () => void
  onSwitchAudio: (deviceId: string) => void
  onSwitchVideo: (deviceId: string) => void
  onSwitchOutput: (deviceId: string) => void
}) {
  const [showDevices, setShowDevices] = useState(false)
  const [devices, setDevices] = useState<MediaDeviceLists | null>(null)

  useEffect(() => {
    if (!showDevices) return
    enumerateDevices().then(setDevices).catch(() => setDevices(null))
  }, [showDevices])

  return (
    <div className="relative flex items-center justify-center gap-3 sm:gap-4 flex-wrap">
      <GlassButton onClick={onToggleMic} active={!micOn} title={micOn ? 'Выключить микрофон' : 'Включить микрофон'}>
        {micOn ? <Mic size={24} /> : <MicOff size={24} />}
      </GlassButton>

      <GlassButton onClick={onToggleCam} active={camOn} title={camOn ? 'Выключить камеру' : 'Включить камеру'}>
        {camOn ? <Video size={24} /> : <VideoOff size={24} />}
      </GlassButton>

      <GlassButton onClick={onToggleScreen} active={screenOn} title="Демонстрация экрана">
        <MonitorUp size={24} />
      </GlassButton>

      <div className="relative">
        <GlassButton onClick={() => setShowDevices(v => !v)} active={showDevices} title="Устройства">
          <Settings size={22} />
        </GlassButton>
        {showDevices && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowDevices(false)} />
            <div className="glass-pop absolute bottom-[72px] left-1/2 -translate-x-1/2 z-20 rounded-2xl p-3 w-72 text-left">
              <DeviceGroup label="Микрофон" icon={<Mic size={14} />}
                devices={devices?.audioInputs ?? []} onPick={onSwitchAudio} />
              {isVideo && (
                <DeviceGroup label="Камера" icon={<Video size={14} />}
                  devices={devices?.videoInputs ?? []} onPick={onSwitchVideo} />
              )}
              {SINK_SUPPORTED ? (
                <DeviceGroup label="Динамики" icon={<Volume2 size={14} />}
                  devices={devices?.audioOutputs ?? []} activeId={audioOutputId} onPick={onSwitchOutput} />
              ) : (
                <div>
                  <div className="flex items-center gap-1.5 px-1 mb-1 text-[11px] font-semibold uppercase tracking-wide"
                    style={{ color: 'var(--text-low)' }}>
                    <Volume2 size={14} />Динамики
                  </div>
                  <p className="px-2 py-1 text-xs" style={{ color: 'var(--text-low)' }}>
                    Выбор вывода недоступен в этом браузере. Переключение между динамиком
                    и наушниками — в настройках устройства.
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <GlassButton onClick={onHangup} danger title="Завершить звонок">
        <PhoneOff size={24} />
      </GlassButton>
    </div>
  )
}

function DeviceGroup({
  label, icon, devices, onPick, disabled, activeId,
}: {
  label: string
  icon: React.ReactNode
  devices: MediaDeviceInfo[]
  onPick: (deviceId: string) => void
  disabled?: boolean
  activeId?: string
}) {
  return (
    <div className="mb-2 last:mb-0">
      <div className="flex items-center gap-1.5 px-1 mb-1 text-[11px] font-semibold uppercase tracking-wide"
        style={{ color: 'var(--text-low)' }}>
        {icon}{label}
      </div>
      {devices.length === 0 ? (
        <p className="px-2 py-1 text-xs" style={{ color: 'var(--text-low)' }}>Нет устройств</p>
      ) : devices.map(d => {
        const active = activeId !== undefined
          && (activeId === d.deviceId || (activeId === '' && d.deviceId === 'default'))
        return (
          <button
            key={d.deviceId}
            disabled={disabled}
            onClick={() => onPick(d.deviceId)}
            className="flex items-center justify-between gap-2 w-full text-left px-2 py-1.5 rounded-lg text-xs hover:bg-white/8 transition-colors truncate disabled:opacity-40"
            style={{ color: active ? '#C084FC' : 'rgba(255,255,255,0.8)' }}
          >
            <span className="truncate">{d.label || 'Устройство'}</span>
            {active && (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </button>
        )
      })}
    </div>
  )
}

// Кнопки экрана входящего звонка.
export function IncomingControls({
  onAccept, onDecline, onMessage,
}: {
  onAccept: () => void
  onDecline: () => void
  onMessage: () => void
}) {
  return (
    <div className="flex items-end justify-center gap-10">
      <div className="flex flex-col items-center gap-2">
        <GlassButton onClick={onDecline} danger size={68} title="Отклонить">
          <PhoneOff size={28} />
        </GlassButton>
        <span className="text-xs text-white/60">Отклонить</span>
      </div>

      <div className="flex flex-col items-center gap-2">
        <GlassButton onClick={onMessage} size={52} title="Сообщением">
          <MessageSquare size={22} />
        </GlassButton>
        <span className="text-xs text-white/60">Сообщение</span>
      </div>

      <div className="flex flex-col items-center gap-2">
        <button
          onClick={onAccept}
          className="flex items-center justify-center rounded-full transition-all duration-200 active:scale-90 animate-[callPulse_1.6s_ease-in-out_infinite]"
          style={{
            width: 68, height: 68,
            background: 'linear-gradient(135deg,#22C55E,#16A34A)',
            boxShadow: '0 8px 28px rgba(34,197,94,0.5)',
            border: '1px solid rgba(255,255,255,0.18)',
            color: '#fff',
          }}
          title="Принять"
        >
          <Phone size={28} />
        </button>
        <span className="text-xs text-white/60">Принять</span>
      </div>
    </div>
  )
}

export { ChevronUp }
