package com.infy.messenger.feature.media.ui

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.InsertDriveFile
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.ui.PlayerView
import coil.compose.AsyncImage
import com.infy.messenger.R
import com.infy.messenger.core.media.MediaUrlBuilder
import com.infy.messenger.core.media.rememberExoPlayer
import com.infy.messenger.feature.chat.domain.Attachment
import com.infy.messenger.feature.chat.domain.MessageType
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * Рендерит медиа-вложения сообщения. Выбирает конкретный компонент по [type]
 * (с уточнением по mime первого вложения). Для альбома показывает вертикальную
 * колонку изображений, для остальных типов — первое вложение.
 */
@Composable
fun MessageAttachments(
    attachments: List<Attachment>,
    type: MessageType,
    urlBuilder: MediaUrlBuilder,
    modifier: Modifier = Modifier,
    messageId: String? = null,
    /** Запрос расшифровки голосового/кружка по messageId (для кнопки «Расшифровать»). */
    onTranscribe: (suspend (String) -> String)? = null,
) {
    if (attachments.isEmpty()) return
    val first = attachments.first()

    when (type) {
        MessageType.ALBUM -> {
            // Альбом: вертикальная колонка картинок.
            Column(
                modifier = modifier,
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                attachments.forEach { att ->
                    ImageAttachment(att, urlBuilder)
                }
            }
        }

        MessageType.IMAGE -> ImageAttachment(first, urlBuilder, modifier)
        MessageType.VIDEO -> VideoAttachment(first, urlBuilder, modifier)
        MessageType.CIRCLE_VIDEO ->
            CircleAttachment(first, urlBuilder, modifier, messageId, onTranscribe)
        MessageType.AUDIO ->
            VoiceAttachment(first, urlBuilder, modifier, messageId, onTranscribe)
        else -> {
            // FILE и всё прочее — уточняем по mime: картинка/видео/аудио могут
            // приходить с обобщённым типом, иначе показываем как файл.
            when {
                first.mimeType.startsWith("image/") -> ImageAttachment(first, urlBuilder, modifier)
                first.mimeType.startsWith("video/") -> VideoAttachment(first, urlBuilder, modifier)
                first.mimeType.startsWith("audio/") ->
                    VoiceAttachment(first, urlBuilder, modifier, messageId, onTranscribe)
                else -> FileAttachment(first, urlBuilder, modifier)
            }
        }
    }
}

/** Изображение: превью (thumbnail) с сохранением соотношения сторон. */
@Composable
private fun ImageAttachment(
    att: Attachment,
    urlBuilder: MediaUrlBuilder,
    modifier: Modifier = Modifier,
) {
    val aspect = aspectRatioOf(att)
    var imageModifier = modifier
        .heightIn(max = 280.dp)
        .clip(RoundedCornerShape(12.dp))
    if (aspect != null) {
        imageModifier = imageModifier.aspectRatio(aspect)
    }
    AsyncImage(
        model = urlBuilder.thumbnailUrl(att.thumbnailKey, att.storageKey),
        contentDescription = stringResource(R.string.media_image),
        contentScale = ContentScale.Crop,
        modifier = imageModifier,
    )
}

/**
 * Видео: до клика — превью + кнопка Play; после клика — встроенный PlayerView
 * с автозапуском.
 */
@OptIn(UnstableApi::class)
@Composable
private fun VideoAttachment(
    att: Attachment,
    urlBuilder: MediaUrlBuilder,
    modifier: Modifier = Modifier,
) {
    var isPlaying by remember { mutableStateOf(false) }
    val aspect = aspectRatioOf(att)
    var boxModifier = modifier
        .heightIn(max = 280.dp)
        .clip(RoundedCornerShape(12.dp))
    if (aspect != null) {
        boxModifier = boxModifier.aspectRatio(aspect)
    }

    Box(modifier = boxModifier, contentAlignment = Alignment.Center) {
        if (isPlaying) {
            val exo = rememberExoPlayer(urlBuilder.url(att.storageKey), playWhenReady = true)
            AndroidView(
                factory = { ctx ->
                    PlayerView(ctx).apply {
                        player = exo
                        useController = true
                    }
                },
                modifier = Modifier.fillMaxSize(),
            )
        } else {
            AsyncImage(
                model = urlBuilder.thumbnailUrl(att.thumbnailKey, att.storageKey),
                contentDescription = stringResource(R.string.media_video),
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
            PlayBadge(
                contentDescription = stringResource(R.string.media_play),
                modifier = Modifier.clickable { isPlaying = true },
            )
        }
    }
}

/**
 * Кружок (видеосообщение): круглый плеер. До клика — превью с кнопкой Play,
 * после — зацикленное воспроизведение с переключением play/pause по клику.
 */
@OptIn(UnstableApi::class)
@Composable
private fun CircleAttachment(
    att: Attachment,
    urlBuilder: MediaUrlBuilder,
    modifier: Modifier = Modifier,
    messageId: String? = null,
    onTranscribe: (suspend (String) -> String)? = null,
) {
    var started by remember { mutableStateOf(false) }

    Column(modifier = modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Box(
            modifier = Modifier
                .size(220.dp)
                .clip(CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            if (started) {
                val exo = rememberExoPlayer(
                    urlBuilder.url(att.storageKey),
                    playWhenReady = true,
                    repeat = true,
                )
                AndroidView(
                    factory = { ctx ->
                        PlayerView(ctx).apply {
                            player = exo
                            useController = false
                        }
                    },
                    modifier = Modifier.fillMaxSize(),
                )
                // Прозрачный слой для тапа play/pause поверх кружка.
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .clickable {
                            if (exo.isPlaying) exo.pause() else exo.play()
                        },
                )
            } else {
                AsyncImage(
                    model = urlBuilder.thumbnailUrl(att.thumbnailKey, att.storageKey),
                    contentDescription = stringResource(R.string.media_circle),
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize(),
                )
                PlayBadge(
                    contentDescription = stringResource(R.string.media_circle),
                    modifier = Modifier.clickable { started = true },
                )
            }
        }
        // Кнопка «Расшифровать» под кружком (как в вебе).
        TranscribeBlock(att.transcript, messageId, onTranscribe)
    }
}

/**
 * Голосовое сообщение: кнопка play/pause, визуализация waveform и длительность.
 * При наличии транскрипта показывает его приглушённым текстом ниже.
 */
@Composable
private fun VoiceAttachment(
    att: Attachment,
    urlBuilder: MediaUrlBuilder,
    modifier: Modifier = Modifier,
    messageId: String? = null,
    onTranscribe: (suspend (String) -> String)? = null,
) {
    val player = rememberExoPlayer(urlBuilder.url(att.storageKey))
    var isPlaying by remember { mutableStateOf(false) }

    // Слушатель плеера: синхронизируем локальный isPlaying с реальным состоянием.
    DisposableEffect(player) {
        val listener = object : Player.Listener {
            override fun onIsPlayingChanged(playing: Boolean) {
                isPlaying = playing
            }
        }
        player.addListener(listener)
        onDispose { player.removeListener(listener) }
    }

    Column(modifier = modifier) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(
                onClick = { if (player.isPlaying) player.pause() else player.play() },
            ) {
                Icon(
                    imageVector = if (isPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow,
                    contentDescription = stringResource(R.string.media_voice),
                )
            }
            Waveform(
                waveform = att.waveform,
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.weight(1f),
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = formatDuration(att.durationMs),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        // Кнопка «Расшифровать» / показ транскрипта (как в вебе).
        TranscribeBlock(att.transcript, messageId, onTranscribe)
    }
}

/**
 * Блок расшифровки голосового/кружка: кнопка «Расшифровать» (если транскрипта
 * ещё нет) или toggle «Показать/Скрыть текст». При запросе — спиннер, при
 * ошибке — приглушённое сообщение. Зеркалит web-поведение TranscriptButton.
 */
@Composable
private fun TranscribeBlock(
    existingTranscript: String?,
    messageId: String?,
    onTranscribe: (suspend (String) -> String)?,
) {
    // Без возможности запроса и без готового текста кнопку не показываем.
    if (messageId == null || onTranscribe == null) {
        existingTranscript?.let { TranscriptText(it) }
        return
    }

    val scope = androidx.compose.runtime.rememberCoroutineScope()
    var transcript by remember(messageId) { mutableStateOf(existingTranscript) }
    var expanded by remember(messageId) { mutableStateOf(existingTranscript != null) }
    var loading by remember(messageId) { mutableStateOf(false) }
    var error by remember(messageId) { mutableStateOf(false) }

    Column(modifier = Modifier.padding(top = 4.dp)) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.clickable(enabled = !loading) {
                val current = transcript
                if (current != null) {
                    expanded = !expanded
                } else {
                    loading = true
                    error = false
                    scope.launch {
                        runCatching { onTranscribe(messageId) }
                            .onSuccess { transcript = it; expanded = true }
                            .onFailure { error = true }
                        loading = false
                    }
                }
            },
        ) {
            if (loading) {
                androidx.compose.material3.CircularProgressIndicator(
                    modifier = Modifier.size(14.dp),
                    strokeWidth = 2.dp,
                    color = MaterialTheme.colorScheme.primary,
                )
                Spacer(Modifier.width(6.dp))
            }
            val label = when {
                loading -> stringResource(R.string.transcribe_loading)
                transcript == null -> stringResource(R.string.transcribe_action)
                expanded -> stringResource(R.string.transcribe_hide)
                else -> stringResource(R.string.transcribe_show)
            }
            Text(
                text = label,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.primary,
            )
        }
        if (error) {
            Text(
                text = stringResource(R.string.transcribe_error),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.padding(top = 2.dp),
            )
        }
        val shown = transcript
        if (expanded && shown != null) TranscriptText(shown)
    }
}

/** Приглушённый текст расшифровки под медиа. */
@Composable
private fun TranscriptText(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(top = 4.dp),
    )
}

/** Файл: иконка, имя и размер; по клику открывается системным интентом. */
@Composable
private fun FileAttachment(
    att: Attachment,
    urlBuilder: MediaUrlBuilder,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(12.dp))
            .clickable {
                runCatching {
                    val intent = Intent(Intent.ACTION_VIEW).apply {
                        data = Uri.parse(urlBuilder.url(att.storageKey))
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    context.startActivity(intent)
                }
            }
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = Icons.Filled.InsertDriveFile,
            contentDescription = stringResource(R.string.media_file_open),
            tint = MaterialTheme.colorScheme.primary,
        )
        Spacer(modifier = Modifier.width(8.dp))
        Column {
            Text(
                text = att.fileName ?: "Файл",
                style = MaterialTheme.typography.bodyMedium,
            )
            Text(
                text = formatSize(att.sizeBytes),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

/** Круглый бейдж с иконкой Play поверх превью видео/кружка. */
@Composable
private fun PlayBadge(
    contentDescription: String?,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .size(56.dp)
            .clip(CircleShape)
            .background(Color.Black.copy(alpha = 0.45f)),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = Icons.Filled.PlayArrow,
            contentDescription = contentDescription,
            tint = Color.White,
            modifier = Modifier.size(32.dp),
        )
    }
}

/** Простая визуализация waveform: вертикальные столбики, нормализованные к высоте. */
@Composable
private fun Waveform(
    waveform: List<Float>,
    color: Color,
    modifier: Modifier = Modifier,
) {
    if (waveform.isEmpty()) {
        // Нет данных — рисуем тонкую линию-плейсхолдер.
        Box(
            modifier = modifier
                .heightIn(min = 2.dp)
                .fillMaxWidth()
                .padding(vertical = 15.dp)
                .clip(RoundedCornerShape(1.dp))
                .background(color.copy(alpha = 0.4f)),
        )
        return
    }
    // Бэкенд уже нормализует значения в 0..1; на всякий случай страхуемся от
    // выбросов делением на фактический максимум (не меньше 1.0).
    val maxValue = max(1f, waveform.maxOrNull() ?: 1f)
    Row(
        modifier = modifier.heightIn(max = 32.dp),
        horizontalArrangement = Arrangement.spacedBy(2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        waveform.forEach { value ->
            // Нормализуем к диапазону [4.dp, 32.dp].
            val fraction = value.coerceIn(0f, maxValue) / maxValue
            val barHeight = (4f + fraction * 28f).dp
            Box(
                modifier = Modifier
                    .weight(1f)
                    .heightIn(min = barHeight, max = barHeight)
                    .clip(RoundedCornerShape(1.dp))
                    .background(color),
            )
        }
    }
}

/** Соотношение сторон вложения (ширина/высота), если оба размера заданы и валидны. */
private fun aspectRatioOf(att: Attachment): Float? {
    val w = att.width ?: return null
    val h = att.height ?: return null
    if (w <= 0 || h <= 0) return null
    return w.toFloat() / h.toFloat()
}

/** Форматирует длительность в миллисекундах как "m:ss". */
private fun formatDuration(durationMs: Int?): String {
    val totalSeconds = ((durationMs ?: 0) / 1000)
    val minutes = totalSeconds / 60
    val seconds = totalSeconds % 60
    return "%d:%02d".format(minutes, seconds)
}

/** Форматирует размер в байтах как "X Б"/"X.X КБ"/"X.X МБ". */
private fun formatSize(bytes: Long?): String {
    val b = bytes ?: return ""
    return when {
        b < 1024 -> "$b Б"
        b < 1024 * 1024 -> "${(b / 1024.0).roundOneDecimal()} КБ"
        else -> "${(b / (1024.0 * 1024.0)).roundOneDecimal()} МБ"
    }
}

/** Округляет до одного знака после запятой и убирает хвостовой ".0". */
private fun Double.roundOneDecimal(): String {
    val rounded = (this * 10).roundToInt() / 10.0
    return if (rounded % 1.0 == 0.0) rounded.toInt().toString() else rounded.toString()
}
