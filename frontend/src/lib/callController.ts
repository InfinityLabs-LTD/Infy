// ── Контроллер звонка ────────────────────────────────────────
// Singleton, владеющий CallEngine и связывающий сигналинг (socket) с WebRTC.
// UI вызывает императивные методы; реактивное состояние живёт в useCallStore.

import { CallEngine, type Signal, type IceServer } from './webrtc'
import { getActiveSocket } from './socket'
import { callsApi, type CallMedia } from '@/api/calls'
import { useCallStore, type CallPeer } from '@/store/call'

let engine: CallEngine | null = null
let durationTimer: ReturnType<typeof setInterval> | null = null
// Буфер ICE-кандидатов, пришедших до создания движка (на стороне получателя).
let pendingSignals: Signal[] = []

// ── Сигнал вызова: синтезируем через WebAudio (без внешних файлов) ──
let ringCtx: AudioContext | null = null
let ringTimer: ReturnType<typeof setInterval> | null = null

function beep(ctx: AudioContext, freq: number, durSec: number, gain = 0.15): void {
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  g.gain.setValueAtTime(0, ctx.currentTime)
  g.gain.linearRampToValueAtTime(gain, ctx.currentTime + 0.04)
  g.gain.linearRampToValueAtTime(0, ctx.currentTime + durSec)
  osc.connect(g); g.connect(ctx.destination)
  osc.start()
  osc.stop(ctx.currentTime + durSec + 0.05)
}

function playRingtone(kind: 'incoming' | 'outgoing'): void {
  stopRingtone()
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    ringCtx = new Ctx()
    const pattern = () => {
      if (!ringCtx) return
      if (kind === 'incoming') { beep(ringCtx, 660, 0.4); setTimeout(() => ringCtx && beep(ringCtx, 550, 0.4), 500) }
      else beep(ringCtx, 440, 0.8, 0.10)   // одиночный гудок дозвона
    }
    pattern()
    ringTimer = setInterval(pattern, kind === 'incoming' ? 2000 : 3000)
  } catch { /* WebAudio недоступен — без звука */ }
}

function stopRingtone(): void {
  if (ringTimer) { clearInterval(ringTimer); ringTimer = null }
  if (ringCtx) { ringCtx.close().catch(() => {}); ringCtx = null }
}

function startDurationTimer(): void {
  stopDurationTimer()
  durationTimer = setInterval(() => useCallStore.getState().tickDuration(), 1000)
}
function stopDurationTimer(): void {
  if (durationTimer) { clearInterval(durationTimer); durationTimer = null }
}

function emit(event: string, payload: unknown): void {
  getActiveSocket()?.emit(event, payload)
}

async function fetchIceServers(): Promise<IceServer[]> {
  try {
    const res = await callsApi.getIceServers()
    return res.data.data.iceServers
  } catch {
    // Фоллбэк на публичный STUN, чтобы звонок хотя бы попытался соединиться.
    return [{ urls: 'stun:stun.l.google.com:19302' }]
  }
}

/** Создаёт движок и инициализирует локальное медиа. polite=true у получателя. */
async function buildEngine(media: CallMedia, polite: boolean): Promise<CallEngine> {
  const iceServers = await fetchIceServers()

  const eng = new CallEngine(iceServers, polite, {
    // callId читаем из живого стора — не из снимка на момент создания движка.
    onSignal: (signal) => emit('call:signal', { callId: useCallStore.getState().callId, data: signal }),
    onRemoteStream: (stream) => {
      const s = useCallStore.getState()
      s.setStreams(eng.getLocalStream(), stream)
    },
    onConnectionState: (state) => {
      const s = useCallStore.getState()
      if (state === 'connected') {
        if (s.phase !== 'active') {
          s.setPhase('active')
          stopRingtone()
          startDurationTimer()
        }
      } else if (state === 'failed') {
        emit('call:failed', { callId: s.callId })
        teardown('failed')
      }
    },
    onQuality: (q) => useCallStore.getState().setQuality(q),
  })

  await eng.initLocalMedia({ video: media === 'VIDEO' })
  // Применяем стартовое состояние камеры (в аудиозвонке трека нет — ничего)
  const st = useCallStore.getState()
  eng.setMicEnabled(st.micOn)
  eng.setCamEnabled(st.camOn)
  useCallStore.getState().setStreams(eng.getLocalStream(), eng.getRemoteStream())

  // Сливаем буфер сигналов, накопленных до создания движка.
  for (const sig of pendingSignals) await eng.handleSignal(sig)
  pendingSignals = []

  return eng
}

export const callController = {
  // ── Исходящий звонок ──────────────────────────────────────
  async startCall(chatId: string, media: CallMedia, peer: CallPeer): Promise<void> {
    const store = useCallStore.getState()
    if (store.phase !== 'idle') return   // уже в звонке

    const socket = getActiveSocket()
    if (!socket?.connected) return

    socket.emit('call:invite', { chatId, media }, async (res: { ok: boolean; callId?: string; error?: string }) => {
      if (!res?.ok || !res.callId) {
        // PEER_BUSY / YOU_BUSY / прочее — показываем краткий финальный экран
        useCallStore.getState().startOutgoing({ callId: 'failed', chatId, media, peer })
        teardown(res?.error === 'PEER_BUSY' ? 'busy' : 'failed')
        return
      }
      useCallStore.getState().startOutgoing({ callId: res.callId, chatId, media, peer })
      playRingtone('outgoing')
      try {
        engine = await buildEngine(media, /* polite */ false)
        // Инициатор инициирует negotiation сразу — onnegotiationneeded отправит offer
        // после того, как получатель примет (см. call:accepted).
      } catch (err) {
        console.warn('[call] media init failed', err)
        emit('call:cancel', { callId: res.callId })
        teardown('failed')
      }
    })
  },

  // ── Входящий: принять ─────────────────────────────────────
  async accept(): Promise<void> {
    const store = useCallStore.getState()
    if (store.phase !== 'incoming' || !store.callId) return
    const socket = getActiveSocket()
    socket?.emit('call:accept', { callId: store.callId }, async (res: { ok: boolean }) => {
      if (!res?.ok) { teardown('failed'); return }
      stopRingtone()
      useCallStore.getState().setPhase('connecting')
      try {
        engine = await buildEngine(store.media, /* polite */ true)
        // Получатель ждёт offer от инициатора (придёт через call:signal).
      } catch (err) {
        console.warn('[call] accept media failed', err)
        emit('call:hangup', { callId: store.callId })
        teardown('failed')
      }
    })
  },

  // ── Входящий: отклонить ───────────────────────────────────
  decline(): void {
    const { callId } = useCallStore.getState()
    if (callId) emit('call:decline', { callId })
    teardown('declined')
  },

  // ── Завершить / отменить ──────────────────────────────────
  hangup(): void {
    const { callId, phase } = useCallStore.getState()
    if (!callId) { teardown(null); return }
    if (phase === 'outgoing') emit('call:cancel', { callId })
    else emit('call:hangup', { callId })
    teardown(phase === 'outgoing' ? 'cancelled' : null)
  },

  // ── Микрофон / камера / экран ─────────────────────────────
  toggleMic(): void {
    const s = useCallStore.getState()
    const on = !s.micOn
    s.setMic(on); engine?.setMicEnabled(on)
    emit('call:media-state', { callId: s.callId, micOn: on })
  },

  async toggleCam(): Promise<void> {
    const s = useCallStore.getState()
    const on = !s.camOn
    if (on) await engine?.enableVideoTrack()
    engine?.setCamEnabled(on)
    s.setCam(on)
    s.bumpStreams()
    emit('call:media-state', { callId: s.callId, camOn: on })
  },

  async toggleScreen(): Promise<void> {
    const s = useCallStore.getState()
    if (!engine) return
    if (s.screenOn) {
      await engine.stopScreenShare()
      s.setScreen(false)
      emit('call:media-state', { callId: s.callId, screenOn: false })
    } else {
      try {
        await engine.startScreenShare()
        s.setScreen(true)
        emit('call:media-state', { callId: s.callId, screenOn: true })
      } catch { /* пользователь отменил выбор окна */ }
    }
    s.bumpStreams()
  },

  async switchAudioInput(deviceId: string): Promise<void> {
    await engine?.switchAudioInput(deviceId)
  },
  async switchVideoInput(deviceId: string): Promise<void> {
    await engine?.switchVideoInput(deviceId)
    useCallStore.getState().bumpStreams()
  },

  // ── Обработка сигналинг-событий от сокета ─────────────────
  onAccepted(): void {
    // Инициатор узнал, что приняли. Offer уже был отправлен движком через
    // onnegotiationneeded при addTrack (получатель буферизует его до accept).
    // Здесь только переводим UI в фазу установки соединения.
    useCallStore.getState().setPhase('connecting')
    stopRingtone()
  },

  async onSignal(data: Signal): Promise<void> {
    if (!engine) { pendingSignals.push(data); return }
    await engine.handleSignal(data)
  },

  onPeerMediaState(p: { micOn?: boolean; camOn?: boolean; screenOn?: boolean }): void {
    useCallStore.getState().setPeerMedia(p)
    useCallStore.getState().bumpStreams()
  },

  onEnded(reason: string | null): void {
    teardown(reason)
  },
}

/** Разрушает звонок: показывает финальный экран, чистит движок и таймеры. */
function teardown(reason: string | null): void {
  stopRingtone()
  stopDurationTimer()
  engine?.close()
  engine = null
  pendingSignals = []

  const store = useCallStore.getState()
  if (store.phase === 'idle') return

  store.end(reason)
  // Короткая пауза на финальный экран, затем сброс.
  setTimeout(() => {
    if (useCallStore.getState().phase === 'ended') useCallStore.getState().reset()
  }, reason === null ? 600 : 2000)
}

export { teardown as _teardownCall }
