package com.infy.messenger.feature.chat.ui.conversation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.infy.messenger.R
import com.infy.messenger.core.util.formatMessageTime
import com.infy.messenger.feature.chat.domain.ChatMessage
import com.infy.messenger.feature.chat.domain.DeliveryStatus
import com.infy.messenger.feature.chat.domain.MessageType
import androidx.compose.ui.res.stringResource
import kotlinx.coroutines.flow.distinctUntilChanged

/**
 * Экран переписки: история сообщений с курсорной пагинацией вверх,
 * пузыри с ответами/реакциями/статусами доставки, индикатор «печатает…»,
 * отметка прочитанного и composer для отправки текста.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConversationScreen(
    onNavigateBack: () -> Unit,
    onOpenCircleRecorder: () -> Unit,
    viewModel: ConversationViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val uploadProgress by viewModel.uploadProgress.collectAsStateWithLifecycle()
    val isRecording by viewModel.isRecordingVoice.collectAsStateWithLifecycle()
    val listState = rememberLazyListState()
    val context = androidx.compose.ui.platform.LocalContext.current

    // Выбор фото/видео из системного Photo Picker.
    val mediaPicker = androidx.activity.compose.rememberLauncherForActivityResult(
        androidx.activity.result.contract.ActivityResultContracts.PickVisualMedia(),
    ) { uri ->
        if (uri != null) {
            val mime = context.contentResolver.getType(uri).orEmpty()
            val kind = if (mime.startsWith("video")) {
                com.infy.messenger.feature.media.domain.MediaKind.VIDEO
            } else {
                com.infy.messenger.feature.media.domain.MediaKind.IMAGE
            }
            viewModel.sendMedia(uri, kind)
        }
    }
    // Выбор произвольного файла.
    val filePicker = androidx.activity.compose.rememberLauncherForActivityResult(
        androidx.activity.result.contract.ActivityResultContracts.GetContent(),
    ) { uri ->
        if (uri != null) viewModel.sendMedia(uri, com.infy.messenger.feature.media.domain.MediaKind.FILE)
    }
    // Разрешение на запись голосовых.
    val micPermission = androidx.activity.compose.rememberLauncherForActivityResult(
        androidx.activity.result.contract.ActivityResultContracts.RequestPermission(),
    ) { granted -> if (granted) viewModel.startVoiceRecording() }

    // Разрешения для звонка: аудио — всегда, камера — для видео. Запоминаем тип.
    var pendingVideoCall by remember { mutableStateOf<Boolean?>(null) }
    val callPermissions = androidx.activity.compose.rememberLauncherForActivityResult(
        androidx.activity.result.contract.ActivityResultContracts.RequestMultiplePermissions(),
    ) { result ->
        val micOk = result[android.Manifest.permission.RECORD_AUDIO] == true
        val video = pendingVideoCall
        pendingVideoCall = null
        if (micOk && video != null) viewModel.startCall(video)
    }
    fun requestCall(video: Boolean) {
        pendingVideoCall = video
        val perms = if (video) {
            arrayOf(android.Manifest.permission.RECORD_AUDIO, android.Manifest.permission.CAMERA)
        } else {
            arrayOf(android.Manifest.permission.RECORD_AUDIO)
        }
        callPermissions.launch(perms)
    }

    // Подгрузка истории: когда доскроллили почти до самых старых сообщений (низ
    // отрисовки при reverseLayout = конец списка) и есть ещё страницы — грузим.
    LaunchedEffect(listState, uiState.hasMoreHistory) {
        snapshotFlow { listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index }
            .distinctUntilChanged()
            .collect { lastIndex ->
                val total = uiState.messages.size
                if (lastIndex != null && uiState.hasMoreHistory && lastIndex >= total - 3) {
                    viewModel.loadMore()
                }
            }
    }

    // Отметка прочитанного: самое новое сообщение — последнее в списке (он по возрастанию).
    LaunchedEffect(uiState.messages) {
        val newest = uiState.messages.lastOrNull()
        if (newest != null && !newest.isOwn && newest.id.isNotBlank()) {
            viewModel.markRead(newest.id)
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    // Название чата недоступно — показываем «печатает…» либо пусто.
                    Text(if (uiState.partnerTyping) stringResource(R.string.chat_typing) else "")
                },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(R.string.chat_back),
                        )
                    }
                },
                actions = {
                    IconButton(onClick = { requestCall(video = false) }) {
                        Icon(
                            imageVector = Icons.Filled.Call,
                            contentDescription = stringResource(R.string.call_start_audio),
                        )
                    }
                    IconButton(onClick = { requestCall(video = true) }) {
                        Icon(
                            imageVector = Icons.Filled.Videocam,
                            contentDescription = stringResource(R.string.call_start_video),
                        )
                    }
                },
            )
        },
        bottomBar = {
            Composer(
                uploadProgress = uploadProgress,
                isRecording = isRecording,
                onTyping = viewModel::onTyping,
                onSend = { viewModel.sendMessage(it) },
                onPickMedia = {
                    mediaPicker.launch(
                        androidx.activity.result.PickVisualMediaRequest(
                            androidx.activity.result.contract.ActivityResultContracts
                                .PickVisualMedia.ImageAndVideo,
                        ),
                    )
                },
                onPickFile = { filePicker.launch("*/*") },
                onRecordVoiceStart = {
                    micPermission.launch(android.Manifest.permission.RECORD_AUDIO)
                },
                onRecordVoiceStop = { viewModel.stopAndSendVoice() },
                onRecordVoiceCancel = { viewModel.cancelVoiceRecording() },
                onOpenCircle = onOpenCircleRecorder,
            )
        },
    ) { innerPadding ->
        LazyColumn(
            state = listState,
            reverseLayout = true,
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            // Сообщения в uiState идут по возрастанию времени; при reverseLayout
            // рисуем их в обратном порядке (самое новое — снизу).
            items(
                items = uiState.messages.reversed(),
                key = { it.clientMessageId ?: it.id },
            ) { message ->
                MessageBubble(
                    message = message,
                    urlBuilder = viewModel.mediaUrlBuilder,
                    onRetry = { clientId -> viewModel.retry(clientId) },
                )
            }

            // Верхний элемент при reverseLayout = последний item: индикатор/ошибка истории.
            if (uiState.isLoadingHistory) {
                item(key = "history-loading") {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.Center,
                    ) {
                        CircularProgressIndicator(modifier = Modifier.padding(8.dp))
                    }
                }
            } else if (uiState.loadError) {
                item(key = "history-error") {
                    Text(
                        text = stringResource(R.string.chat_load_error),
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(8.dp),
                    )
                }
            }
        }
    }
}

/** Типы сообщений, у которых основной носитель — текст. */
private val TEXT_LIKE_TYPES = setOf(
    MessageType.TEXT,
    MessageType.SYSTEM,
    MessageType.AI,
    MessageType.AI_QUERY,
)

/** Пузырь одного сообщения. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun MessageBubble(
    message: ChatMessage,
    urlBuilder: com.infy.messenger.core.media.MediaUrlBuilder,
    onRetry: (clientMessageId: String) -> Unit,
) {
    val isOwn = message.isOwn
    val bubbleColor = if (isOwn) {
        MaterialTheme.colorScheme.primary
    } else {
        MaterialTheme.colorScheme.surfaceVariant
    }
    val contentColor = if (isOwn) {
        MaterialTheme.colorScheme.onPrimary
    } else {
        MaterialTheme.colorScheme.onSurfaceVariant
    }

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (isOwn) Arrangement.End else Arrangement.Start,
    ) {
        Surface(
            color = bubbleColor,
            contentColor = contentColor,
            shape = MaterialTheme.shapes.medium, // скругление ~16.dp
            tonalElevation = 1.dp,
            modifier = Modifier.widthIn(max = 300.dp),
        ) {
            Column(modifier = Modifier.padding(10.dp)) {
                // Блок-цитата (ответ на сообщение).
                val reply = message.replyTo
                if (reply != null) {
                    Surface(
                        color = MaterialTheme.colorScheme.surface.copy(alpha = 0.35f),
                        contentColor = contentColor,
                        shape = MaterialTheme.shapes.small,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(bottom = 6.dp),
                    ) {
                        Column(modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)) {
                            Text(
                                text = reply.senderNickname,
                                style = MaterialTheme.typography.labelMedium,
                                fontWeight = FontWeight.Bold,
                            )
                            Text(
                                text = if (reply.deleted) "—" else reply.content.orEmpty(),
                                style = MaterialTheme.typography.bodySmall,
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                }

                // Вложения (изображение/видео/голосовое/кружок/файл).
                if (message.attachments.isNotEmpty()) {
                    com.infy.messenger.feature.media.ui.MessageAttachments(
                        attachments = message.attachments,
                        type = message.type,
                        urlBuilder = urlBuilder,
                        modifier = Modifier.padding(bottom = if (message.content.isNullOrBlank()) 0.dp else 6.dp),
                    )
                }

                // Текстовый контент / подпись (если есть).
                val isTextType = message.type in TEXT_LIKE_TYPES
                if (isTextType || !message.content.isNullOrBlank()) {
                    val text = message.content.orEmpty()
                    if (text.isNotEmpty()) {
                        Text(text = text, style = MaterialTheme.typography.bodyLarge)
                    }
                }

                // Реакции.
                if (message.reactions.isNotEmpty()) {
                    FlowRow(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 4.dp),
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        message.reactions.forEach { reaction ->
                            Surface(
                                color = MaterialTheme.colorScheme.surface.copy(alpha = 0.4f),
                                contentColor = contentColor,
                                shape = MaterialTheme.shapes.small,
                            ) {
                                Text(
                                    text = "${reaction.emoji} ${reaction.count}",
                                    style = MaterialTheme.typography.labelSmall,
                                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                                )
                            }
                        }
                    }
                }

                // Нижняя строка: время, метка «изменено», статус доставки.
                MessageMeta(
                    message = message,
                    contentColor = contentColor,
                    onRetry = onRetry,
                )
            }
        }
    }
}

/** Нижняя строка пузыря: время + «изменено» + статус для исходящих. */
@Composable
private fun MessageMeta(
    message: ChatMessage,
    contentColor: androidx.compose.ui.graphics.Color,
    onRetry: (clientMessageId: String) -> Unit,
) {
    val mutedColor = contentColor.copy(alpha = 0.7f)

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 4.dp),
        horizontalArrangement = Arrangement.End,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        val timeLabel = buildString {
            append(formatMessageTime(message.createdAt))
            if (message.editedAt != null) {
                append(" · ")
                append(stringResource(R.string.chat_edited))
            }
        }
        Text(
            text = timeLabel,
            style = MaterialTheme.typography.labelSmall,
            color = mutedColor,
        )

        if (message.isOwn) {
            val statusText: String? = when (message.deliveryStatus) {
                DeliveryStatus.SENDING -> stringResource(R.string.chat_status_sending)
                DeliveryStatus.FAILED -> stringResource(R.string.chat_status_failed)
                DeliveryStatus.READ -> stringResource(R.string.chat_status_read)
                DeliveryStatus.SENT -> "✓"
            }
            if (statusText != null) {
                val clientId = message.clientMessageId
                val statusModifier = if (
                    message.deliveryStatus == DeliveryStatus.FAILED && clientId != null
                ) {
                    Modifier
                        .padding(start = 6.dp)
                        .clickable { onRetry(clientId) }
                } else {
                    Modifier.padding(start = 6.dp)
                }
                Text(
                    text = statusText,
                    style = MaterialTheme.typography.labelSmall,
                    color = if (message.deliveryStatus == DeliveryStatus.FAILED) {
                        MaterialTheme.colorScheme.error
                    } else {
                        mutedColor
                    },
                    modifier = statusModifier,
                )
            }
        }
    }
}

/**
 * Нижняя панель ввода: текст + действия. Когда поле пустое — показываем кнопки
 * вложения, кружка и микрофона (удержание = запись голосового). Когда есть текст —
 * кнопку отправки. Сверху — индикатор загрузки вложения, если идёт upload.
 */
@Composable
private fun Composer(
    uploadProgress: Float?,
    isRecording: Boolean,
    onTyping: () -> Unit,
    onSend: (String) -> Unit,
    onPickMedia: () -> Unit,
    onPickFile: () -> Unit,
    onRecordVoiceStart: () -> Unit,
    onRecordVoiceStop: () -> Unit,
    onRecordVoiceCancel: () -> Unit,
    onOpenCircle: () -> Unit,
) {
    var text by remember { mutableStateOf("") }
    var menuOpen by remember { mutableStateOf(false) }
    val hasText = text.isNotBlank()

    Surface(tonalElevation = 3.dp) {
        Column {
            // Прогресс загрузки вложения.
            if (uploadProgress != null) {
                androidx.compose.material3.LinearProgressIndicator(
                    progress = { uploadProgress },
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            if (isRecording) {
                // Режим записи голосового: подсказка + отмена + отправка.
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 12.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        imageVector = Icons.Filled.Mic,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.error,
                    )
                    Text(
                        text = stringResource(R.string.media_recording),
                        modifier = Modifier
                            .weight(1f)
                            .padding(start = 8.dp),
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    androidx.compose.material3.TextButton(onClick = onRecordVoiceCancel) {
                        Text(stringResource(R.string.media_cancel))
                    }
                    IconButton(onClick = onRecordVoiceStop) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.Send,
                            contentDescription = stringResource(R.string.chat_send),
                        )
                    }
                }
            } else {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 8.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    // Меню вложений.
                    Box {
                        IconButton(onClick = { menuOpen = true }) {
                            Icon(
                                imageVector = Icons.Filled.Add,
                                contentDescription = stringResource(R.string.media_attach),
                            )
                        }
                        androidx.compose.material3.DropdownMenu(
                            expanded = menuOpen,
                            onDismissRequest = { menuOpen = false },
                        ) {
                            androidx.compose.material3.DropdownMenuItem(
                                text = { Text(stringResource(R.string.media_pick_gallery)) },
                                onClick = { menuOpen = false; onPickMedia() },
                            )
                            androidx.compose.material3.DropdownMenuItem(
                                text = { Text(stringResource(R.string.media_pick_file)) },
                                onClick = { menuOpen = false; onPickFile() },
                            )
                            androidx.compose.material3.DropdownMenuItem(
                                text = { Text(stringResource(R.string.media_record_circle)) },
                                onClick = { menuOpen = false; onOpenCircle() },
                            )
                        }
                    }

                    OutlinedTextField(
                        value = text,
                        onValueChange = {
                            text = it
                            onTyping()
                        },
                        placeholder = { Text(stringResource(R.string.chat_message_hint)) },
                        modifier = Modifier.weight(1f),
                        maxLines = 5,
                    )

                    if (hasText) {
                        IconButton(
                            onClick = { onSend(text); text = "" },
                            modifier = Modifier.padding(start = 4.dp),
                        ) {
                            Icon(
                                imageVector = Icons.AutoMirrored.Filled.Send,
                                contentDescription = stringResource(R.string.chat_send),
                            )
                        }
                    } else {
                        // Удержание кнопки микрофона = запись голосового.
                        IconButton(
                            onClick = { /* старт/стоп через жесты ниже */ },
                            modifier = Modifier
                                .padding(start = 4.dp)
                                .pointerInput(Unit) {
                                    detectTapGestures(
                                        onPress = {
                                            // Запись идёт, пока кнопка удерживается;
                                            // отпускание (или отмена жеста) завершает её.
                                            onRecordVoiceStart()
                                            awaitRelease()
                                            onRecordVoiceStop()
                                        },
                                    )
                                },
                        ) {
                            Icon(
                                imageVector = Icons.Filled.Mic,
                                contentDescription = stringResource(R.string.media_record_voice),
                            )
                        }
                    }
                }
            }
        }
    }
}
