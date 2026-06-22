package com.infy.messenger.feature.media.ui

import android.annotation.SuppressLint
import android.net.Uri
import androidx.camera.core.CameraSelector
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.video.FileOutputOptions
import androidx.camera.video.Quality
import androidx.camera.video.QualitySelector
import androidx.camera.video.Recorder
import androidx.camera.video.Recording
import androidx.camera.video.VideoCapture
import androidx.camera.video.VideoRecordEvent
import androidx.camera.view.PreviewView
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Cameraswitch
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.concurrent.futures.await
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import com.google.accompanist.permissions.ExperimentalPermissionsApi
import com.google.accompanist.permissions.rememberMultiplePermissionsState
import com.infy.messenger.R
import com.infy.messenger.ui.theme.InfyPurple
import java.io.File

/**
 * Экран записи «кружка» — круглого видеосообщения.
 *
 * @param onRecorded вызывается после успешной записи: (Uri готового файла, длительность в мс)
 * @param onCancel   вызывается при отмене/нажатии «назад»
 */
@OptIn(ExperimentalPermissionsApi::class)
@SuppressLint("MissingPermission")
@Composable
fun CircleRecorderScreen(
    onRecorded: (uri: Uri, durationMs: Long) -> Unit,
    onCancel: () -> Unit,
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current

    // Запрашиваем разрешения камеры и микрофона разом
    val permissionsState = rememberMultiplePermissionsState(
        listOf(
            android.Manifest.permission.CAMERA,
            android.Manifest.permission.RECORD_AUDIO,
        )
    )
    val permissionsGranted = permissionsState.allPermissionsGranted

    if (!permissionsGranted) {
        // Экран запроса разрешений
        Box(modifier = Modifier.fillMaxSize()) {
            // Кнопка «назад» в левом верхнем углу
            IconButton(
                onClick = onCancel,
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .padding(8.dp),
            ) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = stringResource(R.string.chat_back),
                )
            }
            Column(
                modifier = Modifier
                    .align(Alignment.Center)
                    .padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(
                    text = stringResource(R.string.media_permission_camera),
                    style = MaterialTheme.typography.bodyLarge,
                )
                Spacer(modifier = Modifier.height(16.dp))
                Button(onClick = { permissionsState.launchMultiplePermissionRequest() }) {
                    Text(text = stringResource(R.string.media_permission_camera))
                }
            }
        }
        return
    }

    // --- Состояние камеры/записи ---
    // Текущая камера: по умолчанию фронтальная
    var lensFacing by remember { mutableStateOf(CameraSelector.LENS_FACING_FRONT) }
    // PreviewView держим в remember, чтобы привязать к нему surfaceProvider
    val previewView = remember { PreviewView(context) }
    // Готовый VideoCapture (заполняется в LaunchedEffect после биндинга)
    var videoCapture by remember { mutableStateOf<VideoCapture<Recorder>?>(null) }
    // Активная запись (если идёт) и момент её старта
    var activeRecording by remember { mutableStateOf<Recording?>(null) }
    var recordStartMs by remember { mutableStateOf(0L) }
    // Запись отменяется пользователем: Finalize не должен отправлять кружок.
    val cancelledRef = remember { java.util.concurrent.atomic.AtomicBoolean(false) }
    // Провайдер камеры — нужен, чтобы корректно отвязать при выходе
    var cameraProvider by remember { mutableStateOf<ProcessCameraProvider?>(null) }

    // Минимальная длительность кружка (мс) — короче не отправляем
    val minDurationMs = 700L

    // Биндим Preview + VideoCapture при смене камеры / получении разрешений
    LaunchedEffect(lensFacing, permissionsGranted) {
        val provider = ProcessCameraProvider.getInstance(context).await()
        cameraProvider = provider

        val preview = Preview.Builder().build().also {
            it.setSurfaceProvider(previewView.surfaceProvider)
        }

        val recorder = Recorder.Builder()
            .setQualitySelector(QualitySelector.from(Quality.HD))
            .build()
        val capture = VideoCapture.withOutput(recorder)

        val selector = CameraSelector.Builder()
            .requireLensFacing(lensFacing)
            .build()

        try {
            // Перед перепривязкой отвязываем всё, чтобы не было конфликтов use-case
            provider.unbindAll()
            provider.bindToLifecycle(lifecycleOwner, selector, preview, capture)
            videoCapture = capture
        } catch (e: Exception) {
            // Если выбранная камера недоступна — просто остаёмся без захвата
            videoCapture = null
        }
    }

    // Отвязываем камеру при уходе с экрана
    DisposableEffect(Unit) {
        onDispose {
            cameraProvider?.unbindAll()
        }
    }

    // --- Запуск/остановка записи ---
    fun startRecording() {
        val capture = videoCapture ?: return
        if (activeRecording != null) return

        // Каталог для временных кружков
        val dir = File(context.cacheDir, "circles").apply { mkdirs() }
        val file = File(dir, "circle_${System.currentTimeMillis()}.mp4")

        val options = FileOutputOptions.Builder(file).build()
        recordStartMs = System.currentTimeMillis()
        activeRecording = capture.output
            .prepareRecording(context, options)
            .withAudioEnabled()
            .start(ContextCompat.getMainExecutor(context)) { event ->
                if (event is VideoRecordEvent.Finalize) {
                    val durationMs = System.currentTimeMillis() - recordStartMs
                    activeRecording = null
                    if (cancelledRef.get()) {
                        // Отменено пользователем — не отправляем, удаляем файл.
                        file.delete()
                    } else if (!event.hasError() && durationMs >= minDurationMs) {
                        // Отдаём Uri через FileProvider
                        val uri = FileProvider.getUriForFile(
                            context,
                            "${context.packageName}.fileprovider",
                            file,
                        )
                        onRecorded(uri, durationMs)
                    } else {
                        // Слишком короткая запись или ошибка — удаляем файл
                        file.delete()
                    }
                }
            }
    }

    fun stopRecording() {
        activeRecording?.stop()
        // activeRecording сбросится в колбэке Finalize
    }

    // Идёт ли запись (для UI).
    val isRecording = activeRecording != null

    // Таймер записи (сек) — для подписи под кружком.
    var elapsedSec by remember { mutableStateOf(0) }
    LaunchedEffect(isRecording) {
        if (!isRecording) { elapsedSec = 0; return@LaunchedEffect }
        while (true) {
            elapsedSec = ((System.currentTimeMillis() - recordStartMs) / 1000).toInt()
            kotlinx.coroutines.delay(250)
        }
    }
    val timeLabel = "%d:%02d".format(elapsedSec / 60, elapsedSec % 60)

    // --- UI (Telegram-style: тап «запись» — старт, тап «отправить» — стоп+отправка) ---
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black),
    ) {
        // Кнопка «назад/отмена»
        IconButton(
            onClick = onCancel,
            modifier = Modifier
                .align(Alignment.TopStart)
                .padding(8.dp),
        ) {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                contentDescription = stringResource(R.string.chat_back),
                tint = Color.White,
            )
        }

        Column(
            modifier = Modifier
                .align(Alignment.Center)
                .fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            // Круглое превью камеры + кнопка смены камеры в углу.
            Box(modifier = Modifier.size(300.dp)) {
                AndroidView(
                    factory = { previewView },
                    modifier = Modifier
                        .fillMaxSize()
                        .clip(CircleShape),
                )
                // Смена камеры (front/back) — поверх превью.
                IconButton(
                    onClick = {
                        lensFacing = if (lensFacing == CameraSelector.LENS_FACING_FRONT) {
                            CameraSelector.LENS_FACING_BACK
                        } else {
                            CameraSelector.LENS_FACING_FRONT
                        }
                    },
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(8.dp)
                        .size(40.dp)
                        .clip(CircleShape)
                        .background(Color.Black.copy(alpha = 0.5f)),
                ) {
                    Icon(
                        imageVector = Icons.Filled.Cameraswitch,
                        contentDescription = stringResource(R.string.media_circle_flip),
                        tint = Color.White,
                    )
                }
            }

            Spacer(modifier = Modifier.height(24.dp))

            // Подсказка / таймер.
            Text(
                text = if (isRecording) timeLabel
                else stringResource(R.string.media_circle_tap_to_record),
                color = Color.White,
                style = MaterialTheme.typography.bodyMedium,
            )

            Spacer(modifier = Modifier.height(20.dp))

            if (!isRecording) {
                // Одна большая кнопка «начать запись».
                Box(
                    modifier = Modifier
                        .size(72.dp)
                        .clip(CircleShape)
                        .background(Color.Red)
                        .pointerInput(videoCapture) {
                            detectTapGestures(onTap = { startRecording() })
                        },
                )
            } else {
                // Идёт запись: отмена слева, отправка (стоп) справа.
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    IconButton(
                        onClick = {
                            // Отмена: помечаем как отменённую (Finalize не отправит),
                            // останавливаем запись и закрываем экран.
                            cancelledRef.set(true)
                            activeRecording?.stop()
                            onCancel()
                        },
                        modifier = Modifier
                            .size(56.dp)
                            .clip(CircleShape)
                            .background(Color.White.copy(alpha = 0.12f)),
                    ) {
                        Icon(
                            imageVector = Icons.Filled.Close,
                            contentDescription = stringResource(R.string.media_cancel),
                            tint = Color.White,
                        )
                    }

                    Spacer(modifier = Modifier.size(28.dp))

                    // Отправка: стоп → колбэк Finalize отдаёт файл и закрывает экран.
                    Box(
                        modifier = Modifier
                            .size(64.dp)
                            .clip(CircleShape)
                            .background(InfyPurple)
                            .pointerInput(Unit) {
                                detectTapGestures(onTap = { stopRecording() })
                            },
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.Send,
                            contentDescription = stringResource(R.string.chat_send),
                            tint = Color.White,
                        )
                    }
                }
            }
        }
    }
}
