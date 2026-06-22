package com.infy.messenger.feature.ai.ui

import androidx.annotation.StringRes
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.infy.messenger.R
import com.infy.messenger.feature.ai.data.AiRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Вкладки панели Infy AI. */
enum class AiTab { ASSISTANT, SUMMARY }

/** Период сводки (соответствует кодам бэкенда). */
enum class SummaryPeriod(val code: String, @StringRes val labelRes: Int) {
    ALL("all", R.string.ai_summary_period_all),
    WEEK("week", R.string.ai_summary_period_week),
    MONTH("month", R.string.ai_summary_period_month),
}

/** Локальное сообщение приватного диалога ассистента. */
data class AiChatMessage(
    val id: String,
    val isUser: Boolean,
    val content: String,
)

/** Состояние панели Infy AI (обе вкладки). */
data class AiUiState(
    val tab: AiTab = AiTab.ASSISTANT,
    /** Статус доступности AI: null = ещё загружается. */
    val enabled: Boolean? = null,
    val isLoading: Boolean = true,
    // ── Ассистент ──
    val messages: List<AiChatMessage> = emptyList(),
    val input: String = "",
    /** Ждём ответ ассистента — показываем typing-dots. */
    val isSending: Boolean = false,
    // ── Сводка ──
    val summaryPeriod: SummaryPeriod = SummaryPeriod.ALL,
    val isAnalyzing: Boolean = false,
    val summaryText: String? = null,
    val summaryMessageCount: Int = 0,
    // ── Общая ошибка (строковый ресурс) ──
    @StringRes val errorMessage: Int? = null,
)

/**
 * Логика панели Infy AI: статус доступности, приватный диалог (история, отправка,
 * очистка, индикатор «печатает») и сводка по чату за выбранный период.
 * chatId передаётся через [load] из LaunchedEffect.
 */
@HiltViewModel
class AiViewModel @Inject constructor(
    private val repository: AiRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(AiUiState())
    val uiState: StateFlow<AiUiState> = _uiState.asStateFlow()

    private var chatId: String? = null

    /** Загрузить состояние для чата. Идемпотентно. */
    fun load(chatId: String) {
        this.chatId = chatId
        _uiState.update { it.copy(isLoading = true, errorMessage = null) }
        viewModelScope.launch {
            runCatching {
                val status = repository.status()
                if (!status.enabled) return@runCatching Pair(false, emptyList<AiChatMessage>())
                val conversation = repository.getConversation(chatId)
                Pair(true, conversation.messages.map { it.toLocal() })
            }.onSuccess { (enabled, messages) ->
                _uiState.update {
                    it.copy(isLoading = false, enabled = enabled, messages = messages)
                }
            }.onFailure {
                // Сбой статуса/истории трактуем как «AI недоступен», не падаем.
                _uiState.update {
                    it.copy(isLoading = false, enabled = false, errorMessage = R.string.ai_disabled)
                }
            }
        }
    }

    fun selectTab(tab: AiTab) = _uiState.update { it.copy(tab = tab) }

    fun onInputChange(value: String) = _uiState.update { it.copy(input = value) }

    /** Отправить сообщение ассистенту: оптимистично добавляем своё, ждём reply. */
    fun send() {
        val id = chatId ?: return
        val text = _uiState.value.input.trim()
        if (text.isEmpty() || _uiState.value.isSending) return
        val userMsg = AiChatMessage(
            id = "local-${System.currentTimeMillis()}",
            isUser = true,
            content = text,
        )
        _uiState.update {
            it.copy(
                messages = it.messages + userMsg,
                input = "",
                isSending = true,
                errorMessage = null,
            )
        }
        viewModelScope.launch {
            runCatching { repository.sendToAssistant(id, text) }
                .onSuccess { reply ->
                    val assistantMsg = AiChatMessage(
                        id = "local-reply-${System.currentTimeMillis()}",
                        isUser = false,
                        content = reply.reply,
                    )
                    _uiState.update {
                        it.copy(messages = it.messages + assistantMsg, isSending = false)
                    }
                }
                .onFailure {
                    _uiState.update {
                        it.copy(isSending = false, errorMessage = R.string.ai_error)
                    }
                }
        }
    }

    /** Очистить историю приватного диалога. */
    fun clearConversation() {
        val id = chatId ?: return
        viewModelScope.launch {
            runCatching { repository.clearConversation(id) }
                .onSuccess { _uiState.update { it.copy(messages = emptyList()) } }
                .onFailure { _uiState.update { it.copy(errorMessage = R.string.ai_error) } }
        }
    }

    fun selectPeriod(period: SummaryPeriod) = _uiState.update { it.copy(summaryPeriod = period) }

    /** Запросить сводку по чату за выбранный период. */
    fun analyze() {
        val id = chatId ?: return
        if (_uiState.value.isAnalyzing) return
        val period = _uiState.value.summaryPeriod
        _uiState.update { it.copy(isAnalyzing = true, errorMessage = null) }
        viewModelScope.launch {
            runCatching { repository.summary(id, period = period.code) }
                .onSuccess { dto ->
                    _uiState.update {
                        it.copy(
                            isAnalyzing = false,
                            summaryText = dto.summary,
                            summaryMessageCount = dto.messageCount,
                        )
                    }
                }
                .onFailure {
                    _uiState.update {
                        it.copy(isAnalyzing = false, errorMessage = R.string.ai_error)
                    }
                }
        }
    }

    fun consumeError() = _uiState.update { it.copy(errorMessage = null) }

    private fun com.infy.messenger.feature.ai.data.AiMessageDto.toLocal(): AiChatMessage =
        AiChatMessage(
            id = id,
            isUser = role.equals("USER", ignoreCase = true),
            content = content,
        )
}
