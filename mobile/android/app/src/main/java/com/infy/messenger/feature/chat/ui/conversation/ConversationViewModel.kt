package com.infy.messenger.feature.chat.ui.conversation

import android.net.Uri
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.infy.messenger.core.media.MediaUrlBuilder
import com.infy.messenger.core.media.VoiceRecorder
import com.infy.messenger.core.realtime.RealtimeClient
import com.infy.messenger.core.realtime.RealtimeSyncManager
import com.infy.messenger.feature.chat.domain.ChatMessage
import com.infy.messenger.feature.chat.domain.ChatRepository
import com.infy.messenger.feature.media.data.MediaRepository
import com.infy.messenger.feature.media.domain.MediaKind
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ConversationUiState(
    val messages: List<ChatMessage> = emptyList(),
    val isLoadingHistory: Boolean = false,
    val hasMoreHistory: Boolean = true,
    val partnerTyping: Boolean = false,
    val loadError: Boolean = false,
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
    val mediaUrlBuilder: MediaUrlBuilder,
) : ViewModel() {

    val chatId: String = checkNotNull(savedStateHandle["chatId"])

    /** Прогресс загрузки вложения (0..1) либо null. */
    val uploadProgress: StateFlow<Float?> = mediaRepository.uploadProgress

    private val _isRecordingVoice = MutableStateFlow(false)
    val isRecordingVoice: StateFlow<Boolean> = _isRecordingVoice

    private val historyCursor = MutableStateFlow<String?>(null)
    private val isLoadingHistory = MutableStateFlow(false)
    private val hasMoreHistory = MutableStateFlow(true)
    private val loadError = MutableStateFlow(false)

    private var typingJob: Job? = null

    val uiState: StateFlow<ConversationUiState> =
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

    fun toggleReaction(messageId: String, emoji: String) {
        viewModelScope.launch {
            runCatching { chatRepository.toggleReaction(messageId, emoji) }
        }
    }

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
    }
}
