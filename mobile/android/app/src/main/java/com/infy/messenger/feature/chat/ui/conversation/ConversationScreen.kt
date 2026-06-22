package com.infy.messenger.feature.chat.ui.conversation

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChange
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
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
import com.infy.messenger.ui.theme.Aurora
import com.infy.messenger.ui.theme.AuroraBackground
import com.infy.messenger.ui.theme.DockBg
import com.infy.messenger.ui.theme.GlassStroke
import com.infy.messenger.ui.theme.Glass2
import com.infy.messenger.ui.theme.OnlineGreen
import com.infy.messenger.ui.theme.StatusRead
import com.infy.messenger.ui.theme.TextHi
import com.infy.messenger.ui.theme.TextLow
import com.infy.messenger.ui.theme.TextMid
import kotlinx.coroutines.flow.distinctUntilChanged

/**
 * Экран переписки в стиле Aurora: deep-space фон, свои пузыри — брендовый
 * градиент, чужие — стекло, каскадные скругления. Шапка и composer —
 * стеклянные панели. Логика (пагинация, отметка прочитанного, медиа,
 * запись голоса/кружка, звонки) сохранена без изменений.
 */
@Composable
fun ConversationScreen(
    onNavigateBack: () -> Unit,
    onOpenCircleRecorder: () -> Unit,
    onOpenPartnerProfile: (username: String) -> Unit = {},
    onOpenSearch: () -> Unit = {},
    onOpenCalendar: () -> Unit = {},
    onOpenAi: () -> Unit = {},
    onReport: (userId: String) -> Unit = {},
    viewModel: ConversationViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val uploadProgress by viewModel.uploadProgress.collectAsStateWithLifecycle()

    // Пока экран в композиции — отмечаем чат активным (не шлём по нему
    // уведомления и снимаем уже показанные).
    androidx.compose.runtime.DisposableEffect(Unit) {
        viewModel.onScreenActive()
        onDispose { viewModel.onScreenInactive() }
    }
    val isRecording by viewModel.isRecordingVoice.collectAsStateWithLifecycle()
    val listState = rememberLazyListState()
    val context = androidx.compose.ui.platform.LocalContext.current

    // Внутренние панели (как slide-in панели в вебе): календарь, Infy AI, жалоба.
    var showCalendar by remember { mutableStateOf(false) }
    var showAi by remember { mutableStateOf(false) }
    var showReport by remember { mutableStateOf(false) }

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

    AuroraBackground {
        Column(Modifier.fillMaxSize()) {
            ConversationTopBar(
                partnerName = uiState.partnerName,
                partnerAvatarUrl = uiState.partnerAvatarUrl,
                partnerTyping = uiState.partnerTyping,
                partnerOnline = uiState.partnerOnline,
                partnerLastSeenAt = uiState.partnerLastSeenAt,
                onNavigateBack = onNavigateBack,
                onAudioCall = { requestCall(video = false) },
                onVideoCall = { requestCall(video = true) },
                onOpenProfile = {
                    if (uiState.partnerUsername.isNotBlank()) onOpenPartnerProfile(uiState.partnerUsername)
                },
                onOpenSearch = onOpenSearch,
                onOpenCalendar = { showCalendar = true },
                onOpenAi = { showAi = true },
                onReport = { showReport = true },
            )

            LazyColumn(
                state = listState,
                reverseLayout = true,
                modifier = Modifier
                    .weight(1f)
                    .fillMaxSize(),
                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                items(
                    items = uiState.messages.reversed(),
                    key = { it.clientMessageId ?: it.id },
                ) { message ->
                    MessageBubble(
                        message = message,
                        urlBuilder = viewModel.mediaUrlBuilder,
                        onRetry = { clientId -> viewModel.retry(clientId) },
                        onTranscribe = { id -> viewModel.transcribe(id) },
                    )
                }

                if (uiState.isLoadingHistory) {
                    item(key = "history-loading") {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.Center,
                        ) {
                            CircularProgressIndicator(
                                modifier = Modifier.padding(8.dp),
                                color = MaterialTheme.colorScheme.primary,
                            )
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
                                .clickable { viewModel.loadMore() }
                                .padding(8.dp),
                        )
                    }
                }
            }

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
        }

        // Панели поверх чата (slide-in, как в вебе).
        if (showCalendar) {
            com.infy.messenger.feature.calendar.ui.CalendarPanel(
                chatId = viewModel.chatId,
                onClose = { showCalendar = false },
            )
        }
        if (showAi) {
            com.infy.messenger.feature.ai.ui.AiPanel(
                chatId = viewModel.chatId,
                onClose = { showAi = false },
            )
        }
        if (showReport) {
            val targetId = uiState.partnerId
            if (targetId != null) {
                com.infy.messenger.feature.reports.ui.ReportPanel(
                    targetId = targetId,
                    targetName = uiState.partnerName,
                    chatId = viewModel.chatId,
                    onClose = { showReport = false },
                )
            }
        }
    }
}

/**
 * Стеклянная шапка переписки: назад, аватар+имя (тап → профиль собеседника),
 * присутствие («в сети»/«печатает…»/«был(а)…»), звонки, кнопка Infy AI и
 * сэндвич-меню (поиск, календарь, профиль, пожаловаться) — как в вебе.
 */
@Composable
private fun ConversationTopBar(
    partnerName: String,
    partnerAvatarUrl: String?,
    partnerTyping: Boolean,
    partnerOnline: Boolean,
    partnerLastSeenAt: Long?,
    onNavigateBack: () -> Unit,
    onAudioCall: () -> Unit,
    onVideoCall: () -> Unit,
    onOpenProfile: () -> Unit,
    onOpenSearch: () -> Unit,
    onOpenCalendar: () -> Unit,
    onOpenAi: () -> Unit,
    onReport: () -> Unit,
) {
    var menuOpen by remember { mutableStateOf(false) }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(DockBg)
            .border(BorderStroke(1.dp, GlassStroke), RoundedCornerShape(0.dp))
            .statusBarsPadding()
            .padding(horizontal = 4.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(onClick = onNavigateBack) {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                contentDescription = stringResource(R.string.chat_back),
                tint = TextHi,
            )
        }
        // Аватар + имя кликабельны → профиль собеседника (как в вебе).
        Row(
            modifier = Modifier
                .weight(1f)
                .clip(RoundedCornerShape(12.dp))
                .clickable(onClick = onOpenProfile)
                .padding(vertical = 2.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(38.dp)
                    .clip(androidx.compose.foundation.shape.CircleShape)
                    .background(Aurora.brandVertical),
                contentAlignment = Alignment.Center,
            ) {
                if (partnerAvatarUrl != null) {
                    coil.compose.AsyncImage(
                        model = partnerAvatarUrl,
                        contentDescription = null,
                        modifier = Modifier.fillMaxSize(),
                    )
                } else if (partnerName.isNotEmpty()) {
                    Text(
                        text = partnerName.take(1).uppercase(),
                        color = Color.White,
                        style = MaterialTheme.typography.titleMedium,
                    )
                }
                // Зелёная точка онлайна поверх аватара.
                if (partnerOnline) {
                    Box(
                        modifier = Modifier
                            .align(Alignment.BottomEnd)
                            .size(11.dp)
                            .clip(androidx.compose.foundation.shape.CircleShape)
                            .background(DockBg)
                            .padding(2.dp)
                            .clip(androidx.compose.foundation.shape.CircleShape)
                            .background(OnlineGreen),
                    )
                }
            }
            Column(modifier = Modifier.padding(start = 10.dp)) {
                Text(
                    text = partnerName,
                    color = TextHi,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                // Присутствие: «печатает…» > «в сети» > «был(а)…».
                val presence: Pair<String, Color>? = when {
                    partnerTyping -> stringResource(R.string.chat_typing) to
                        MaterialTheme.colorScheme.primary
                    partnerOnline -> stringResource(R.string.chat_online) to OnlineGreen
                    partnerLastSeenAt != null -> formatLastSeen(partnerLastSeenAt) to TextLow
                    else -> null
                }
                if (presence != null) {
                    Text(
                        text = presence.first,
                        color = presence.second,
                        style = MaterialTheme.typography.bodySmall,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
        IconButton(onClick = onAudioCall) {
            Icon(Icons.Filled.Call, stringResource(R.string.call_start_audio), tint = TextMid)
        }
        IconButton(onClick = onVideoCall) {
            Icon(Icons.Filled.Videocam, stringResource(R.string.call_start_video), tint = TextMid)
        }
        // Infy AI — отдельной кнопкой со звездой (как в вебе).
        IconButton(onClick = onOpenAi) {
            Icon(
                Icons.Filled.AutoAwesome,
                stringResource(R.string.ai_title),
                tint = MaterialTheme.colorScheme.primary,
            )
        }
        // Сэндвич-меню.
        Box {
            IconButton(onClick = { menuOpen = true }) {
                Icon(Icons.Filled.MoreVert, stringResource(R.string.chat_menu), tint = TextMid)
            }
            androidx.compose.material3.DropdownMenu(
                expanded = menuOpen,
                onDismissRequest = { menuOpen = false },
            ) {
                androidx.compose.material3.DropdownMenuItem(
                    text = { Text(stringResource(R.string.chat_menu_search)) },
                    onClick = { menuOpen = false; onOpenSearch() },
                )
                androidx.compose.material3.DropdownMenuItem(
                    text = { Text(stringResource(R.string.chat_menu_calendar)) },
                    onClick = { menuOpen = false; onOpenCalendar() },
                )
                androidx.compose.material3.DropdownMenuItem(
                    text = { Text(stringResource(R.string.chat_menu_profile)) },
                    onClick = { menuOpen = false; onOpenProfile() },
                )
                androidx.compose.material3.DropdownMenuItem(
                    text = {
                        Text(
                            stringResource(R.string.chat_menu_report),
                            color = MaterialTheme.colorScheme.error,
                        )
                    },
                    onClick = { menuOpen = false; onReport() },
                )
            }
        }
    }
}

/** Человекочитаемое «был(а) в сети» (как в вебе: только что / N мин / N ч / дата). */
@Composable
private fun formatLastSeen(epochMs: Long): String {
    val diff = System.currentTimeMillis() - epochMs
    val minutes = diff / 60_000
    val hours = diff / 3_600_000
    return when {
        minutes < 1 -> stringResource(R.string.chat_last_seen_just_now)
        minutes < 60 -> stringResource(R.string.chat_last_seen_minutes, minutes.toInt())
        hours < 24 -> stringResource(R.string.chat_last_seen_hours, hours.toInt())
        else -> {
            val date = java.text.SimpleDateFormat("d MMM", java.util.Locale("ru"))
                .format(java.util.Date(epochMs))
            stringResource(R.string.chat_last_seen_at, date)
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

/** Пузырь одного сообщения. Свои — градиент, чужие — стекло. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun MessageBubble(
    message: ChatMessage,
    urlBuilder: com.infy.messenger.core.media.MediaUrlBuilder,
    onRetry: (clientMessageId: String) -> Unit,
    onTranscribe: (suspend (messageId: String) -> String)? = null,
) {
    val isOwn = message.isOwn
    val contentColor = if (isOwn) Color.White else TextHi
    // Каскадные скругления: «хвост» к своей/чужой стороне снизу (как в вебе).
    val shape = if (isOwn) {
        RoundedCornerShape(20.dp, 20.dp, 6.dp, 20.dp)
    } else {
        RoundedCornerShape(20.dp, 20.dp, 20.dp, 6.dp)
    }
    val bubbleModifier = if (isOwn) {
        Modifier.background(Aurora.gradOwn, shape)
    } else {
        Modifier
            .background(Glass2, shape)
            .border(BorderStroke(1.dp, GlassStroke), shape)
    }

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (isOwn) Arrangement.End else Arrangement.Start,
    ) {
        Box(
            modifier = Modifier
                .widthIn(max = 300.dp)
                .clip(shape)
                .then(bubbleModifier),
        ) {
            Column(modifier = Modifier.padding(10.dp)) {
                // Блок-цитата (ответ на сообщение).
                val reply = message.replyTo
                if (reply != null) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(bottom = 6.dp)
                            .clip(RoundedCornerShape(8.dp))
                            .background(Color.White.copy(alpha = 0.10f)),
                    ) {
                        Column(modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)) {
                            Text(
                                text = reply.senderNickname,
                                style = MaterialTheme.typography.labelMedium,
                                fontWeight = FontWeight.Bold,
                                color = contentColor,
                            )
                            Text(
                                text = if (reply.deleted) "—" else reply.content.orEmpty(),
                                style = MaterialTheme.typography.bodySmall,
                                color = contentColor.copy(alpha = 0.85f),
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
                        messageId = message.id.ifBlank { null },
                        onTranscribe = onTranscribe,
                    )
                }

                // Текстовый контент / подпись (если есть).
                val isTextType = message.type in TEXT_LIKE_TYPES
                if (isTextType || !message.content.isNullOrBlank()) {
                    val text = message.content.orEmpty()
                    if (text.isNotEmpty()) {
                        Text(
                            text = text,
                            style = MaterialTheme.typography.bodyLarge,
                            color = contentColor,
                        )
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
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(10.dp))
                                    .background(Color.White.copy(alpha = 0.14f)),
                            ) {
                                Text(
                                    text = "${reaction.emoji} ${reaction.count}",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = contentColor,
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
    contentColor: Color,
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
            DeliveryTicks(
                status = message.deliveryStatus,
                mutedColor = mutedColor,
                modifier = statusModifier,
            )
        }
    }
}

/**
 * Статус доставки галочками, как в вебе:
 *  - SENDING → часы (отправляется);
 *  - SENT    → одна галочка (приглушённая);
 *  - READ    → две галочки (фиолетовый акцент);
 *  - FAILED  → «!» (красный), кликабельно для повтора.
 */
@Composable
private fun DeliveryTicks(
    status: DeliveryStatus,
    mutedColor: Color,
    modifier: Modifier = Modifier,
) {
    when (status) {
        DeliveryStatus.SENDING -> Text(
            text = "🕓",
            style = MaterialTheme.typography.labelSmall,
            color = mutedColor,
            modifier = modifier,
        )
        DeliveryStatus.FAILED -> Text(
            text = "⚠",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.error,
            modifier = modifier,
        )
        DeliveryStatus.SENT -> Text(
            text = "✓",
            style = MaterialTheme.typography.labelSmall,
            color = mutedColor,
            modifier = modifier,
        )
        DeliveryStatus.READ -> Text(
            text = "✓✓",
            style = MaterialTheme.typography.labelSmall,
            color = StatusRead,
            modifier = modifier,
        )
    }
}

/**
 * Нижняя панель ввода Aurora: стеклянная пилюля с текстом + действия.
 * Пусто — кнопки вложения/кружка/микрофона; есть текст — градиентная отправка.
 * Логика записи/жестов сохранена.
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

    // Запись «заблокирована» (hands-free): пользователь свайпнул вверх во время
    // удержания — отпускание больше не завершает запись, появляются кнопки.
    var recordLocked by remember { mutableStateOf(false) }
    // Прогресс свайпа влево к отмене (0..1) — для подсветки и подсказки.
    var cancelHint by remember { mutableFloatStateOf(0f) }

    // Сбрасываем флаги, когда запись завершилась.
    LaunchedEffect(isRecording) {
        if (!isRecording) {
            recordLocked = false
            cancelHint = 0f
        }
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(DockBg)
            .border(BorderStroke(1.dp, GlassStroke), RoundedCornerShape(0.dp))
            .navigationBarsPadding(),
    ) {
        // Прогресс загрузки вложения.
        if (uploadProgress != null) {
            androidx.compose.material3.LinearProgressIndicator(
                progress = { uploadProgress },
                modifier = Modifier.fillMaxWidth(),
                color = MaterialTheme.colorScheme.primary,
            )
        }

        if (isRecording) {
            RecordingRow(
                locked = recordLocked,
                cancelHint = cancelHint,
                onCancel = onRecordVoiceCancel,
                onStop = onRecordVoiceStop,
            )
        } else {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 8.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                // Меню вложений.
                Box {
                    IconButton(onClick = { menuOpen = true }) {
                        Icon(
                            imageVector = Icons.Filled.Add,
                            contentDescription = stringResource(R.string.media_attach),
                            tint = TextMid,
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

                TextField(
                    value = text,
                    onValueChange = {
                        text = it
                        onTyping()
                    },
                    placeholder = {
                        Text(stringResource(R.string.chat_message_hint), color = TextLow)
                    },
                    modifier = Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(22.dp)),
                    maxLines = 5,
                    colors = TextFieldDefaults.colors(
                        focusedContainerColor = Glass2,
                        unfocusedContainerColor = Glass2,
                        disabledContainerColor = Glass2,
                        focusedIndicatorColor = Color.Transparent,
                        unfocusedIndicatorColor = Color.Transparent,
                        disabledIndicatorColor = Color.Transparent,
                        cursorColor = MaterialTheme.colorScheme.primary,
                        focusedTextColor = TextHi,
                        unfocusedTextColor = TextHi,
                    ),
                )

                if (hasText) {
                    GradientSendButton(onClick = { onSend(text); text = "" })
                } else {
                    // Кнопка кружка (рядом с микрофоном), как в вебе.
                    IconButton(onClick = onOpenCircle) {
                        Icon(
                            imageVector = Icons.Filled.Videocam,
                            contentDescription = stringResource(R.string.media_record_circle),
                            tint = TextMid,
                        )
                    }
                    // Удержание микрофона = запись; свайп влево — отмена, вверх — блокировка.
                    RecordMicButton(
                        onStart = onRecordVoiceStart,
                        onStop = onRecordVoiceStop,
                        onCancel = onRecordVoiceCancel,
                        onLock = { recordLocked = true },
                        onCancelHint = { cancelHint = it },
                        isLocked = { recordLocked },
                    )
                }
            }
        }
    }
}

/** Круглая кнопка отправки с брендовым градиентом. */
@Composable
private fun GradientSendButton(onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .size(44.dp)
            .clip(RoundedCornerShape(22.dp))
            .background(Aurora.gradOwn)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = Icons.AutoMirrored.Filled.Send,
            contentDescription = stringResource(R.string.chat_send),
            tint = Color.White,
            modifier = Modifier.size(20.dp),
        )
    }
}

/**
 * Кнопка-микрофон с записью по удержанию (как в вебе):
 *  - удержание начинает запись;
 *  - свайп влево за порог = отмена;
 *  - свайп вверх за порог = блокировка (hands-free): отпускание не завершает,
 *    дальше управляют кнопки в строке записи;
 *  - обычное отпускание = стоп и отправка (если запись достаточной длины).
 */
@Composable
private fun RecordMicButton(
    onStart: () -> Unit,
    onStop: () -> Unit,
    onCancel: () -> Unit,
    onLock: () -> Unit,
    onCancelHint: (Float) -> Unit,
    isLocked: () -> Boolean,
) {
    val density = androidx.compose.ui.platform.LocalDensity.current
    // Пороги свайпа в пикселях.
    val cancelThreshold = with(density) { 120.dp.toPx() }
    val lockThreshold = with(density) { 90.dp.toPx() }

    Box(
        modifier = Modifier
            .size(48.dp)
            .pointerInput(Unit) {
                awaitPointerEventScope {
                    while (true) {
                        // Ждём нажатия.
                        val down = awaitFirstDown(requireUnconsumed = false)
                        onStart()
                        var dx = 0f
                        var dy = 0f
                        var resolved = false  // отменено/заблокировано в процессе
                        while (true) {
                            val event = awaitPointerEvent()
                            val change = event.changes.firstOrNull { it.id == down.id }
                                ?: event.changes.firstOrNull()
                            if (change == null) break
                            if (change.pressed) {
                                dx += change.positionChange().x
                                dy += change.positionChange().y
                                change.consume()
                                // Свайп влево → прогресс отмены.
                                val leftDrag = (-dx).coerceAtLeast(0f)
                                onCancelHint((leftDrag / cancelThreshold).coerceIn(0f, 1f))
                                if (leftDrag >= cancelThreshold) {
                                    onCancel()
                                    onCancelHint(0f)
                                    resolved = true
                                    break
                                }
                                // Свайп вверх → блокировка.
                                if (-dy >= lockThreshold) {
                                    onLock()
                                    resolved = true
                                    break
                                }
                            } else {
                                break  // палец отпущен
                            }
                        }
                        if (!resolved && !isLocked()) {
                            onStop()
                            onCancelHint(0f)
                        }
                    }
                }
            },
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = Icons.Filled.Mic,
            contentDescription = stringResource(R.string.media_record_voice),
            tint = TextMid,
            modifier = Modifier.size(24.dp),
        )
    }
}

/** Строка активной записи: индикатор, таймер, подсказка свайпа / кнопки при блокировке. */
@Composable
private fun RecordingRow(
    locked: Boolean,
    cancelHint: Float,
    onCancel: () -> Unit,
    onStop: () -> Unit,
) {
    // Локальный таймер записи (мс с момента появления строки).
    var elapsedMs by remember { mutableStateOf(0L) }
    LaunchedEffect(Unit) {
        val start = System.currentTimeMillis()
        while (true) {
            elapsedMs = System.currentTimeMillis() - start
            kotlinx.coroutines.delay(200)
        }
    }
    val seconds = (elapsedMs / 1000).toInt()
    val timeLabel = "%d:%02d".format(seconds / 60, seconds % 60)

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // Мигающая красная точка + таймер.
        Box(
            modifier = Modifier
                .size(10.dp)
                .clip(androidx.compose.foundation.shape.CircleShape)
                .background(MaterialTheme.colorScheme.error),
        )
        Text(
            text = timeLabel,
            modifier = Modifier.padding(start = 8.dp),
            style = MaterialTheme.typography.bodyMedium,
            color = TextHi,
        )

        if (locked) {
            // Заблокировано: явные кнопки «отмена» и «отправить».
            androidx.compose.foundation.layout.Spacer(Modifier.weight(1f))
            androidx.compose.material3.TextButton(onClick = onCancel) {
                Text(stringResource(R.string.media_cancel), color = TextMid)
            }
            GradientSendButton(onClick = onStop)
        } else {
            // Удержание: подсказка «← смахните для отмены», подсвечивается при свайпе.
            Text(
                text = stringResource(R.string.media_slide_to_cancel),
                modifier = Modifier
                    .weight(1f)
                    .padding(start = 12.dp),
                style = MaterialTheme.typography.bodySmall,
                color = TextMid.copy(alpha = (1f - cancelHint).coerceIn(0.4f, 1f)),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}
