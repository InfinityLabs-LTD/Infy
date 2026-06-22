package com.infy.messenger.feature.call.data

import com.infy.messenger.core.network.apiCall
import com.infy.messenger.core.notification.AppNotifier
import com.infy.messenger.core.realtime.RealtimeClient
import com.infy.messenger.core.realtime.RealtimeEvent
import com.infy.messenger.feature.call.domain.CallMedia
import com.infy.messenger.feature.call.domain.CallPeer
import com.infy.messenger.feature.call.domain.CallPhase
import com.infy.messenger.feature.call.domain.CallState
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import org.json.JSONObject
import org.webrtc.IceCandidate
import org.webrtc.PeerConnection
import org.webrtc.SessionDescription
import org.webrtc.VideoTrack
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Оркестратор звонка: связывает сокет-сигналинг ([RealtimeClient]) с [WebRtcEngine].
 * Держит единственное состояние [callState] для UI. Реализует поток из docs/CALLS.md:
 * invite → incoming/ringing → accept → accepted → offer/answer/ICE → connected.
 *
 * Запускается из Application (collect событий). Один активный звонок 1:1.
 */
@Singleton
class CallManager @Inject constructor(
    private val realtimeClient: RealtimeClient,
    private val webRtcEngine: WebRtcEngine,
    private val callApi: CallApi,
    private val notifier: AppNotifier,
) {
    private val scope = CoroutineScope(SupervisorJob())

    private val _callState = MutableStateFlow<CallState?>(null)
    val callState: StateFlow<CallState?> = _callState.asStateFlow()

    private val _remoteVideo = MutableStateFlow<VideoTrack?>(null)
    val remoteVideo: StateFlow<VideoTrack?> = _remoteVideo.asStateFlow()

    val eglBase get() = webRtcEngine.eglBase
    val localVideo: VideoTrack? get() = webRtcEngine.localVideo

    /** Буфер offer'а, пришедшего получателю до accept (движка ещё нет). */
    private var bufferedOffer: String? = null
    private val pendingRemoteCandidates = mutableListOf<IceCandidate>()
    private var remoteDescriptionSet = false

    private var durationJob: Job? = null
    private var engineStarted = false

    fun start() {
        scope.launch {
            realtimeClient.events.collect { event -> handle(event) }
        }
    }

    // ── Действия пользователя ────────────────────────────────────────

    /** Инициировать исходящий звонок. */
    fun startCall(chatId: String, peer: CallPeer, media: CallMedia) {
        if (_callState.value != null) return
        realtimeClient.callInvite(chatId, media.name) { ok, callId, error ->
            if (ok && callId != null) {
                _callState.value = CallState(
                    callId = callId,
                    chatId = chatId,
                    media = media,
                    phase = CallPhase.OUTGOING,
                    isInitiator = true,
                    peer = peer,
                    camOn = media == CallMedia.VIDEO,
                    speakerOn = media == CallMedia.VIDEO,
                )
            } else {
                Timber.w("call invite failed: %s", error)
            }
        }
    }

    /** Принять входящий звонок. */
    fun accept() {
        val state = _callState.value ?: return
        if (state.phase != CallPhase.INCOMING) return
        notifier.cancelCall()
        realtimeClient.callAccept(state.callId)
        _callState.update { it?.copy(phase = CallPhase.CONNECTING) }
        // Получатель — polite=true; движок поднимаем и проигрываем буфер offer.
        scope.launch { ensureEngine(state, polite = true) }
    }

    fun decline() {
        val state = _callState.value ?: return
        realtimeClient.callDecline(state.callId)
        finish(reason = "declined")
    }

    /** Завершить звонок (cancel до ответа / hangup активного). */
    fun hangup() {
        val state = _callState.value ?: return
        when (state.phase) {
            CallPhase.OUTGOING -> realtimeClient.callCancel(state.callId)
            CallPhase.ENDED -> Unit
            else -> realtimeClient.callHangup(state.callId)
        }
        finish(reason = "hangup")
    }

    fun toggleMic() {
        val state = _callState.value ?: return
        val newMic = !state.micOn
        webRtcEngine.setMicEnabled(newMic)
        realtimeClient.callMediaState(state.callId, micOn = newMic, camOn = null, screenOn = null)
        _callState.update { it?.copy(micOn = newMic) }
    }

    fun toggleCam() {
        val state = _callState.value ?: return
        val newCam = !state.camOn
        webRtcEngine.setCamEnabled(newCam)
        realtimeClient.callMediaState(state.callId, micOn = null, camOn = newCam, screenOn = null)
        _callState.update { it?.copy(camOn = newCam) }
    }

    fun switchCamera() = webRtcEngine.switchCamera()

    fun toggleSpeaker() {
        _callState.update { it?.copy(speakerOn = !(it.speakerOn)) }
    }

    // ── Обработка сигналинга ─────────────────────────────────────────

    private suspend fun handle(event: RealtimeEvent) {
        when (event) {
            is RealtimeEvent.CallIncoming -> onIncoming(event)
            is RealtimeEvent.CallRinging ->
                _callState.update { it?.copy(phase = CallPhase.OUTGOING) }
            is RealtimeEvent.CallAccepted -> onAccepted()
            is RealtimeEvent.CallSignal -> onSignal(event.dataJson)
            is RealtimeEvent.CallMediaState -> _callState.update {
                it?.copy(
                    peerMicOn = event.micOn ?: it.peerMicOn,
                    peerCamOn = event.camOn ?: it.peerCamOn,
                )
            }
            is RealtimeEvent.CallEnded -> onEnded(event)
            is RealtimeEvent.CallTakenElsewhere -> clearCall()
            is RealtimeEvent.CallPeerBusy ->
                _callState.update { it?.copy(phase = CallPhase.ENDED, endReason = "busy") }
            else -> Unit
        }
    }

    private fun onIncoming(e: RealtimeEvent.CallIncoming) {
        if (_callState.value != null) return // уже в звонке — сервер сам пометит busy
        val media = if (e.media.equals("VIDEO", true)) CallMedia.VIDEO else CallMedia.AUDIO
        _callState.value = CallState(
            callId = e.callId,
            chatId = e.chatId,
            media = media,
            phase = CallPhase.INCOMING,
            isInitiator = false,
            peer = CallPeer(e.fromId, e.fromUsername, e.fromNickname, e.fromAvatarUrl),
            camOn = media == CallMedia.VIDEO,
            speakerOn = media == CallMedia.VIDEO,
        )
    }

    /** Получатель принял — инициатор поднимает движок и шлёт offer. */
    private suspend fun onAccepted() {
        val state = _callState.value ?: return
        _callState.update { it?.copy(phase = CallPhase.CONNECTING) }
        ensureEngine(state, polite = false)
        webRtcEngine.createOffer()
    }

    private suspend fun onSignal(dataJson: String) {
        val obj = runCatching { JSONObject(dataJson) }.getOrNull() ?: return
        // Формат веб-клиента (frontend/src/lib/webrtc.ts):
        //   { kind: 'sdp', description: { type, sdp } } | { kind: 'ice', candidate: {...} }
        when (obj.optString("kind")) {
            "sdp" -> {
                val description = obj.optJSONObject("description") ?: return
                val type = description.optString("type")
                val sdp = description.optString("sdp")
                if (type.isEmpty() || sdp.isEmpty()) return
                _callState.value ?: return
                if (!engineStarted) {
                    // Offer пришёл получателю раньше accept — буферизуем целиком.
                    if (type.equals("offer", true)) bufferedOffer = dataJson
                    return
                }
                applyRemoteSdp(type, sdp)
            }
            "ice" -> {
                val candidate = obj.optJSONObject("candidate") ?: return
                val sdp = candidate.optString("candidate")
                if (sdp.isEmpty()) return
                val ice = IceCandidate(
                    candidate.optString("sdpMid"),
                    candidate.optInt("sdpMLineIndex"),
                    sdp,
                )
                if (remoteDescriptionSet) {
                    webRtcEngine.addRemoteIceCandidate(ice.sdpMid, ice.sdpMLineIndex, ice.sdp)
                } else {
                    pendingRemoteCandidates.add(ice)
                }
            }
        }
    }

    private fun applyRemoteSdp(type: String, sdp: String) {
        webRtcEngine.setRemoteDescription(type, sdp)
        remoteDescriptionSet = true
        // Слить отложенные ICE-кандидаты.
        pendingRemoteCandidates.forEach {
            webRtcEngine.addRemoteIceCandidate(it.sdpMid, it.sdpMLineIndex, it.sdp)
        }
        pendingRemoteCandidates.clear()
    }

    private fun onEnded(e: RealtimeEvent.CallEnded) {
        _callState.update {
            it?.copy(phase = CallPhase.ENDED, endReason = e.reason, durationSec = e.durationSec)
        }
        teardownEngine()
        durationJob?.cancel()
        // Через короткую паузу убираем оверлей.
        scope.launch { delay(1_500); clearCall() }
    }

    private fun finish(reason: String) {
        _callState.update { it?.copy(phase = CallPhase.ENDED, endReason = reason) }
        teardownEngine()
        durationJob?.cancel()
        scope.launch { delay(800); clearCall() }
    }

    private fun clearCall() {
        notifier.cancelCall()
        _callState.value = null
        _remoteVideo.value = null
        bufferedOffer = null
        pendingRemoteCandidates.clear()
        remoteDescriptionSet = false
    }

    // ── WebRTC ───────────────────────────────────────────────────────

    private suspend fun ensureEngine(state: CallState, polite: Boolean) {
        if (engineStarted) return
        val iceServers = fetchIceServers()
        webRtcEngine.start(
            iceServers = iceServers,
            media = state.media,
            polite = polite,
            listener = object : WebRtcEngine.Listener {
                override fun onLocalDescription(sdp: SessionDescription) {
                    // Формат сигнала строго как у веб-клиента (frontend/src/lib/webrtc.ts):
                    //   { kind: 'sdp', description: { type, sdp } }
                    val description = JSONObject()
                    description.put("type", sdp.type.canonicalForm())
                    description.put("sdp", sdp.description)
                    val data = JSONObject()
                    data.put("kind", "sdp")
                    data.put("description", description)
                    realtimeClient.callSignal(state.callId, data.toString())
                }

                override fun onLocalIceCandidate(candidate: IceCandidate) {
                    // Формат как у веба: { kind: 'ice', candidate: RTCIceCandidateInit }.
                    val c = JSONObject()
                    c.put("candidate", candidate.sdp)
                    c.put("sdpMid", candidate.sdpMid)
                    c.put("sdpMLineIndex", candidate.sdpMLineIndex)
                    val data = JSONObject()
                    data.put("kind", "ice")
                    data.put("candidate", c)
                    realtimeClient.callSignal(state.callId, data.toString())
                }

                override fun onConnected() {
                    _callState.update { it?.copy(phase = CallPhase.ACTIVE) }
                    startDurationTimer()
                }

                override fun onFailed() {
                    realtimeClient.callFailed(state.callId)
                    finish("failed")
                }

                override fun onRemoteVideoTrack(track: VideoTrack) {
                    _remoteVideo.value = track
                }
            },
        )
        engineStarted = true

        // Если у получателя есть буфер offer — проигрываем его сейчас.
        // bufferedOffer хранит весь сигнал { kind:'sdp', description:{type,sdp} }.
        bufferedOffer?.let { json ->
            bufferedOffer = null
            val description = JSONObject(json).optJSONObject("description") ?: return@let
            applyRemoteSdp(description.optString("type"), description.optString("sdp"))
        }
    }

    private fun teardownEngine() {
        if (!engineStarted) return
        webRtcEngine.release()
        engineStarted = false
        remoteDescriptionSet = false
    }

    private fun startDurationTimer() {
        durationJob?.cancel()
        durationJob = scope.launch {
            var sec = 0
            while (true) {
                delay(1_000)
                sec++
                _callState.update { it?.copy(durationSec = sec) }
            }
        }
    }

    private suspend fun fetchIceServers(): List<PeerConnection.IceServer> = runCatching {
        apiCall { callApi.getIceServers().data.iceServers }.map { dto ->
            val builder = PeerConnection.IceServer.builder(dto.urls)
            if (!dto.username.isNullOrEmpty()) builder.setUsername(dto.username)
            if (!dto.credential.isNullOrEmpty()) builder.setPassword(dto.credential)
            builder.createIceServer()
        }
    }.getOrElse {
        // Фолбэк на публичный STUN, если бэкенд недоступен.
        listOf(PeerConnection.IceServer.builder("stun:stun.l.google.com:19302").createIceServer())
    }
}
