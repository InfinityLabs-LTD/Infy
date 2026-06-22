package com.infy.messenger.feature.chat.ui.search

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.infy.messenger.core.media.MediaUrlBuilder
import com.infy.messenger.core.util.parseIsoToMillisOrNow
import com.infy.messenger.feature.chat.data.remote.ChatApi
import com.infy.messenger.feature.chat.domain.ChatRepository
import com.infy.messenger.feature.chat.domain.ChatSummary
import com.infy.messenger.feature.profile.data.ProfileApi
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.emitAll
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Найденное сообщение для UI. */
data class MessageSearchResult(
    val messageId: String,
    val chatId: String,
    val content: String,
    val createdAt: Long,
    val isOwn: Boolean,
    val partnerNickname: String,
    val partnerAvatarUrl: String?,
)

/** Найденный новый контакт для UI. */
data class PeopleSearchResult(
    val id: String,
    val username: String,
    val nickname: String,
    val avatarUrl: String?,
)

data class SearchUiState(
    /** Запрос принят (≥ 2 символов) и идёт поиск/отрисовка результатов. */
    val isActive: Boolean = false,
    val isLoading: Boolean = false,
    val chats: List<ChatSummary> = emptyList(),
    val messages: List<MessageSearchResult> = emptyList(),
    val people: List<PeopleSearchResult> = emptyList(),
) {
    /** Запрос введён, но ничего не нашлось. */
    val isEmpty: Boolean
        get() = isActive && !isLoading &&
            chats.isEmpty() && messages.isEmpty() && people.isEmpty()
}

private const val MIN_QUERY_LENGTH = 2
private const val DEBOUNCE_MS = 350L

@OptIn(FlowPreview::class, kotlinx.coroutines.ExperimentalCoroutinesApi::class)
@HiltViewModel
class SearchViewModel @Inject constructor(
    private val chatRepository: ChatRepository,
    private val chatApi: ChatApi,
    private val profileApi: ProfileApi,
    val mediaUrlBuilder: MediaUrlBuilder,
) : ViewModel() {

    private val queryFlow = MutableStateFlow("")

    /** Сырой текст поля ввода — обновляется мгновенно (без дебаунса). */
    val query: StateFlow<String> = queryFlow.asStateFlow()

    /**
     * Результаты дебаунсятся и пересобираются при каждом новом запросе.
     * flatMapLatest сам отменяет предыдущий сетевой поиск (collectLatest-семантика).
     */
    val uiState: StateFlow<SearchUiState> =
        queryFlow
            .debounce(DEBOUNCE_MS)
            .map { it.trim() }
            .distinctUntilChanged()
            .flatMapLatest { q ->
                if (q.length < MIN_QUERY_LENGTH) {
                    flow { emit(SearchUiState(isActive = false)) }
                } else {
                    searchFlow(q)
                }
            }
            .stateIn(
                scope = viewModelScope,
                started = SharingStarted.WhileSubscribed(5_000),
                initialValue = SearchUiState(),
            )

    fun onQueryChange(value: String) {
        queryFlow.value = value
    }

    fun clearQuery() {
        queryFlow.value = ""
    }

    /**
     * Создаёт/получает direct-чат с пользователем и возвращает его id колбэком.
     * Ошибку глушим — UI просто не выполнит переход.
     */
    fun openChatWith(partnerId: String, onChatReady: (String) -> Unit) {
        viewModelScope.launch {
            runCatching { chatRepository.getOrCreateDirectChat(partnerId) }
                .onSuccess(onChatReady)
        }
    }

    /** Поток одного поиска: локальные чаты реактивно + сетевые сообщения/люди. */
    private fun searchFlow(q: String) = flow {
        emit(SearchUiState(isActive = true, isLoading = true))

        // Сетевые запросы параллельно; ошибки → пустой список (offline-friendly).
        val messages = runCatching { chatApi.searchMessages(q).data }
            .getOrDefault(emptyList())
            .map { dto ->
                MessageSearchResult(
                    messageId = dto.messageId,
                    chatId = dto.chatId,
                    content = dto.content.orEmpty(),
                    createdAt = parseIsoToMillisOrNow(dto.createdAt),
                    isOwn = dto.isOwn,
                    partnerNickname = dto.partner?.nickname
                        ?: dto.partner?.username.orEmpty(),
                    partnerAvatarUrl = dto.partner?.avatarUrl,
                )
            }

        val people = runCatching { profileApi.searchUsers(q).data }
            .getOrDefault(emptyList())
            .map { dto ->
                PeopleSearchResult(
                    id = dto.id,
                    username = dto.username,
                    nickname = dto.nickname,
                    avatarUrl = dto.avatarUrl,
                )
            }

        // Локальные чаты реактивно: фильтр по nickname/username + исключение
        // из «людей» тех, с кем уже есть direct-чат (паритет с web).
        emitAll(
            chatRepository.observeChats().map { chats ->
                val matchedChats = chats.filter { chat ->
                    val partner = chat.partner ?: return@filter false
                    partner.nickname.contains(q, ignoreCase = true) ||
                        partner.username.contains(q, ignoreCase = true)
                }
                val existingPartnerIds = chats.mapNotNull { it.partner?.id }.toSet()
                SearchUiState(
                    isActive = true,
                    isLoading = false,
                    chats = matchedChats,
                    messages = messages,
                    people = people.filter { it.id !in existingPartnerIds },
                )
            },
        )
    }
}
