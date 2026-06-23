package com.infy.messenger.feature.chat.ui.conversation

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
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
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.interaction.collectIsFocusedAsState
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
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
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
import com.infy.messenger.ui.theme.DangerRed
import com.infy.messenger.ui.theme.DockBg
import com.infy.messenger.ui.theme.Hairline
import com.infy.messenger.ui.theme.InfyHighlight
import com.infy.messenger.ui.theme.GlassStroke
import com.infy.messenger.ui.theme.GlassPopBg
import com.infy.messenger.ui.theme.Glass2
import com.infy.messenger.ui.theme.OnlineGreen
import com.infy.messenger.ui.theme.StatusRead
import com.infy.messenger.ui.theme.TextHi
import com.infy.messenger.ui.theme.TextLow
import com.infy.messenger.ui.theme.TextMid
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.launch

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
    // Сообщение, по которому открыто контекстное меню (long-press), и позиция
    // его пузыря в окне — для анкорного позиционирования меню рядом с ним.
    var selectedMessage by remember { mutableStateOf<ChatMessage?>(null) }
    var selectedBounds by remember { mutableStateOf(Rect.Zero) }

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

    // При reverseLayout индекс 0 — это визуальный низ (самое новое сообщение).
    val scope = androidx.compose.runtime.rememberCoroutineScope()

    // Вход в чат / возврат из профиля собеседника: всегда показываем конец чата,
    // а не верх. Скроллим к низу, как только появились сообщения.
    var didInitialScroll by rememberSaveable(viewModel.chatId) { mutableStateOf(false) }
    LaunchedEffect(uiState.messages.isNotEmpty()) {
        if (!didInitialScroll && uiState.messages.isNotEmpty()) {
            listState.scrollToItem(0)
            didInitialScroll = true
        }
    }

    // Новое сообщение: если оно своё (мы отправили) — плавно уводим скролл вниз.
    val lastMessageKey = uiState.messages.lastOrNull()?.let { it.clientMessageId ?: it.id }
    LaunchedEffect(lastMessageKey) {
        val last = uiState.messages.lastOrNull() ?: return@LaunchedEffect
        if (last.isOwn) {
            listState.animateScrollToItem(0)
        }
    }

    // Показывать кнопку «вниз», если ушли вверх от конца чата (низ = индекс 0).
    val showScrollToBottom by remember {
        androidx.compose.runtime.derivedStateOf {
            listState.firstVisibleItemIndex > 2
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

            // Закреплённое сообщение — бар под шапкой (как в Telegram). Клик
            // прокручивает ленту к этому сообщению.
            val pinned = remember(uiState.messages) {
                uiState.messages.lastOrNull { it.pinnedAt != null }
            }
            if (pinned != null) {
                PinnedBar(
                    message = pinned,
                    onClick = {
                        val reversed = uiState.messages.reversed()
                        val idx = reversed.indexOfFirst { it.id == pinned.id }
                        if (idx >= 0) scope.launch { listState.animateScrollToItem(idx) }
                    },
                )
            }

            Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
            LazyColumn(
                state = listState,
                reverseLayout = true,
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                items(
                    items = uiState.messages.reversed(),
                    key = { it.clientMessageId ?: it.id },
                ) { message ->
                    if (message.type == MessageType.SYSTEM) {
                        // Системное уведомление (например, о закреплении) — центрированная плашка.
                        SystemMessageRow(text = message.content.orEmpty())
                    } else {
                        MessageBubble(
                            message = message,
                            urlBuilder = viewModel.mediaUrlBuilder,
                            currentUserId = viewModel.currentUserId,
                            onRetry = { clientId -> viewModel.retry(clientId) },
                            onLongPress = { m, rect -> selectedMessage = m; selectedBounds = rect },
                            onReactionClick = { id, emoji -> viewModel.toggleReaction(id, emoji) },
                            onTranscribe = { id -> viewModel.transcribe(id) },
                        )
                    }
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

            // Кнопка моментального перехода в конец чата (низ = индекс 0).
            androidx.compose.animation.AnimatedVisibility(
                visible = showScrollToBottom,
                enter = androidx.compose.animation.fadeIn() + androidx.compose.animation.scaleIn(),
                exit = androidx.compose.animation.fadeOut() + androidx.compose.animation.scaleOut(),
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(end = 16.dp, bottom = 16.dp),
            ) {
                Box(
                    modifier = Modifier
                        .size(44.dp)
                        .clip(RoundedCornerShape(22.dp))
                        .background(GlassPopBg)
                        .border(BorderStroke(1.dp, GlassStroke), RoundedCornerShape(22.dp))
                        .clickable { scope.launch { listState.animateScrollToItem(0) } },
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = Icons.Filled.KeyboardArrowDown,
                        contentDescription = stringResource(R.string.chat_scroll_to_bottom),
                        tint = MaterialTheme.colorScheme.onSurface,
                    )
                }
            }
            }

            // Баннер ответа/редактирования над композером (как в web).
            ReplyEditBanner(
                replyingTo = uiState.replyingTo,
                editing = uiState.editing,
                onCancel = {
                    viewModel.cancelReply()
                    viewModel.cancelEdit()
                },
            )

            Composer(
                uploadProgress = uploadProgress,
                isRecording = isRecording,
                prefillText = uiState.editing?.content.orEmpty(),
                prefillKey = uiState.editing?.id,
                onTyping = viewModel::onTyping,
                onSend = {
                    if (uiState.editing != null) {
                        viewModel.confirmEdit(it)
                    } else {
                        viewModel.sendMessage(it)
                    }
                },
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

        // Контекстное меню сообщения по long-press (реакции + действия), как в web.
        selectedMessage?.let { msg ->
            val clipboard = androidx.compose.ui.platform.LocalClipboardManager.current
            val myEmojis = remember(msg) {
                msg.reactions.filter { viewModel.currentUserId in it.userIds }
                    .map { it.emoji }.toSet()
            }
            MessageContextMenu(
                message = msg,
                anchor = selectedBounds,
                myEmojis = myEmojis,
                onDismiss = { selectedMessage = null },
                onReact = { emoji ->
                    viewModel.toggleReaction(msg.id, emoji)
                    selectedMessage = null
                },
                onReply = {
                    viewModel.startReply(msg.id)
                    selectedMessage = null
                },
                onCopy = {
                    clipboard.setText(androidx.compose.ui.text.AnnotatedString(msg.content.orEmpty()))
                    selectedMessage = null
                },
                onEdit = {
                    viewModel.startEdit(msg.id)
                    selectedMessage = null
                },
                onPin = {
                    viewModel.pinMessage(msg.id)
                    selectedMessage = null
                },
                onDelete = {
                    viewModel.deleteMessage(msg.id)
                    selectedMessage = null
                },
            )
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
                // Тик раз в 30 секунд — чтобы относительное «был(а) N мин назад»
                // обновлялось в реальном времени без перезахода в чат.
                var nowTick by remember { mutableStateOf(System.currentTimeMillis()) }
                LaunchedEffect(Unit) {
                    while (true) {
                        kotlinx.coroutines.delay(30_000)
                        nowTick = System.currentTimeMillis()
                    }
                }
                // Присутствие: «печатает…» > «в сети» > «был(а)…».
                val presence: Pair<String, Color>? = when {
                    partnerTyping -> stringResource(R.string.chat_typing) to
                        MaterialTheme.colorScheme.primary
                    partnerOnline -> stringResource(R.string.chat_online) to OnlineGreen
                    partnerLastSeenAt != null -> formatLastSeen(partnerLastSeenAt, nowTick) to TextLow
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
                containerColor = GlassPopBg,
                shape = RoundedCornerShape(16.dp),
                border = BorderStroke(1.dp, GlassStroke),
            ) {
                androidx.compose.material3.DropdownMenuItem(
                    text = { Text(stringResource(R.string.chat_menu_search), color = TextHi) },
                    onClick = { menuOpen = false; onOpenSearch() },
                )
                androidx.compose.material3.DropdownMenuItem(
                    text = { Text(stringResource(R.string.chat_menu_calendar), color = TextHi) },
                    onClick = { menuOpen = false; onOpenCalendar() },
                )
                androidx.compose.material3.DropdownMenuItem(
                    text = { Text(stringResource(R.string.chat_menu_profile), color = TextHi) },
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
private fun formatLastSeen(epochMs: Long, now: Long = System.currentTimeMillis()): String {
    val diff = now - epochMs
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

/**
 * Бар закреплённого сообщения под шапкой (как в Telegram): значок 📌,
 * «Закреплённое сообщение» + превью. Клик прокручивает к сообщению.
 */
@Composable
private fun PinnedBar(message: ChatMessage, onClick: () -> Unit) {
    val preview = message.content?.takeIf { it.isNotBlank() }
        ?: stringResource(R.string.chats_attachment)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.10f))
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Box(
            modifier = Modifier
                .size(width = 3.dp, height = 32.dp)
                .clip(RoundedCornerShape(2.dp))
                .background(InfyHighlight),
        )
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = stringResource(R.string.pinned_title),
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.SemiBold,
                color = InfyHighlight,
            )
            Text(
                text = preview,
                style = MaterialTheme.typography.bodySmall,
                color = TextMid,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Text(text = "📌", style = MaterialTheme.typography.labelMedium)
    }
}

/** Системное уведомление в ленте (например, о закреплении) — центрированная плашка. */
@Composable
private fun SystemMessageRow(text: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.Center,
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelMedium,
            color = TextLow,
            modifier = Modifier
                .clip(RoundedCornerShape(12.dp))
                .background(Glass2)
                .padding(horizontal = 12.dp, vertical = 6.dp),
        )
    }
}

/** Пузырь одного сообщения. Свои — градиент, чужие — стекло. */
@OptIn(ExperimentalLayoutApi::class, androidx.compose.foundation.ExperimentalFoundationApi::class)
@Composable
private fun MessageBubble(
    message: ChatMessage,
    urlBuilder: com.infy.messenger.core.media.MediaUrlBuilder,
    currentUserId: String,
    onRetry: (clientMessageId: String) -> Unit,
    onLongPress: (ChatMessage, androidx.compose.ui.geometry.Rect) -> Unit,
    onReactionClick: (messageId: String, emoji: String) -> Unit,
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
        verticalAlignment = Alignment.Bottom,
    ) {
        // Мета (время + статус) снаружи пузыря, как в web: для своих — слева
        // от пузыря, для чужих — справа. Прижата к низу (verticalAlignment.Bottom).
        if (isOwn) {
            MessageMeta(
                message = message,
                onRetry = onRetry,
                modifier = Modifier.padding(end = 6.dp),
            )
        }
        var bubbleBounds by remember { mutableStateOf(androidx.compose.ui.geometry.Rect.Zero) }
        Box(
            modifier = Modifier
                .widthIn(max = 300.dp)
                .onGloballyPositioned { bubbleBounds = it.boundsInWindow() }
                .clip(shape)
                .then(bubbleModifier)
                .combinedClickable(
                    onClick = {},
                    onLongClick = { onLongPress(message, bubbleBounds) },
                ),
        ) {
            Column(modifier = Modifier.padding(10.dp)) {
                // Индикатор закрепления (как в web — значок 📌 на закреплённом сообщении).
                if (message.pinnedAt != null) {
                    Row(
                        modifier = Modifier.padding(bottom = 4.dp),
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(text = "📌", style = MaterialTheme.typography.labelSmall)
                        Text(
                            text = stringResource(R.string.msg_pinned_label),
                            style = MaterialTheme.typography.labelSmall,
                            color = contentColor.copy(alpha = 0.8f),
                        )
                    }
                }

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

                // Реакции. Тап по своей реакции — снимает её, по чужой эмодзи —
                // добавляет/переключает. Моя реакция подсвечена фиолетовым.
                if (message.reactions.isNotEmpty()) {
                    FlowRow(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 4.dp),
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        message.reactions.forEach { reaction ->
                            val mine = currentUserId.isNotEmpty() && currentUserId in reaction.userIds
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(10.dp))
                                    .background(
                                        if (mine) {
                                            MaterialTheme.colorScheme.primary.copy(alpha = 0.35f)
                                        } else {
                                            Color.White.copy(alpha = 0.14f)
                                        },
                                    )
                                    .then(
                                        if (mine) {
                                            Modifier.border(
                                                BorderStroke(1.dp, MaterialTheme.colorScheme.primary),
                                                RoundedCornerShape(10.dp),
                                            )
                                        } else {
                                            Modifier
                                        },
                                    )
                                    .clickable { onReactionClick(message.id, reaction.emoji) },
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

            }
        }
        // Мета чужого сообщения — справа от пузыря.
        if (!isOwn) {
            MessageMeta(
                message = message,
                onRetry = onRetry,
                modifier = Modifier.padding(start = 6.dp),
            )
        }
    }
}

/**
 * Мета сообщения СНАРУЖИ пузыря (как в web): время + «изменено» и для своих —
 * статус доставки. Приглушённый серый цвет, прижата к низу пузыря.
 */
@Composable
private fun MessageMeta(
    message: ChatMessage,
    onRetry: (clientMessageId: String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val mutedColor = TextLow

    Row(
        modifier = modifier.padding(bottom = 2.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
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
                Modifier.clickable { onRetry(clientId) }
            } else {
                Modifier
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
        // Часики «отправляется» — кружок со стрелкой, как pending в web.
        DeliveryStatus.SENDING -> Canvas(modifier = modifier.size(13.dp)) {
            val stroke = Stroke(width = size.minDimension * 0.12f, cap = StrokeCap.Round)
            val r = size.minDimension * 0.42f
            val c = Offset(size.width / 2f, size.height / 2f)
            drawCircle(color = mutedColor, radius = r, center = c, style = stroke)
            // Стрелки часов: вверх и вправо.
            drawLine(mutedColor, c, Offset(c.x, c.y - r * 0.55f), strokeWidth = stroke.width, cap = StrokeCap.Round)
            drawLine(mutedColor, c, Offset(c.x + r * 0.45f, c.y), strokeWidth = stroke.width, cap = StrokeCap.Round)
        }
        // «Не отправлено» — кружок с восклицательным знаком (как в web).
        DeliveryStatus.FAILED -> {
            val color = MaterialTheme.colorScheme.error
            Canvas(modifier = modifier.size(13.dp)) {
            val stroke = Stroke(width = size.minDimension * 0.12f, cap = StrokeCap.Round)
            val r = size.minDimension * 0.42f
            val c = Offset(size.width / 2f, size.height / 2f)
            drawCircle(color = color, radius = r, center = c, style = stroke)
            drawLine(color, Offset(c.x, c.y - r * 0.45f), Offset(c.x, c.y + r * 0.1f), strokeWidth = stroke.width, cap = StrokeCap.Round)
            drawLine(color, Offset(c.x, c.y + r * 0.45f), Offset(c.x, c.y + r * 0.5f), strokeWidth = stroke.width, cap = StrokeCap.Round)
            }
        }
        // Как в web: всегда двойная галочка; цвет = статус
        // (приглушённый «доставлено» или фиолетовый «прочитано»).
        DeliveryStatus.SENT -> DoubleCheck(color = mutedColor, modifier = modifier)
        DeliveryStatus.READ -> DoubleCheck(color = StatusRead, modifier = modifier)
    }
}

/**
 * Двойная галочка, визуально идентичная web (MessageBubble.tsx):
 * две накладывающиеся «птички» в системе координат 18×10, обводка
 * со скруглением — без «слипания», читается чисто.
 */
@Composable
private fun DoubleCheck(color: Color, modifier: Modifier = Modifier) {
    // Соотношение сторон 18:10, как в web viewBox.
    Canvas(modifier = modifier.size(width = 18.dp, height = 10.dp)) {
        val w = size.width / 18f
        val h = size.height / 10f
        val sw = h * 1.4f
        fun p(x: Float, y: Float) = Offset(x * w, y * h)
        // Первая галочка: M1 5 l3 3 L11 1
        drawLine(color, p(1f, 5f), p(4f, 8f), strokeWidth = sw, cap = StrokeCap.Round)
        drawLine(color, p(4f, 8f), p(11f, 1f), strokeWidth = sw, cap = StrokeCap.Round)
        // Вторая галочка (со сдвигом): M5 5 l3 3 L15 1
        drawLine(color, p(5f, 5f), p(8f, 8f), strokeWidth = sw, cap = StrokeCap.Round)
        drawLine(color, p(8f, 8f), p(15f, 1f), strokeWidth = sw, cap = StrokeCap.Round)
    }
}

/**
 * Нижняя панель ввода Aurora: стеклянная пилюля с текстом + действия.
 * Пусто — единая кнопка записи (голос/кружок, как в вебе); есть текст —
 * градиентная отправка. Логика записи/жестов зеркалит веб-композер.
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
    prefillText: String = "",
    prefillKey: String? = null,
) {
    var text by remember { mutableStateOf("") }
    var menuOpen by remember { mutableStateOf(false) }
    val hasText = text.isNotBlank()

    // Старт редактирования (prefillKey сменился на id сообщения) — подставляем его
    // текст в поле; выход из редактирования (key стал null) очищает поле.
    LaunchedEffect(prefillKey) {
        text = if (prefillKey != null) prefillText else ""
    }

    // Режим единой кнопки записи: голос или кружок (тап переключает, как в вебе).
    var recordMode by remember { mutableStateOf(RecordMode.Voice) }
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
                // Меню вложений (без записи кружка — она на единой кнопке записи).
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
                        containerColor = GlassPopBg,
                        shape = RoundedCornerShape(16.dp),
                        border = BorderStroke(1.dp, GlassStroke),
                    ) {
                        androidx.compose.material3.DropdownMenuItem(
                            text = { Text(stringResource(R.string.media_pick_gallery), color = TextHi) },
                            onClick = { menuOpen = false; onPickMedia() },
                        )
                        androidx.compose.material3.DropdownMenuItem(
                            text = { Text(stringResource(R.string.media_pick_file), color = TextHi) },
                            onClick = { menuOpen = false; onPickFile() },
                        )
                    }
                }

                ComposerTextField(
                    value = text,
                    onValueChange = {
                        text = it
                        onTyping()
                    },
                    modifier = Modifier.weight(1f),
                )

                if (hasText) {
                    GradientSendButton(onClick = { onSend(text); text = "" })
                } else {
                    // Единая кнопка записи (как в вебе): тап — переключить
                    // голос/кружок; удержание — запись текущего режима;
                    // свайп влево — отмена, вверх — закрепить.
                    RecordButton(
                        mode = recordMode,
                        onToggleMode = {
                            recordMode = if (recordMode == RecordMode.Voice) {
                                RecordMode.Circle
                            } else {
                                RecordMode.Voice
                            }
                        },
                        onStartVoice = onRecordVoiceStart,
                        onStopVoice = onRecordVoiceStop,
                        onCancelVoice = onRecordVoiceCancel,
                        onOpenCircle = onOpenCircle,
                        onLock = { recordLocked = true },
                        onCancelHint = { cancelHint = it },
                        isLocked = { recordLocked },
                    )
                }
            }
        }
    }
}

/** Режим единой кнопки записи. */
private enum class RecordMode { Voice, Circle }

/**
 * Поле ввода сообщения в стиле web-композера: стеклянная пилюля с фиолетовой
 * подсветкой обводки в фокусе (зеркалит `.composer-input`). Градиента-заливки
 * в вебе нет — есть акцентная фиолетовая рамка/свечение, что мы и повторяем.
 */
@Composable
private fun ComposerTextField(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val interactionSource = remember { androidx.compose.foundation.interaction.MutableInteractionSource() }
    val focused by interactionSource.collectIsFocusedAsState()
    val borderColor = if (focused) {
        MaterialTheme.colorScheme.primary.copy(alpha = 0.55f)
    } else {
        GlassStroke
    }
    TextField(
        value = value,
        onValueChange = onValueChange,
        placeholder = {
            Text(stringResource(R.string.chat_message_hint), color = TextLow)
        },
        interactionSource = interactionSource,
        modifier = modifier
            .clip(RoundedCornerShape(22.dp))
            .border(BorderStroke(1.dp, borderColor), RoundedCornerShape(22.dp)),
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
 * Единая кнопка записи (зеркалит веб-композер):
 *  - короткий тап (без удержания и без заметного движения) = переключение
 *    режима голос ↔ кружок;
 *  - удержание ≥250мс в режиме «голос» = запись голосового; свайп влево за
 *    порог = отмена, свайп вверх за порог = закрепление (hands-free);
 *    обычное отпускание = стоп и отправка;
 *  - удержание в режиме «кружок» = открыть экран записи кружка.
 *
 * Все события указателя потребляются (consume), чтобы свайпы по кнопке не
 * «протекали» в список сообщений и не уводили его в случайную точку.
 */
@Composable
private fun RecordButton(
    mode: RecordMode,
    onToggleMode: () -> Unit,
    onStartVoice: () -> Unit,
    onStopVoice: () -> Unit,
    onCancelVoice: () -> Unit,
    onOpenCircle: () -> Unit,
    onLock: () -> Unit,
    onCancelHint: (Float) -> Unit,
    isLocked: () -> Boolean,
) {
    val density = androidx.compose.ui.platform.LocalDensity.current
    // Пороги свайпа в пикселях (как в вебе: отмена 120, фиксация 120 при малом dx).
    val cancelThreshold = with(density) { 120.dp.toPx() }
    val lockThreshold = with(density) { 120.dp.toPx() }
    val tapSlop = with(density) { 16.dp.toPx() }
    val holdDelayMs = 250L

    Box(
        modifier = Modifier
            .size(44.dp)
            .clip(RoundedCornerShape(22.dp))
            .background(Aurora.gradOwn)
            .pointerInput(mode) {
                while (true) {
                    // Ждём нажатия.
                    val downId = awaitPointerEventScope {
                        val down = awaitFirstDown(requireUnconsumed = false)
                        down.consume()
                        down.id
                    }

                    // Накопленное смещение указателя за весь жест.
                    var dx = 0f
                    var dy = 0f

                    // Фаза 1: ждём холд holdDelayMs. Отпускание до него = тап
                    // (переключение режима); заметное движение = это скролл, не запись.
                    // Результат: HELD | TAP | ABORT.
                    val phase1 = kotlinx.coroutines.withTimeoutOrNull(holdDelayMs) {
                        awaitPointerEventScope {
                            while (true) {
                                val ev = awaitPointerEvent()
                                val ch = ev.changes.firstOrNull { it.id == downId }
                                    ?: ev.changes.firstOrNull() ?: return@awaitPointerEventScope "ABORT"
                                ch.consume()
                                if (!ch.pressed) return@awaitPointerEventScope "TAP"
                                dx += ch.positionChange().x
                                dy += ch.positionChange().y
                                if (kotlin.math.hypot(dx, dy) > tapSlop) {
                                    return@awaitPointerEventScope "ABORT"
                                }
                            }
                            @Suppress("UNREACHABLE_CODE")
                            "ABORT"
                        }
                    } ?: "HELD"  // таймаут истёк при удержании на месте

                    when (phase1) {
                        "TAP" -> { onToggleMode(); continue }
                        "ABORT" -> continue
                    }

                    // Фаза 2: удержание сработало — запускаем запись текущего режима.
                    if (mode == RecordMode.Circle) {
                        // Кружок: открываем экран записи (Telegram-style).
                        onOpenCircle()
                        continue
                    }
                    onStartVoice()

                    var resolved = false  // отменено/закреплено в процессе
                    awaitPointerEventScope {
                        while (true) {
                            val event = awaitPointerEvent()
                            val change = event.changes.firstOrNull { it.id == downId }
                                ?: event.changes.firstOrNull()
                            if (change == null) break
                            change.consume()
                            if (!change.pressed) break  // палец отпущен

                            dx += change.positionChange().x
                            dy += change.positionChange().y

                            // Свайп влево → прогресс отмены.
                            val leftDrag = (-dx).coerceAtLeast(0f)
                            onCancelHint((leftDrag / cancelThreshold).coerceIn(0f, 1f))
                            if (leftDrag >= cancelThreshold) {
                                onCancelVoice()
                                onCancelHint(0f)
                                resolved = true
                                break
                            }
                            // Свайп вверх (без заметного увода влево) → закрепить.
                            if (-dy >= lockThreshold && -dx < lockThreshold / 2) {
                                onLock()
                                onCancelHint(0f)
                                resolved = true
                                break
                            }
                        }
                    }

                    if (resolved) continue

                    if (!isLocked()) {
                        // Отпускание во время записи голосового — стоп и отправка.
                        onStopVoice()
                        onCancelHint(0f)
                    }
                }
            },
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = if (mode == RecordMode.Voice) Icons.Filled.Mic else Icons.Filled.Videocam,
            contentDescription = stringResource(
                if (mode == RecordMode.Voice) R.string.media_record_voice
                else R.string.media_record_circle,
            ),
            tint = Color.White,
            modifier = Modifier.size(22.dp),
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

/** Быстрые реакции в контекстном меню (зеркалит web QUICK_EMOJIS). */
private val QUICK_EMOJIS = listOf("👍", "❤️", "😂", "😮", "😢", "🔥")

/**
 * Контекстное меню сообщения по long-press (как в web): затемнённый оверлей,
 * сверху ряд быстрых эмодзи-реакций, ниже — список действий. Видимость пунктов
 * зависит от own/текст (copy — только текст, edit — own+текст, delete — own).
 */
@Composable
private fun MessageContextMenu(
    message: ChatMessage,
    anchor: Rect,
    myEmojis: Set<String>,
    onDismiss: () -> Unit,
    onReact: (String) -> Unit,
    onReply: () -> Unit,
    onCopy: () -> Unit,
    onEdit: () -> Unit,
    onPin: () -> Unit,
    onDelete: () -> Unit,
) {
    val isOwn = message.isOwn
    val isText = message.type in TEXT_LIKE_TYPES && !message.content.isNullOrBlank()
    val density = androidx.compose.ui.platform.LocalDensity.current
    var showFullPicker by remember { mutableStateOf(false) }

    // Полноэкранный пикер всех эмодзи (как web FullEmojiPicker) поверх меню.
    if (showFullPicker) {
        FullEmojiPicker(onSelect = onReact, onDismiss = onDismiss)
        return
    }

    BoxWithConstraints(
        modifier = Modifier
            .fillMaxSize()
            .clickable(
                interactionSource = remember { androidx.compose.foundation.interaction.MutableInteractionSource() },
                indication = null,
                onClick = onDismiss,
            ),
    ) {
        val viewW = with(density) { maxWidth.toPx() }
        val viewH = with(density) { maxHeight.toPx() }

        // Затемнение с «вырезом» вокруг пузыря: сам пузырь остаётся ярким и
        // визуально приподнят над фоном (как в web — дублированный bubble).
        Canvas(modifier = Modifier.fillMaxSize()) {
            val scrim = Color(0xB3080B16)
            if (anchor == Rect.Zero) {
                drawRect(scrim)
            } else {
                val pad = 0f
                val l = (anchor.left - pad).coerceIn(0f, size.width)
                val t = (anchor.top - pad).coerceIn(0f, size.height)
                val r = (anchor.right + pad).coerceIn(0f, size.width)
                val b = (anchor.bottom + pad).coerceIn(0f, size.height)
                // Четыре прямоугольника вокруг выреза.
                drawRect(scrim, topLeft = Offset(0f, 0f), size = androidx.compose.ui.geometry.Size(size.width, t))
                drawRect(scrim, topLeft = Offset(0f, b), size = androidx.compose.ui.geometry.Size(size.width, size.height - b))
                drawRect(scrim, topLeft = Offset(0f, t), size = androidx.compose.ui.geometry.Size(l, b - t))
                drawRect(scrim, topLeft = Offset(r, t), size = androidx.compose.ui.geometry.Size(size.width - r, b - t))
            }
        }

        // Меню (эмодзи + действия) позиционируем у пузыря: под ним, если влезает,
        // иначе над ним. По горизонтали — к стороне сообщения (own → справа).
        val menuWidthPx = with(density) { 240.dp.toPx() }
        val emojiRowHpx = with(density) { 56.dp.toPx() }
        val actionCount = 1 + (if (isText) 1 else 0) + (if (isOwn && isText) 1 else 0) +
            1 + (if (isOwn) 1 else 0)
        val readHpx = if (isOwn && message.deliveryStatus == DeliveryStatus.READ) {
            with(density) { 36.dp.toPx() }
        } else {
            0f
        }
        val actionsHpx = with(density) { (actionCount * 46).dp.toPx() } + readHpx
        val gapPx = with(density) { 8.dp.toPx() }
        val totalHpx = emojiRowHpx + gapPx + actionsHpx

        val anchorOrCenter = if (anchor == Rect.Zero) {
            Rect(viewW / 2 - menuWidthPx / 2, viewH / 2, viewW / 2 + menuWidthPx / 2, viewH / 2)
        } else {
            anchor
        }

        // X: к стороне пузыря, в пределах экрана.
        var menuLeftPx = if (isOwn) anchorOrCenter.right - menuWidthPx else anchorOrCenter.left
        menuLeftPx = menuLeftPx.coerceIn(gapPx, viewW - menuWidthPx - gapPx)

        // Y: под пузырём; если не влезает — над.
        var menuTopPx = anchorOrCenter.bottom + gapPx
        if (menuTopPx + totalHpx > viewH - gapPx) {
            menuTopPx = anchorOrCenter.top - totalHpx - gapPx
        }
        menuTopPx = menuTopPx.coerceAtLeast(gapPx)

        Column(
            modifier = Modifier
                .offset(
                    x = with(density) { menuLeftPx.toDp() },
                    y = with(density) { menuTopPx.toDp() },
                )
                .width(with(density) { menuWidthPx.toDp() }),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            // Ряд быстрых эмодзи.
            Row(
                modifier = Modifier
                    .clip(RoundedCornerShape(20.dp))
                    .background(GlassPopBg)
                    .border(BorderStroke(1.dp, GlassStroke), RoundedCornerShape(20.dp))
                    .padding(horizontal = 6.dp, vertical = 6.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                QUICK_EMOJIS.forEach { emoji ->
                    val mine = emoji in myEmojis
                    Box(
                        modifier = Modifier
                            .size(32.dp)
                            .clip(RoundedCornerShape(10.dp))
                            .background(
                                if (mine) {
                                    MaterialTheme.colorScheme.primary.copy(alpha = 0.35f)
                                } else {
                                    Color.Transparent
                                },
                            )
                            .clickable { onReact(emoji) },
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(text = emoji, style = MaterialTheme.typography.titleLarge)
                    }
                }
                // Кнопка «все эмодзи» — открывает полный пикер.
                Box(
                    modifier = Modifier
                        .size(32.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .clickable { showFullPicker = true },
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = Icons.Filled.Add,
                        contentDescription = stringResource(R.string.msg_more_emoji),
                        tint = TextMid,
                    )
                }
            }

            // Список действий.
            Column(
                modifier = Modifier
                    .clip(RoundedCornerShape(18.dp))
                    .background(GlassPopBg)
                    .border(BorderStroke(1.dp, GlassStroke), RoundedCornerShape(18.dp)),
            ) {
                // «Прочитано <дата>» — для своих прочитанных сообщений.
                if (isOwn && message.deliveryStatus == DeliveryStatus.READ) {
                    Text(
                        text = stringResource(
                            R.string.msg_read_at,
                            formatReadAt(message.createdAt),
                        ),
                        style = MaterialTheme.typography.labelMedium,
                        color = TextLow,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 8.dp),
                    )
                    androidx.compose.material3.HorizontalDivider(color = Hairline)
                }

                CtxMenuItem("↩️", stringResource(R.string.msg_reply), onClick = onReply)
                if (isText) {
                    CtxMenuItem("📋", stringResource(R.string.msg_copy), onClick = onCopy)
                }
                if (isOwn && isText) {
                    CtxMenuItem("✏️", stringResource(R.string.msg_edit), onClick = onEdit)
                }
                CtxMenuItem(
                    "📌",
                    stringResource(
                        if (message.pinnedAt != null) R.string.msg_unpin else R.string.msg_pin,
                    ),
                    onClick = onPin,
                )
                if (isOwn) {
                    CtxMenuItem(
                        "🗑",
                        stringResource(R.string.msg_delete),
                        onClick = onDelete,
                        danger = true,
                    )
                }
            }
        }
    }
}

@Composable
private fun CtxMenuItem(
    icon: String,
    label: String,
    onClick: () -> Unit,
    danger: Boolean = false,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(text = icon, style = MaterialTheme.typography.bodyLarge)
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = if (danger) DangerRed else TextHi,
        )
    }
}

/** «Прочитано»/edit-дата в формате web: «23 июн., 09:56». */
private fun formatReadAt(epochMs: Long): String =
    java.text.SimpleDateFormat("d MMM, HH:mm", java.util.Locale("ru"))
        .format(java.util.Date(epochMs))

/**
 * Полный пикер эмодзи (как web FullEmojiPicker): bottom-sheet с поиском,
 * вкладками категорий и сеткой по 8 в ряд. Выбор шлёт реакцию и закрывает.
 */
@Composable
private fun FullEmojiPicker(
    onSelect: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    var activeCategory by remember { mutableStateOf(0) }
    var search by remember { mutableStateOf("") }

    val shown = if (search.isBlank()) {
        EMOJI_CATEGORIES[activeCategory].emojis
    } else {
        EMOJI_CATEGORIES.flatMap { it.emojis }.distinct()
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0x99000000))
            .clickable(
                interactionSource = remember { androidx.compose.foundation.interaction.MutableInteractionSource() },
                indication = null,
                onClick = onDismiss,
            ),
        contentAlignment = Alignment.BottomCenter,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .fillMaxHeight(0.6f)
                .clip(RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp))
                .background(GlassPopBg)
                .border(BorderStroke(1.dp, GlassStroke), RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp))
                .clickable(
                    interactionSource = remember { androidx.compose.foundation.interaction.MutableInteractionSource() },
                    indication = null,
                    onClick = {},
                ),
        ) {
            // «Ручка».
            Box(
                modifier = Modifier
                    .padding(top = 10.dp)
                    .align(Alignment.CenterHorizontally)
                    .size(width = 32.dp, height = 4.dp)
                    .clip(RoundedCornerShape(2.dp))
                    .background(Color.White.copy(alpha = 0.15f)),
            )

            // Поиск.
            TextField(
                value = search,
                onValueChange = { search = it },
                placeholder = { Text(stringResource(R.string.emoji_search), color = TextLow) },
                singleLine = true,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp, vertical = 8.dp),
                colors = TextFieldDefaults.colors(
                    focusedContainerColor = Glass2,
                    unfocusedContainerColor = Glass2,
                    focusedIndicatorColor = Color.Transparent,
                    unfocusedIndicatorColor = Color.Transparent,
                    focusedTextColor = TextHi,
                    unfocusedTextColor = TextHi,
                ),
                shape = RoundedCornerShape(12.dp),
            )

            // Вкладки категорий (скрываем при поиске).
            if (search.isBlank()) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState())
                        .padding(horizontal = 8.dp, vertical = 2.dp),
                    horizontalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    EMOJI_CATEGORIES.forEachIndexed { i, cat ->
                        Box(
                            modifier = Modifier
                                .size(36.dp)
                                .clip(RoundedCornerShape(10.dp))
                                .background(
                                    if (activeCategory == i) {
                                        MaterialTheme.colorScheme.primary.copy(alpha = 0.25f)
                                    } else {
                                        Color.Transparent
                                    },
                                )
                                .clickable { activeCategory = i },
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(text = cat.icon, style = MaterialTheme.typography.titleMedium)
                        }
                    }
                }
            }

            // Сетка эмодзи.
            androidx.compose.foundation.lazy.grid.LazyVerticalGrid(
                columns = androidx.compose.foundation.lazy.grid.GridCells.Fixed(8),
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .padding(horizontal = 6.dp),
            ) {
                items(shown.size) { idx ->
                    val emoji = shown[idx]
                    Box(
                        modifier = Modifier
                            .aspectRatio(1f)
                            .clip(RoundedCornerShape(8.dp))
                            .clickable { onSelect(emoji) },
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(text = emoji, style = MaterialTheme.typography.titleLarge)
                    }
                }
            }
        }
    }
}

/**
 * Баннер над композером для ответа/редактирования (как в web): цитата/заголовок
 * + кнопка отмены. Если ни ответ, ни редактирование не активны — ничего не рисует.
 */
@Composable
private fun ReplyEditBanner(
    replyingTo: ChatMessage?,
    editing: ChatMessage?,
    onCancel: () -> Unit,
) {
    val active = editing ?: replyingTo ?: return
    val title = if (editing != null) {
        stringResource(R.string.edit_title)
    } else {
        active.senderNickname
    }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(DockBg)
            .padding(horizontal = 14.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .padding(end = 10.dp)
                .size(width = 3.dp, height = 34.dp)
                .clip(RoundedCornerShape(2.dp))
                .background(MaterialTheme.colorScheme.primary),
        )
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.primary,
            )
            Text(
                text = active.content.orEmpty().ifBlank { stringResource(R.string.chats_attachment) },
                style = MaterialTheme.typography.bodySmall,
                color = TextMid,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        IconButton(onClick = onCancel) {
            Icon(
                imageVector = Icons.Filled.Close,
                contentDescription = stringResource(
                    if (editing != null) R.string.edit_cancel else R.string.reply_cancel,
                ),
                tint = TextMid,
            )
        }
    }
}
