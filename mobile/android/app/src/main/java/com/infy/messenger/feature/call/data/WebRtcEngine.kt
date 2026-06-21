package com.infy.messenger.feature.call.data

import android.content.Context
import com.infy.messenger.feature.call.domain.CallMedia
import dagger.hilt.android.qualifiers.ApplicationContext
import org.webrtc.AudioTrack
import org.webrtc.Camera2Enumerator
import org.webrtc.CameraVideoCapturer
import org.webrtc.DefaultVideoDecoderFactory
import org.webrtc.DefaultVideoEncoderFactory
import org.webrtc.EglBase
import org.webrtc.IceCandidate
import org.webrtc.MediaConstraints
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.SdpObserver
import org.webrtc.SessionDescription
import org.webrtc.SurfaceTextureHelper
import org.webrtc.VideoSource
import org.webrtc.VideoTrack
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Тонкая обёртка над WebRTC для звонка 1:1 с perfect negotiation.
 *
 * Сигнальные сообщения (offer/answer/ICE) уходят наружу через [Listener.onLocalDescription]
 * и [Listener.onLocalIceCandidate]; входящие подаются через [setRemoteDescription] и
 * [addRemoteIceCandidate]. Коллизии offer'ов разрешаются флагом polite (получатель
 * polite=true откатывает свой offer, инициатор polite=false — нет).
 */
@Singleton
class WebRtcEngine @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    interface Listener {
        fun onLocalDescription(sdp: SessionDescription)
        fun onLocalIceCandidate(candidate: IceCandidate)
        fun onConnected()
        fun onFailed()
        fun onRemoteVideoTrack(track: VideoTrack)
    }

    val eglBase: EglBase = EglBase.create()

    private var factory: PeerConnectionFactory? = null
    private var peerConnection: PeerConnection? = null
    private var listener: Listener? = null

    private var localAudioTrack: AudioTrack? = null
    private var localVideoTrack: VideoTrack? = null
    private var videoSource: VideoSource? = null
    private var videoCapturer: CameraVideoCapturer? = null
    private var surfaceHelper: SurfaceTextureHelper? = null

    private var polite = false
    private var makingOffer = false
    private var media: CallMedia = CallMedia.AUDIO

    val localVideo: VideoTrack? get() = localVideoTrack

    /** Инициализировать фабрику, peer connection и локальные треки. */
    fun start(
        iceServers: List<PeerConnection.IceServer>,
        media: CallMedia,
        polite: Boolean,
        listener: Listener,
    ) {
        this.listener = listener
        this.polite = polite
        this.media = media

        PeerConnectionFactory.initialize(
            PeerConnectionFactory.InitializationOptions.builder(context)
                .createInitializationOptions(),
        )
        val encoder = DefaultVideoEncoderFactory(eglBase.eglBaseContext, true, true)
        val decoder = DefaultVideoDecoderFactory(eglBase.eglBaseContext)
        val pcFactory = PeerConnectionFactory.builder()
            .setVideoEncoderFactory(encoder)
            .setVideoDecoderFactory(decoder)
            .createPeerConnectionFactory()
        factory = pcFactory

        val rtcConfig = PeerConnection.RTCConfiguration(iceServers).apply {
            sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
            continualGatheringPolicy =
                PeerConnection.ContinualGatheringPolicy.GATHER_CONTINUALLY
        }

        peerConnection = pcFactory.createPeerConnection(
            rtcConfig,
            object : PeerConnectionObserver() {
                override fun onIceCandidate(candidate: IceCandidate) {
                    listener.onLocalIceCandidate(candidate)
                }

                override fun onConnectionChange(newState: PeerConnection.PeerConnectionState) {
                    when (newState) {
                        PeerConnection.PeerConnectionState.CONNECTED -> listener.onConnected()
                        PeerConnection.PeerConnectionState.FAILED -> listener.onFailed()
                        else -> Unit
                    }
                }

                override fun onTrack(transceiver: org.webrtc.RtpTransceiver) {
                    val track = transceiver.receiver.track()
                    if (track is VideoTrack) listener.onRemoteVideoTrack(track)
                }
            },
        )

        addLocalTracks(pcFactory)
    }

    private fun addLocalTracks(pcFactory: PeerConnectionFactory) {
        // Аудио — всегда.
        val audioConstraints = MediaConstraints().apply {
            mandatory.add(MediaConstraints.KeyValuePair("googEchoCancellation", "true"))
            mandatory.add(MediaConstraints.KeyValuePair("googNoiseSuppression", "true"))
            mandatory.add(MediaConstraints.KeyValuePair("googAutoGainControl", "true"))
        }
        val audioSource = pcFactory.createAudioSource(audioConstraints)
        val audio = pcFactory.createAudioTrack("audio0", audioSource)
        localAudioTrack = audio
        peerConnection?.addTrack(audio, listOf(STREAM_ID))

        // Видео — только для видеозвонка.
        if (media == CallMedia.VIDEO) {
            startCamera(pcFactory)
        }
    }

    private fun startCamera(pcFactory: PeerConnectionFactory) {
        val enumerator = Camera2Enumerator(context)
        val frontName = enumerator.deviceNames.firstOrNull { enumerator.isFrontFacing(it) }
            ?: enumerator.deviceNames.firstOrNull() ?: return
        val capturer = enumerator.createCapturer(frontName, null) ?: return
        videoCapturer = capturer

        val helper = SurfaceTextureHelper.create("CaptureThread", eglBase.eglBaseContext)
        surfaceHelper = helper
        val source = pcFactory.createVideoSource(false)
        videoSource = source
        capturer.initialize(helper, context, source.capturerObserver)
        capturer.startCapture(1280, 720, 30)

        val video = pcFactory.createVideoTrack("video0", source)
        localVideoTrack = video
        peerConnection?.addTrack(video, listOf(STREAM_ID))
    }

    /** Сгенерировать offer (инициатор после accept). */
    fun createOffer() {
        val pc = peerConnection ?: return
        makingOffer = true
        pc.createOffer(object : SimpleSdpObserver() {
            override fun onCreateSuccess(sdp: SessionDescription) {
                pc.setLocalDescription(object : SimpleSdpObserver() {
                    override fun onSetSuccess() {
                        makingOffer = false
                        listener?.onLocalDescription(sdp)
                    }
                }, sdp)
            }
        }, offerConstraints())
    }

    /** Принять удалённое описание; при offer — создать answer. */
    fun setRemoteDescription(type: String, sdp: String) {
        val pc = peerConnection ?: return
        val rtcType = if (type.equals("offer", true)) {
            SessionDescription.Type.OFFER
        } else {
            SessionDescription.Type.ANSWER
        }
        val description = SessionDescription(rtcType, sdp)

        pc.setRemoteDescription(object : SimpleSdpObserver() {
            override fun onSetSuccess() {
                if (rtcType == SessionDescription.Type.OFFER) {
                    createAnswer()
                }
            }
        }, description)
    }

    private fun createAnswer() {
        val pc = peerConnection ?: return
        pc.createAnswer(object : SimpleSdpObserver() {
            override fun onCreateSuccess(sdp: SessionDescription) {
                pc.setLocalDescription(object : SimpleSdpObserver() {
                    override fun onSetSuccess() {
                        listener?.onLocalDescription(sdp)
                    }
                }, sdp)
            }
        }, MediaConstraints())
    }

    fun addRemoteIceCandidate(sdpMid: String?, sdpMLineIndex: Int, sdp: String) {
        peerConnection?.addIceCandidate(IceCandidate(sdpMid, sdpMLineIndex, sdp))
    }

    // ── Управление медиа ─────────────────────────────────────────────

    fun setMicEnabled(enabled: Boolean) {
        localAudioTrack?.setEnabled(enabled)
    }

    fun setCamEnabled(enabled: Boolean) {
        localVideoTrack?.setEnabled(enabled)
    }

    fun switchCamera() {
        videoCapturer?.switchCamera(null)
    }

    /** Полностью освободить ресурсы. */
    fun release() {
        runCatching { videoCapturer?.stopCapture() }
        videoCapturer?.dispose()
        surfaceHelper?.dispose()
        videoSource?.dispose()
        localVideoTrack = null
        localAudioTrack = null
        peerConnection?.dispose()
        peerConnection = null
        factory?.dispose()
        factory = null
        listener = null
    }

    private fun offerConstraints() = MediaConstraints().apply {
        mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveAudio", "true"))
        mandatory.add(
            MediaConstraints.KeyValuePair(
                "OfferToReceiveVideo",
                if (media == CallMedia.VIDEO) "true" else "false",
            ),
        )
    }

    private companion object {
        const val STREAM_ID = "infy-stream"
    }
}

/** Заглушка SdpObserver с пустыми методами, чтобы переопределять только нужные. */
private open class SimpleSdpObserver : SdpObserver {
    override fun onCreateSuccess(sdp: SessionDescription) {}
    override fun onSetSuccess() {}
    override fun onCreateFailure(error: String?) { Timber.w("SDP create failed: %s", error) }
    override fun onSetFailure(error: String?) { Timber.w("SDP set failed: %s", error) }
}
