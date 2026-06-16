// ── WebRTC-движок для звонков 1:1 (mesh P2P) ────────────────
// Инкапсулирует RTCPeerConnection, локальные медиапотоки, perfect-negotiation,
// демонстрацию экрана, переключение устройств и сбор статистики качества.
// Сигналинг (обмен SDP/ICE) делегируется наружу через onSignal-колбэк.

export type IceServer = { urls: string | string[]; username?: string; credential?: string }

export interface ConnectionQuality {
  level: 'good' | 'medium' | 'poor'
  rttMs: number | null          // round-trip time
  packetLossPct: number         // % потерянных пакетов (исходящих)
  bitrateKbps: number           // текущий битрейт (видео+аудио, исходящий)
}

// Сигнал, которым обмениваются пиры. Сервер его не интерпретирует.
export type Signal =
  | { kind: 'sdp'; description: RTCSessionDescriptionInit }
  | { kind: 'ice'; candidate: RTCIceCandidateInit }

export interface RtcCallbacks {
  // Локальный сигнал → отправить второму пиру через сокет.
  onSignal: (signal: Signal) => void
  // Удалённый медиапоток получен/обновлён.
  onRemoteStream: (stream: MediaStream) => void
  // Изменилось состояние соединения.
  onConnectionState: (state: RTCPeerConnectionState) => void
  // Периодический отчёт о качестве (раз в ~2 сек).
  onQuality?: (q: ConnectionQuality) => void
}

export interface MediaConstraintsOptions {
  video: boolean
  audioDeviceId?: string
  videoDeviceId?: string
}

// Аудио всегда с шумоподавлением / эхоподавлением / автоусилением.
function audioConstraints(deviceId?: string): MediaTrackConstraints {
  return {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
  }
}

function videoConstraints(deviceId?: string): MediaTrackConstraints {
  return {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30 },
    facingMode: 'user',
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
  }
}

export class CallEngine {
  private pc: RTCPeerConnection
  private localStream: MediaStream | null = null
  private screenStream: MediaStream | null = null
  private remoteStream = new MediaStream()
  private statsTimer: ReturnType<typeof setInterval> | null = null

  // Perfect negotiation: вежливый пир уступает при коллизии offer'ов.
  // Инициатор звонка = polite=false, получатель = polite=true.
  private polite: boolean
  private makingOffer = false
  private ignoreOffer = false

  // Для расчёта дельт статистики между замерами.
  private lastBytesSent = 0
  private lastStatsTs = 0

  constructor(iceServers: IceServer[], polite: boolean, private cb: RtcCallbacks) {
    this.polite = polite
    this.pc = new RTCPeerConnection({
      iceServers,
      // Сначала пробуем прямое P2P; TURN-relay как fallback задан в iceServers.
      iceCandidatePoolSize: 4,
      bundlePolicy: 'max-bundle',
    })
    this.wireConnection()
  }

  // Удалось ли получить видеотрек при инициализации (false → видео недоступно).
  videoAvailable = false

  // ── Получение локального медиа ──────────────────────────────
  // Если видео запрошено, но недоступно (нет камеры / отказ в доступе),
  // НЕ роняем звонок целиком — откатываемся на аудио. Без микрофона звонок
  // невозможен, поэтому ошибка аудио пробрасывается.
  async initLocalMedia(opts: MediaConstraintsOptions): Promise<MediaStream> {
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints(opts.audioDeviceId),
        video: opts.video ? videoConstraints(opts.videoDeviceId) : false,
      })
    } catch (err) {
      if (opts.video) {
        // Повтор только с аудио — частый случай: микрофон есть, камеры нет/занята.
        stream = await navigator.mediaDevices.getUserMedia({
          audio: audioConstraints(opts.audioDeviceId),
          video: false,
        })
      } else {
        throw err
      }
    }
    this.localStream = stream
    this.videoAvailable = stream.getVideoTracks().length > 0
    for (const track of stream.getTracks()) {
      this.pc.addTrack(track, stream)
    }
    return stream
  }

  getLocalStream(): MediaStream | null { return this.localStream }
  getRemoteStream(): MediaStream { return this.remoteStream }

  // ── Установка / приём соединения (perfect negotiation) ──────
  private wireConnection(): void {
    this.pc.onicecandidate = ({ candidate }) => {
      if (candidate) this.cb.onSignal({ kind: 'ice', candidate: candidate.toJSON() })
    }

    this.pc.ontrack = ({ track, streams }) => {
      // Складываем удалённые треки в один MediaStream.
      this.remoteStream.addTrack(track)
      // streams[0] обычно несёт оба трека — используем его, если есть.
      const stream = streams[0] ?? this.remoteStream
      this.cb.onRemoteStream(stream)
      // Когда удалённый трек кончается/мьютится/размьючивается (напр. собеседник
      // остановил демонстрацию экрана) — перерисовываем UI, чтобы скрыть/показать видео.
      const notify = () => {
        if (track.readyState === 'ended') {
          try { this.remoteStream.removeTrack(track) } catch { /* noop */ }
        }
        this.cb.onRemoteStream(this.remoteStream)
      }
      track.onended = notify
      track.onmute = notify
      track.onunmute = notify
    }

    this.pc.onnegotiationneeded = async () => {
      try {
        this.makingOffer = true
        await this.pc.setLocalDescription()
        if (this.pc.localDescription) {
          this.cb.onSignal({ kind: 'sdp', description: this.pc.localDescription })
        }
      } catch { /* negotiation race — игнорируем, перевыставится */ } finally {
        this.makingOffer = false
      }
    }

    this.pc.onconnectionstatechange = () => {
      const st = this.pc.connectionState
      this.cb.onConnectionState(st)
      if (st === 'connected' && !this.statsTimer) this.startStats()
    }
  }

  /** Обработка входящего сигнала от второго пира. */
  async handleSignal(signal: Signal): Promise<void> {
    try {
      if (signal.kind === 'ice') {
        try { await this.pc.addIceCandidate(signal.candidate) }
        catch { if (!this.ignoreOffer) throw new Error('addIceCandidate failed') }
        return
      }

      // SDP offer/answer с разрешением коллизий
      const description = signal.description
      const offerCollision =
        description.type === 'offer' &&
        (this.makingOffer || this.pc.signalingState !== 'stable')

      this.ignoreOffer = !this.polite && offerCollision
      if (this.ignoreOffer) return

      await this.pc.setRemoteDescription(description)
      if (description.type === 'offer') {
        await this.pc.setLocalDescription()
        if (this.pc.localDescription) {
          this.cb.onSignal({ kind: 'sdp', description: this.pc.localDescription })
        }
      }
    } catch (err) {
      console.warn('[webrtc] handleSignal error', err)
    }
  }

  // ── Управление микрофоном / камерой ─────────────────────────
  setMicEnabled(on: boolean): void {
    this.localStream?.getAudioTracks().forEach(t => { t.enabled = on })
  }

  setCamEnabled(on: boolean): void {
    this.localStream?.getVideoTracks().forEach(t => { t.enabled = on })
  }

  /** Включить видео в аудиозвонке «на лету» (апгрейд до видео). */
  async enableVideoTrack(deviceId?: string): Promise<MediaStreamTrack | null> {
    if (this.localStream?.getVideoTracks().length) {
      this.setCamEnabled(true)
      return this.localStream.getVideoTracks()[0]
    }
    const cam = await navigator.mediaDevices.getUserMedia({ video: videoConstraints(deviceId) })
    const track = cam.getVideoTracks()[0]
    if (!track) return null
    this.localStream?.addTrack(track)
    this.pc.addTrack(track, this.localStream ?? cam)   // вызовет onnegotiationneeded
    return track
  }

  // ── Демонстрация экрана ─────────────────────────────────────
  async startScreenShare(): Promise<MediaStream> {
    const screen = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 15 } },
      audio: false,
    })
    this.screenStream = screen
    const screenTrack = screen.getVideoTracks()[0]

    // Заменяем исходящий видеотрек на экранный через тот же sender (без ренеготиации трека).
    const sender = this.pc.getSenders().find(s => s.track?.kind === 'video')
    if (sender) await sender.replaceTrack(screenTrack)
    else this.pc.addTrack(screenTrack, screen)

    // Когда пользователь жмёт «Остановить» в системной плашке — вернуть камеру.
    screenTrack.onended = () => { this.stopScreenShare().catch(() => {}) }
    return screen
  }

  async stopScreenShare(): Promise<void> {
    if (!this.screenStream) return
    this.screenStream.getTracks().forEach(t => t.stop())
    this.screenStream = null
    // Возвращаем камеру (если была) обратно в sender.
    const camTrack = this.localStream?.getVideoTracks()[0] ?? null
    const sender = this.pc.getSenders().find(s => s.track?.kind === 'video' || s.track === null)
    if (sender) await sender.replaceTrack(camTrack)
  }

  isScreenSharing(): boolean { return this.screenStream !== null }

  // ── Переключение устройств ──────────────────────────────────
  async switchAudioInput(deviceId: string): Promise<void> {
    const fresh = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints(deviceId) })
    const newTrack = fresh.getAudioTracks()[0]
    const sender = this.pc.getSenders().find(s => s.track?.kind === 'audio')
    if (sender) await sender.replaceTrack(newTrack)
    // Подменяем трек в localStream
    this.localStream?.getAudioTracks().forEach(t => { t.stop(); this.localStream?.removeTrack(t) })
    this.localStream?.addTrack(newTrack)
  }

  async switchVideoInput(deviceId: string): Promise<MediaStreamTrack | null> {
    if (this.isScreenSharing()) return null   // во время демонстрации не трогаем
    const fresh = await navigator.mediaDevices.getUserMedia({ video: videoConstraints(deviceId) })
    const newTrack = fresh.getVideoTracks()[0]
    const sender = this.pc.getSenders().find(s => s.track?.kind === 'video')
    if (sender) await sender.replaceTrack(newTrack)
    this.localStream?.getVideoTracks().forEach(t => { t.stop(); this.localStream?.removeTrack(t) })
    this.localStream?.addTrack(newTrack)
    return newTrack
  }

  // ── Сбор статистики качества ────────────────────────────────
  private startStats(): void {
    this.statsTimer = setInterval(async () => {
      if (!this.cb.onQuality) return
      try {
        const stats = await this.pc.getStats()
        let rtt: number | null = null
        let lossPct = 0
        let bytesSent = 0

        stats.forEach(report => {
          if (report.type === 'candidate-pair' && report.state === 'succeeded' && report.nominated) {
            if (typeof report.currentRoundTripTime === 'number') rtt = report.currentRoundTripTime * 1000
          }
          if (report.type === 'outbound-rtp') {
            bytesSent += report.bytesSent ?? 0
          }
          if (report.type === 'remote-inbound-rtp') {
            // fractionLost: 0..1 за последний интервал
            if (typeof report.fractionLost === 'number') lossPct = Math.max(lossPct, report.fractionLost * 100)
          }
        })

        const now = performance.now()
        let bitrateKbps = 0
        if (this.lastStatsTs > 0) {
          const dt = (now - this.lastStatsTs) / 1000
          if (dt > 0) bitrateKbps = Math.round(((bytesSent - this.lastBytesSent) * 8) / 1000 / dt)
        }
        this.lastBytesSent = bytesSent
        this.lastStatsTs = now

        const level: ConnectionQuality['level'] =
          (rtt !== null && rtt > 400) || lossPct > 8 ? 'poor'
          : (rtt !== null && rtt > 200) || lossPct > 3 ? 'medium'
          : 'good'

        this.cb.onQuality({ level, rttMs: rtt !== null ? Math.round(rtt) : null, packetLossPct: Math.round(lossPct * 10) / 10, bitrateKbps })
      } catch { /* getStats может бросить при teardown */ }
    }, 2000)
  }

  // ── Завершение ──────────────────────────────────────────────
  close(): void {
    if (this.statsTimer) { clearInterval(this.statsTimer); this.statsTimer = null }
    this.localStream?.getTracks().forEach(t => t.stop())
    this.screenStream?.getTracks().forEach(t => t.stop())
    this.remoteStream.getTracks().forEach(t => this.remoteStream.removeTrack(t))
    this.pc.getSenders().forEach(s => { try { s.track?.stop() } catch { /* noop */ } })
    this.pc.onicecandidate = null
    this.pc.ontrack = null
    this.pc.onnegotiationneeded = null
    this.pc.onconnectionstatechange = null
    try { this.pc.close() } catch { /* noop */ }
  }
}

// ── Утилиты устройств ─────────────────────────────────────────
export interface MediaDeviceLists {
  audioInputs: MediaDeviceInfo[]
  videoInputs: MediaDeviceInfo[]
  audioOutputs: MediaDeviceInfo[]
}

export async function enumerateDevices(): Promise<MediaDeviceLists> {
  const all = await navigator.mediaDevices.enumerateDevices()
  return {
    audioInputs: all.filter(d => d.kind === 'audioinput'),
    videoInputs: all.filter(d => d.kind === 'videoinput'),
    audioOutputs: all.filter(d => d.kind === 'audiooutput'),
  }
}
