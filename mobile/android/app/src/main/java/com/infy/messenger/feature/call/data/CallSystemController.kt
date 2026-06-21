package com.infy.messenger.feature.call.data

import android.content.Context
import android.media.AudioManager
import com.infy.messenger.feature.call.CallForegroundService
import com.infy.messenger.feature.call.domain.CallPhase
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Связывает состояние звонка с системой: foreground-service на время активного
 * звонка и аудио-маршрутизация (режим связи + динамик/разговорный).
 * Запускается из Application.
 */
@Singleton
class CallSystemController @Inject constructor(
    @ApplicationContext private val context: Context,
    private val callManager: CallManager,
) {
    private val scope = CoroutineScope(SupervisorJob())
    private val audioManager =
        context.getSystemService(Context.AUDIO_SERVICE) as AudioManager

    private var serviceRunning = false
    private var previousMode = AudioManager.MODE_NORMAL

    fun start() {
        // Старт/стоп foreground-сервиса по наличию неоконченного звонка.
        scope.launch {
            callManager.callState
                .map { it?.phase }
                .distinctUntilChanged()
                .collect { phase -> onPhaseChanged(phase) }
        }
        // Динамик/разговорный по флагу speakerOn.
        scope.launch {
            callManager.callState
                .map { it?.speakerOn }
                .distinctUntilChanged()
                .collect { speakerOn ->
                    if (speakerOn != null) audioManager.isSpeakerphoneOn = speakerOn
                }
        }
    }

    private fun onPhaseChanged(phase: CallPhase?) {
        val active = phase != null && phase != CallPhase.ENDED
        if (active && !serviceRunning) {
            previousMode = audioManager.mode
            audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
            CallForegroundService.start(context, context.getString(com.infy.messenger.R.string.call_ongoing))
            serviceRunning = true
        } else if (!active && serviceRunning) {
            audioManager.mode = previousMode
            audioManager.isSpeakerphoneOn = false
            CallForegroundService.stop(context)
            serviceRunning = false
        }
    }
}
