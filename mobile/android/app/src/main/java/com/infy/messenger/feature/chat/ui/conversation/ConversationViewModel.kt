package com.infy.messenger.feature.chat.ui.conversation

import android.net.Uri
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.infy.messenger.core.media.MediaUrlBuilder
import com.infy.messenger.core.media.VoiceRecorder
import com.infy.messenger.core.notification.ActiveChatTracker
import com.infy.messenger.core.notification.AppNotifier
import com.infy.messenger.core.realtime.RealtimeClient
import com.infy.messenger.core.realtime.RealtimeSyncManager
import com.infy.messenger.feature.ai.data.AiRepository
import com.infy.messenger.feature.call.data.CallManager
import com.infy.messenger.feature.call.domain.CallMedia
import com.infy.messenger.feature.call.domain.CallPeer
import com.infy.messenger.feature.chat.domain.ChatMessage
import com.infy.messenger.feature.chat.domain.ChatRepository
import com.infy.messenger.feature.media.data.MediaRepository
import com.infy.messenger.feature.media.domain.MediaKind
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject

data class ConversationUiState(
    val messages: List<ChatMessage> = emptyList(),
    val isLoadingHistory: Boolean = false,
    val hasMoreHistory: Boolean = true,
    val partnerTyping: Boolean = false,
    val loadError: Boolean = false,
    /** Имя и аватар собеседника для шапки (как в вебе). */
    val partnerName: String = "",
    val partnerUsername: String = "",
    val partnerAvatarUrl: String? = null,
    /** id собеседника — для открытия его профиля и presence. */
    val partnerId: String? = null,
    /** Собеседник сейчас в сети. */
    val partnerOnline: Boolean = false,
    /** «Был(а) в сети» (epoch ms) — если оффлайн. */
    val partnerLastSeenAt: Long? = null,
)

/**
 * Логика экрана переписки: история (курсорная пагинация), отправка с оптимистикой,
 * статусы доставки/прочтения, индикатор «печатает…», отметка прочитанного.
 * Сообщения и присутствие приходят из репозитория/realtime реактивно.
 */
@HiltViewModel
class ConversationViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val chatRepository: ChatRepository,
    private val realtimeClient: RealtimeClient,
    private val realtimeSyncManager: RealtimeSyncManager,
    private val mediaRepository: MediaRepository,
    private val voiceRecorder: VoiceRecorder,
    private val callManager: CallManager,
    private val aiRepository: AiRepository,
    private val activeChatTracker: ActiveChatTracker,
    private val notifier: AppNotifier,
    val mediaUrlBuilder: MediaUrlBuilder,
) : ViewModel() {

    val chatId: String = checkNotNull(savedStateHandle["chatId"])

    /** Экран переписки открыт: подавляем уведомления этого чата и снимаем старые. */
    fun onScreenActive() {
        activeChatTracker.setActiveChat(chatId)
        notifier.cancelChat(chatId)
    }

    /** Экран закрыт/ушёл в фон: больше не подавляем уведомления этого чата. */
    fun onScreenInactive() {
        activeChatTracker.setActiveChat(null)
    }

    /** Прогресс загрузки вложения (0..1) либо null. */
    val uploadProgress: StateFlow<Float?> = mediaRepository.uploadProgress

    private val _isRecordingVoice = MutableStateFlow(false)
    val isRecordingVoice: StateFlow<Boolean> = _isRecordingVoice

    private val historyCursor = MutableStateFlow<String?>(null)
    private val isLoadingHistory = MutableStateFlow(false)
    private val hasMoreHistory = MutableStateFlow(true)
    private val loadError = MutableStateFlow(false)

    private var typingJob: Job? = null

    /** Собеседник текущего чата из кэша списка (имя + относительный avatarUrl). */
    private val partnerFlow = chatRepository.observeChats()
        .map { chats -> chats.firstOrNull { it.id == chatId }?.partner }
        .distinctUntilChanged()

    // Базовое состояние из 5 потоков (типизированный overload combine), затем
    // отдельным combine домешиваем собеседника — так избегаем нетипизированного
    // vararg-combine для разнотипных потоков.
    private val baseState: Flow<ConversationUiState> =
        combine(
            chatRepository.observeMessages(chatId),
            realtimeSyncManager.typingByChat.map { it[chatId].orEmpty().isNotEmpty() },
            isLoadingHistory,
            hasMoreHistory,
            loadError,
        ) { messages, partnerTyping, loading, hasMore, error ->
            ConversationUiState(
                messages = messages,
                isLoadingHistory = loading,
                hasMoreHistory = hasMore,
                partnerTyping = partnerTyping,
                loadError = error,
            )
        }

    val uiState: StateFlow<ConversationUiState> =
        combine(
            baseState,
            partnerFlow,
            realtimeSyncManager.onlineUsers,
            realtimeSyncManager.lastSeen,
        ) { state, partner, online, lastSeen ->
            val partnerId = partner?.id
            // Онлайн из realtime; «был в сети» — из realtime, иначе из кэша списка чатов.
            val isOnline = partnerId != null && partnerId in online
            val lastSeenMs = partnerId?.let { id ->
                lastSeen[id]?.let { runCatching { java.time.Instant.parse(it).toEpochMilli() }.getOrNull() }
            } ?: partner?.lastSeenAt
            state.copy(
                partnerName = partner?.nickname ?: partner?.username.orEmpty(),
                partnerUsername = partner?.username.orEmpty(),
                partnerAvatarUrl = mediaUrlBuilder.absoluteOrNull(partner?.avatarUrl),
                partnerId = partnerId,
                partnerOnline = isOnline,
                partnerLastSeenAt = lastSeenMs,
            )
        }.stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5_000),
            initialValue = ConversationUiState(isLoadingHistory = true),
        )

    init {
        realtimeClient.joinChat(chatId)
        loadMore()
    }

    /** Подгрузить более старую страницу истории. */
    fun loadMore() {
        if (isLoadingHistory.value || !hasMoreHistory.value) return
        isLoadingHistory.value = true
        loadError.value = false
        viewModelScope.launch {
            runCatching { chatRepository.loadMessagePage(chatId, historyCursor.value) }
                .onSuccess { page ->
                    historyCursor.value = page.nextCursor
                    hasMoreHistory.value = page.nextCursor != null
                }
                .onFailure { loadError.value = true }
            isLoadingHistory.value = false
        }
    }

    fun sendMessage(text: String, replyToId: String? = null) {
        val content = text.trim()
        if (content.isEmpty()) return
        stopTyping()
        // Команда /ask <вопрос> — спросить Infy AI прямо в чате. Ответ прилетит
        // асинхронно по сокету пузырями AI_QUERY/AI; обычное сообщение не шлём.
        if (content.startsWith(ASK_PREFIX)) {
            val question = content.removePrefix(ASK_PREFIX).trim()
            if (question.isNotEmpty()) {
                viewModelScope.launch {
                    runCatching { aiRepository.ask(chatId, question) }
                        .onFailure { Timber.w(it, "Infy AI /ask failed") }
                }
                return
            }
        }
        viewModelScope.launch {
            chatRepository.sendText(chatId, content, replyToId)
        }
    }

    fun retry(clientMessageId: String) {
        viewModelScope.launch {
            chatRepository.retrySend(chatId, clientMessageId)
        }
    }

    // ── Медиа ────────────────────────────────────────────────────────

    /** Отправить выбранное из галереи/файлов медиа. [durationMs] для видео, если известно. */
    fun sendMedia(uri: Uri, kind: MediaKind, durationMs: Long? = null) {
        viewModelScope.launch {
            runCatching { mediaRepository.sendMedia(chatId, uri, kind, durationMs) }
        }
    }

    /** Начать запись голосового. Разрешение RECORD_AUDIO проверяет UI. */
    fun startVoiceRecording() {
        runCatching {
            voiceRecorder.start()
            _isRecordingVoice.value = true
        }
    }

    /** Завершить запись и отправить (если запись достаточной длины). */
    fun stopAndSendVoice() {
        if (!_isRecordingVoice.value) return
        _isRecordingVoice.value = false
        val recording = voiceRecorder.stop() ?: return
        viewModelScope.launch {
            runCatching {
                mediaRepository.sendMedia(
                    chatId = chatId,
                    uri = recording.uri,
                    kind = MediaKind.AUDIO,
                    durationMs = recording.durationMs,
                )
            }
        }
    }

    /** Отменить запись без отправки. */
    fun cancelVoiceRecording() {
        if (!_isRecordingVoice.value) return
        _isRecordingVoice.value = false
        voiceRecorder.cancel()
    }

    /** Отправить записанный кружок (CIRCLE_VIDEO). */
    fun sendCircle(uri: Uri, durationMs: Long?) {
        viewModelScope.launch {
            runCatching {
                mediaRepository.sendMedia(chatId, uri, MediaKind.CIRCLE_VIDEO, durationMs)
            }
        }
    }

    /** Начать звонок собеседнику текущего чата (аудио или видео). */
    fun startCall(video: Boolean) {
        viewModelScope.launch {
            // Берём собеседника из кэша списка чатов.
            val chat = chatRepository.observeChats().first().firstOrNull { it.id == chatId }
            val partner = chat?.partner ?: return@launch
            callManager.startCall(
                chatId = chatId,
                peer = CallPeer(partner.id, partner.username, partner.nickname, partner.avatarUrl),
                media = if (video) CallMedia.VIDEO else CallMedia.AUDIO,
            )
        }
    }

    fun toggleReaction(messageId: String, emoji: String) {
        viewModelScope.launch {
            runCatching { chatRepository.toggleReaction(messageId, emoji) }
        }
    }

    /** Запросить расшифровку голосового/кружка. Бросает при ошибке (UI ловит). */
    suspend fun transcribe(messageId: String): String = chatRepository.transcribe(messageId)

    /** Пометить последнее видимое сообщение прочитанным. */
    fun markRead(messageId: String) {
        if (messageId.isBlank()) return
        viewModelScope.launch {
            runCatching { chatRepository.markRead(chatId, messageId) }
        }
    }

    /** Вызывать при вводе текста: шлёт typing_start и авто-стоп через паузу. */
    fun onTyping() {
        realtimeClient.typingStart(chatId)
        typingJob?.cancel()
        typingJob = viewModelScope.launch {
            delay(TYPING_TIMEOUT_MS)
            realtimeClient.typingStop(chatId)
        }
    }

    private fun stopTyping() {
        typingJob?.cancel()
        typingJob = null
        realtimeClient.typingStop(chatId)
    }

    override fun onCleared() {
        stopTyping()
        if (_isRecordingVoice.value) voiceRecorder.cancel()
        super.onCleared()
    }

    private companion object {
        const val TYPING_TIMEOUT_MS = 2_500L
        const val ASK_PREFIX = "/ask "
    }
}
