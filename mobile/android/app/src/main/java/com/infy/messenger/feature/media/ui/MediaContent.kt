package com.infy.messenger.feature.media.ui

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTransformGestures
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
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChevronLeft
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Close
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
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
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
import kotlinx.coroutines.launch
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
    /** Своё сообщение — пузырь с фиолетовым градиентом; меняем цвета медиа на белые. */
    isOwn: Boolean = false,
    /** Запрос расшифровки голосового/кружка по messageId (для кнопки «Расшифровать»). */
    onTranscribe: (suspend (String) -> String)? = null,
) {
    if (attachments.isEmpty()) return
    val first = attachments.first()

    // Лайтбокс: индекс открытого вложения в [attachments] или null (закрыт).
    var lightboxIndex by remember(attachments) { mutableStateOf<Int?>(null) }

    when (type) {
        MessageType.ALBUM -> {
            // Альбом: вертикальная колонка картинок. Тап по любой — лайтбокс
            // с навигацией по всему альбому.
            Column(
                modifier = modifier,
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                attachments.forEachIndexed { index, att ->
                    ImageAttachment(att, urlBuilder, onClick = { lightboxIndex = index })
                }
            }
        }

        MessageType.IMAGE -> ImageAttachment(first, urlBuilder, modifier, onClick = { lightboxIndex = 0 })
        MessageType.VIDEO -> VideoAttachment(first, urlBuilder, modifier, onOpen = { lightboxIndex = 0 })
        MessageType.CIRCLE_VIDEO ->
            CircleAttachment(first, urlBuilder, modifier, messageId, isOwn, onTranscribe)
        MessageType.AUDIO ->
            VoiceAttachment(first, urlBuilder, modifier, messageId, isOwn, onTranscribe)
        else -> {
            // FILE и всё прочее — уточняем по mime: картинка/видео/аудио могут
            // приходить с обобщённым типом, иначе показываем как файл.
            when {
                first.mimeType.startsWith("image/") ->
                    ImageAttachment(first, urlBuilder, modifier, onClick = { lightboxIndex = 0 })
                first.mimeType.startsWith("video/") ->
                    VideoAttachment(first, urlBuilder, modifier, onOpen = { lightboxIndex = 0 })
                first.mimeType.startsWith("audio/") ->
                    VoiceAttachment(first, urlBuilder, modifier, messageId, isOwn, onTranscribe)
                else -> FileAttachment(first, urlBuilder, modifier)
            }
        }
    }

    // Полноэкранный просмотрщик фото/видео (как лайтбокс в вебе).
    lightboxIndex?.let { idx ->
        val items = remember(attachments) {
            attachments.map { LightboxItem(urlBuilder.url(it.storageKey), it.mimeType.startsWith("video/")) }
        }
        MediaLightbox(
            items = items,
            index = idx,
            onIndex = { lightboxIndex = it },
            onClose = { lightboxIndex = null },
        )
    }
}

/** Изображение: превью (thumbnail) с сохранением соотношения сторон. Тап — лайтбокс. */
@Composable
private fun ImageAttachment(
    att: Attachment,
    urlBuilder: MediaUrlBuilder,
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
) {
    val aspect = aspectRatioOf(att)
    var imageModifier = modifier
        .heightIn(max = 280.dp)
        .clip(RoundedCornerShape(12.dp))
    if (aspect != null) {
        imageModifier = imageModifier.aspectRatio(aspect)
    }
    if (onClick != null) {
        imageModifier = imageModifier.clickable(onClick = onClick)
    }
    AsyncImage(
        model = urlBuilder.thumbnailUrl(att.thumbnailKey, att.storageKey),
        contentDescription = stringResource(R.string.media_image),
        contentScale = ContentScale.Crop,
        modifier = imageModifier,
    )
}

/**
 * Видео: превью + кнопка Play. Тап открывает полноэкранный лайтбокс с
 * автозапуском (как в вебе), а не встроенный плеер в пузыре.
 */
@Composable
private fun VideoAttachment(
    att: Attachment,
    urlBuilder: MediaUrlBuilder,
    modifier: Modifier = Modifier,
    onOpen: (() -> Unit)? = null,
) {
    val aspect = aspectRatioOf(att)
    var boxModifier = modifier
        .heightIn(max = 280.dp)
        .clip(RoundedCornerShape(12.dp))
    if (aspect != null) {
        boxModifier = boxModifier.aspectRatio(aspect)
    }
    if (onOpen != null) {
        boxModifier = boxModifier.clickable(onClick = onOpen)
    }

    Box(modifier = boxModifier, contentAlignment = Alignment.Center) {
        AsyncImage(
            model = urlBuilder.thumbnailUrl(att.thumbnailKey, att.storageKey),
            contentDescription = stringResource(R.string.media_video),
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize(),
        )
        PlayBadge(contentDescription = stringResource(R.string.media_play))
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
    isOwn: Boolean = false,
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
        TranscribeBlock(att.transcript, messageId, isOwn, onTranscribe)
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
    isOwn: Boolean = false,
    onTranscribe: (suspend (String) -> String)? = null,
) {
    val player = rememberExoPlayer(urlBuilder.url(att.storageKey))
    var isPlaying by remember { mutableStateOf(false) }

    // Цвета медиа подбираем под фон пузыря: у своих (фиолетовый градиент) — белые,
    // иначе фиолетовый акцент сольётся с фоном. У чужих — обычный акцент/приглушённый.
    val accentColor = if (isOwn) Color.White else MaterialTheme.colorScheme.primary
    val mutedColor = if (isOwn) Color.White.copy(alpha = 0.75f) else MaterialTheme.colorScheme.onSurfaceVariant

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
                    tint = accentColor,
                )
            }
            Waveform(
                waveform = att.waveform,
                color = accentColor,
                modifier = Modifier.weight(1f),
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = formatDuration(att.durationMs),
                style = MaterialTheme.typography.labelSmall,
                color = mutedColor,
            )
        }
        // Кнопка «Расшифровать» / показ транскрипта (как в вебе).
        TranscribeBlock(att.transcript, messageId, isOwn, onTranscribe)
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
    isOwn: Boolean = false,
    onTranscribe: (suspend (String) -> String)?,
) {
    val accentColor = if (isOwn) Color.White else MaterialTheme.colorScheme.primary
    // Без возможности запроса и без готового текста кнопку не показываем.
    if (messageId == null || onTranscribe == null) {
        existingTranscript?.let { TranscriptText(it, isOwn) }
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
                    color = accentColor,
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
                color = accentColor,
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
        if (expanded && shown != null) TranscriptText(shown, isOwn)
    }
}

/** Приглушённый текст расшифровки под медиа. */
@Composable
private fun TranscriptText(text: String, isOwn: Boolean = false) {
    Text(
        text = text,
        style = MaterialTheme.typography.bodySmall,
        color = if (isOwn) Color.White.copy(alpha = 0.85f) else MaterialTheme.colorScheme.onSurfaceVariant,
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

/** Элемент лайтбокса: прямой URL медиа и признак «это видео». */
data class LightboxItem(val url: String, val isVideo: Boolean)

/**
 * Полноэкранный просмотрщик медиа (лайтбокс), зеркалит web MediaLightbox:
 * затемнённый фон, крестик и счётчик сверху, стрелки влево/вправо для альбома.
 * Фото — вписывается (Fit) с возможностью зума щипком; видео — PlayerView с
 * контролами и автозапуском. Закрытие — крестик, тап по фону или системный
 * «Назад».
 */
@OptIn(UnstableApi::class)
@Composable
fun MediaLightbox(
    items: List<LightboxItem>,
    index: Int,
    onIndex: (Int) -> Unit,
    onClose: () -> Unit,
) {
    val item = items.getOrNull(index) ?: return
    val isVideo = item.isVideo
    val hasPrev = index > 0
    val hasNext = index < items.size - 1

    androidx.compose.ui.window.Dialog(
        onDismissRequest = onClose,
        properties = androidx.compose.ui.window.DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = 0.96f))
                .clickable(
                    indication = null,
                    interactionSource = remember { androidx.compose.foundation.interaction.MutableInteractionSource() },
                    onClick = onClose,
                ),
            contentAlignment = Alignment.Center,
        ) {
            // Контент по центру; клик по нему не закрывает (поглощаем).
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = 8.dp, vertical = 64.dp),
                contentAlignment = Alignment.Center,
            ) {
                if (isVideo) {
                    val exo = rememberExoPlayer(item.url, playWhenReady = true)
                    AndroidView(
                        factory = { ctx ->
                            PlayerView(ctx).apply {
                                player = exo
                                useController = true
                            }
                        },
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable(
                                indication = null,
                                interactionSource = remember {
                                    androidx.compose.foundation.interaction.MutableInteractionSource()
                                },
                                onClick = {},
                            ),
                    )
                } else {
                    ZoomableImage(
                        model = item.url,
                        modifier = Modifier.fillMaxSize(),
                    )
                }
            }

            // Верхняя панель: счётчик + крестик (учитываем вырез сверху).
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .align(Alignment.TopCenter)
                    .statusBarsPadding()
                    .padding(horizontal = 12.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    text = if (items.size > 1) "${index + 1} / ${items.size}" else "",
                    color = Color.White.copy(alpha = 0.7f),
                    style = MaterialTheme.typography.bodyMedium,
                )
                IconButton(onClick = onClose) {
                    Box(
                        modifier = Modifier
                            .size(40.dp)
                            .clip(CircleShape)
                            .background(Color.White.copy(alpha = 0.12f)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            imageVector = Icons.Filled.Close,
                            contentDescription = stringResource(R.string.lightbox_close),
                            tint = Color.White,
                        )
                    }
                }
            }

            // Стрелки навигации по альбому.
            if (hasPrev) {
                LightboxArrow(
                    icon = Icons.Filled.ChevronLeft,
                    onClick = { onIndex(index - 1) },
                    modifier = Modifier.align(Alignment.CenterStart).padding(start = 8.dp),
                )
            }
            if (hasNext) {
                LightboxArrow(
                    icon = Icons.Filled.ChevronRight,
                    onClick = { onIndex(index + 1) },
                    modifier = Modifier.align(Alignment.CenterEnd).padding(end = 8.dp),
                )
            }
        }
    }
}

/** Изображение во весь экран с зумом щипком и панорамированием (Fit). */
@Composable
private fun ZoomableImage(model: String, modifier: Modifier = Modifier) {
    var scale by remember { mutableStateOf(1f) }
    var offset by remember { mutableStateOf(Offset.Zero) }
    AsyncImage(
        model = model,
        contentDescription = null,
        contentScale = ContentScale.Fit,
        modifier = modifier
            .pointerInput(Unit) {
                detectTransformGestures { _, pan, zoom, _ ->
                    scale = (scale * zoom).coerceIn(1f, 5f)
                    offset = if (scale > 1f) offset + pan else Offset.Zero
                }
            }
            .graphicsLayer {
                scaleX = scale
                scaleY = scale
                translationX = offset.x
                translationY = offset.y
            },
    )
}

/** Круглая стрелка навигации лайтбокса (влево/вправо). */
@Composable
private fun LightboxArrow(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .size(44.dp)
            .clip(CircleShape)
            .background(Color.Black.copy(alpha = 0.4f))
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = null, tint = Color.White)
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
