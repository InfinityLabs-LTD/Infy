package com.infy.messenger.feature.call.ui

import androidx.lifecycle.ViewModel
import com.infy.messenger.core.media.MediaUrlBuilder
import com.infy.messenger.feature.call.data.CallManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.StateFlow
import org.webrtc.EglBase
import org.webrtc.VideoTrack
import javax.inject.Inject

/**
 * Состояние и действия активного звонка для оверлея. Вся логика — в [CallManager]
 * (singleton, переживает пересоздание экранов); VM лишь проксирует.
 */
@HiltViewModel
class CallViewModel @Inject constructor(
    private val callManager: CallManager,
    private val mediaUrlBuilder: MediaUrlBuilder,
) : ViewModel() {

    val callState = callManager.callState
    val remoteVideo: StateFlow<VideoTrack?> = callManager.remoteVideo

    val eglBase: EglBase get() = callManager.eglBase
    val localVideo: VideoTrack? get() = callManager.localVideo

    /** Абсолютный URL аватара собеседника (бэкенд отдаёт относительный путь). */
    fun avatarUrl(relative: String?): String? = mediaUrlBuilder.absoluteOrNull(relative)

    fun accept() = callManager.accept()
    fun decline() = callManager.decline()
    fun hangup() = callManager.hangup()
    fun toggleMic() = callManager.toggleMic()
    fun toggleCam() = callManager.toggleCam()
    fun switchCamera() = callManager.switchCamera()
    fun toggleSpeaker() = callManager.toggleSpeaker()
}
