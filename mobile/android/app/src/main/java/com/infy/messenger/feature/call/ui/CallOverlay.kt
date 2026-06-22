package com.infy.messenger.feature.call.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.VolumeOff
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.CallEnd
import androidx.compose.material.icons.filled.Cameraswitch
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material.icons.filled.VideocamOff
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import com.infy.messenger.R
import com.infy.messenger.feature.call.domain.CallMedia
import com.infy.messenger.feature.call.domain.CallPhase
import org.webrtc.EglBase
import org.webrtc.RendererCommon
import org.webrtc.SurfaceViewRenderer
import org.webrtc.VideoTrack

// Цвета элементов управления звонком (Aurora).
private val ColorAccept = Color(0xFF22C55E)
private val ColorHangup = Color(0xFFF43F5E)
private val ColorToggle = Color(0x1FFFFFFF)        // стекло glass-3
private val ColorBackground = Color(0xFF080B16)    // deep space

/**
 * Полноэкранный оверлей активного звонка. Рисуется поверх всего приложения,
 * пока [CallViewModel.callState] не равен null.
 */
@Composable
fun CallOverlay(viewModel: CallViewModel = hiltViewModel()) {
    val state by viewModel.callState.collectAsStateWithLifecycle()
    val current = state ?: return

    val remoteVideo by viewModel.remoteVideo.collectAsStateWithLifecycle()
    val isVideo = current.media == CallMedia.VIDEO

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(ColorBackground),
    ) {
        // Для аудиозвонка — мягкое aurora-свечение за аватаром (как в вебе).
        if (!isVideo) {
            Box(
                Modifier.fillMaxSize().background(
                    androidx.compose.ui.graphics.Brush.radialGradient(
                        0.0f to Color(0xFF7C3AED).copy(alpha = 0.22f),
                        0.65f to Color.Transparent,
                        radius = 1300f,
                    ),
                ),
            )
        }
        // Полноэкранное удалённое видео + PiP локального (только видеозвонок).
        if (isVideo) {
            RemoteVideoView(track = remoteVideo, eglBase = viewModel.eglBase)
            LocalVideoView(
                track = viewModel.localVideo,
                eglBase = viewModel.eglBase,
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(16.dp)
                    .size(width = 110.dp, height = 160.dp)
                    .clip(RoundedCornerShape(12.dp)),
            )
        }

        // Блок с информацией о собеседнике. Для аудио — по центру,
        // для видео — в верхней части поверх картинки.
        PeerInfo(
            state = current,
            isVideo = isVideo,
            avatarUrl = viewModel.avatarUrl(current.peer?.avatarUrl),
            modifier = if (isVideo) {
                Modifier.align(Alignment.TopCenter).padding(top = 64.dp)
            } else {
                Modifier.align(Alignment.Center)
            },
        )

        // Нижняя панель действий.
        ControlBar(
            state = current,
            isVideo = isVideo,
            onAccept = viewModel::accept,
            onDecline = viewModel::decline,
            onHangup = viewModel::hangup,
            onToggleMic = viewModel::toggleMic,
            onToggleCam = viewModel::toggleCam,
            onSwitchCamera = viewModel::switchCamera,
            onToggleSpeaker = viewModel::toggleSpeaker,
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = 48.dp),
        )
    }
}

/** Аватар, имя и статусная строка собеседника. */
@Composable
private fun PeerInfo(
    state: com.infy.messenger.feature.call.domain.CallState,
    isVideo: Boolean,
    avatarUrl: String?,
    modifier: Modifier = Modifier,
) {
    val peer = state.peer
    Column(
        modifier = modifier.padding(horizontal = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        // Аватар: показываем только когда нет полноэкранного видеопотока.
        if (!isVideo) {
            if (avatarUrl != null) {
                AsyncImage(
                    model = avatarUrl,
                    contentDescription = null,
                    modifier = Modifier
                        .size(96.dp)
                        .clip(CircleShape)
                        .background(ColorToggle),
                )
            } else {
                // Заглушка: первая буква никнейма.
                Box(
                    modifier = Modifier
                        .size(96.dp)
                        .clip(CircleShape)
                        .background(ColorToggle),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = peer?.nickname?.take(1)?.uppercase().orEmpty(),
                        color = Color.White,
                        fontSize = 36.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }
            Spacer(Modifier.height(20.dp))
        }

        Text(
            text = peer?.nickname.orEmpty(),
            color = Color.White,
            fontSize = 24.sp,
            fontWeight = FontWeight.SemiBold,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(8.dp))
        Text(
            text = statusText(state, isVideo),
            color = Color.White.copy(alpha = 0.7f),
            fontSize = 16.sp,
            textAlign = TextAlign.Center,
        )
    }
}

/** Статусная строка по текущей фазе звонка. */
@Composable
private fun statusText(
    state: com.infy.messenger.feature.call.domain.CallState,
    isVideo: Boolean,
): String = when (state.phase) {
    CallPhase.OUTGOING -> stringResWith(R.string.call_ringing)
    CallPhase.INCOMING -> stringResWith(
        if (isVideo) R.string.call_incoming_video else R.string.call_incoming_audio,
    )
    CallPhase.CONNECTING -> stringResWith(R.string.call_connecting)
    CallPhase.ACTIVE -> formatDuration(state.durationSec)
    CallPhase.ENDED -> stringResWith(
        when (state.endReason) {
            "declined" -> R.string.call_ended_declined
            "missed" -> R.string.call_ended_missed
            "busy" -> R.string.call_ended_busy
            "failed" -> R.string.call_ended_failed
            else -> R.string.call_ended
        },
    )
}

/** Тонкая обёртка над stringResource, чтобы держать вызов в одном месте. */
@Composable
private fun stringResWith(resId: Int): String =
    androidx.compose.ui.res.stringResource(resId)

/** Нижняя панель кнопок управления. */
@Composable
private fun ControlBar(
    state: com.infy.messenger.feature.call.domain.CallState,
    isVideo: Boolean,
    onAccept: () -> Unit,
    onDecline: () -> Unit,
    onHangup: () -> Unit,
    onToggleMic: () -> Unit,
    onToggleCam: () -> Unit,
    onSwitchCamera: () -> Unit,
    onToggleSpeaker: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier.padding(horizontal = 24.dp),
        horizontalArrangement = Arrangement.spacedBy(20.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (state.phase == CallPhase.INCOMING) {
            // Входящий: принять / отклонить.
            CallActionButton(
                icon = Icons.Filled.CallEnd,
                contentDescription = stringResWith(R.string.call_decline),
                onClick = onDecline,
                background = ColorHangup,
            )
            CallActionButton(
                icon = Icons.Filled.Call,
                contentDescription = stringResWith(R.string.call_accept),
                onClick = onAccept,
                background = ColorAccept,
            )
        } else {
            // Исходящий / соединение / активный: управление + завершить.
            CallActionButton(
                icon = if (state.micOn) Icons.Filled.Mic else Icons.Filled.MicOff,
                contentDescription = stringResWith(
                    if (state.micOn) R.string.call_mic_on else R.string.call_mic_off,
                ),
                onClick = onToggleMic,
                background = ColorToggle,
            )
            if (isVideo) {
                CallActionButton(
                    icon = if (state.camOn) Icons.Filled.Videocam else Icons.Filled.VideocamOff,
                    contentDescription = stringResWith(
                        if (state.camOn) R.string.call_cam_on else R.string.call_cam_off,
                    ),
                    onClick = onToggleCam,
                    background = ColorToggle,
                )
                CallActionButton(
                    icon = Icons.Filled.Cameraswitch,
                    contentDescription = stringResWith(R.string.call_switch_camera),
                    onClick = onSwitchCamera,
                    background = ColorToggle,
                )
            }
            CallActionButton(
                icon = if (state.speakerOn) {
                    Icons.AutoMirrored.Filled.VolumeUp
                } else {
                    Icons.AutoMirrored.Filled.VolumeOff
                },
                contentDescription = stringResWith(R.string.call_speaker),
                onClick = onToggleSpeaker,
                background = ColorToggle,
            )
            CallActionButton(
                icon = Icons.Filled.CallEnd,
                contentDescription = stringResWith(R.string.call_hangup),
                onClick = onHangup,
                background = ColorHangup,
            )
        }
    }
}

/** Круглая кнопка действия звонка. */
@Composable
private fun CallActionButton(
    icon: ImageVector,
    contentDescription: String,
    onClick: () -> Unit,
    background: Color = ColorToggle,
    tint: Color = Color.White,
) {
    Box(
        modifier = Modifier
            .size(60.dp)
            .clip(CircleShape)
            .background(background)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = contentDescription,
            tint = tint,
        )
    }
}

/**
 * Полноэкранное удалённое видео. Рендерер создаётся один раз и переживает
 * смену [track]; sink добавляется/снимается в [DisposableEffect].
 */
@Composable
private fun RemoteVideoView(
    track: VideoTrack?,
    eglBase: EglBase,
    modifier: Modifier = Modifier,
) {
    VideoRenderer(
        track = track,
        eglBase = eglBase,
        mirror = false,
        modifier = modifier.fillMaxSize(),
    )
}

/** Маленькое локальное видео (PiP), зеркалится. */
@Composable
private fun LocalVideoView(
    track: VideoTrack?,
    eglBase: EglBase,
    modifier: Modifier = Modifier,
) {
    VideoRenderer(
        track = track,
        eglBase = eglBase,
        mirror = true,
        modifier = modifier,
    )
}

/**
 * Общий рендерер WebRTC-видеопотока через [SurfaceViewRenderer].
 * - сам рендерер хранится в remember и освобождается при выходе из композиции;
 * - sink привязывается отдельным эффектом по ключу [track].
 */
@Composable
private fun VideoRenderer(
    track: VideoTrack?,
    eglBase: EglBase,
    mirror: Boolean,
    modifier: Modifier = Modifier,
) {
    val context = androidx.compose.ui.platform.LocalContext.current
    // Рендерер создаём один раз и инициализируем общим EGL-контекстом.
    val renderer = remember {
        SurfaceViewRenderer(context).apply {
            init(eglBase.eglBaseContext, null)
            setEnableHardwareScaler(true)
            setScalingType(RendererCommon.ScalingType.SCALE_ASPECT_FILL)
            setMirror(mirror)
        }
    }

    // Освобождение поверхности при уходе из композиции.
    DisposableEffect(Unit) {
        onDispose { renderer.release() }
    }

    // Привязка/отвязка видеопотока к рендереру.
    DisposableEffect(track) {
        track?.addSink(renderer)
        onDispose { track?.removeSink(renderer) }
    }

    AndroidView(
        factory = { renderer },
        modifier = modifier,
    )
}

/** Длительность активного разговора в формате m:ss. */
private fun formatDuration(durationSec: Int): String {
    val safe = if (durationSec < 0) 0 else durationSec
    val minutes = safe / 60
    val seconds = safe % 60
    return "%d:%02d".format(minutes, seconds)
}
