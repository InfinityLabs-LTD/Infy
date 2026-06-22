package com.infy.messenger.feature.profile.ui

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.infy.messenger.core.media.MediaUrlBuilder
import com.infy.messenger.feature.chat.data.dto.MessageDto
import com.infy.messenger.feature.profile.data.PublicProfileDto
import com.infy.messenger.feature.profile.data.UserProfileRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Активная вкладка панели профиля. */
enum class UserProfileTab { MEDIA, AUDIO }

data class UserProfileUiState(
    val isLoading: Boolean = true,
    val loadError: Boolean = false,
    val profile: PublicProfileDto? = null,
    /** id direct-чата с этим пользователем (для подгрузки медиа и кнопки «Написать»). */
    val chatId: String? = null,
    val tab: UserProfileTab = UserProfileTab.MEDIA,
    /** Фото и видео (type IMAGE/VIDEO). */
    val media: List<MessageDto> = emptyList(),
    /** Голосовые и кружки (type AUDIO/CIRCLE_VIDEO). */
    val audio: List<MessageDto> = emptyList(),
    val mediaLoading: Boolean = false,
    val nextCursor: String? = null,
    val loadingMore: Boolean = false,
)

/**
 * Экран публичного профиля другого пользователя (паритет с web PartnerInfoPanel +
 * страница /u/:username). Грузит профиль по username, затем направление-чат и его медиа.
 */
@HiltViewModel
class UserProfileViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val repository: UserProfileRepository,
    val mediaUrlBuilder: MediaUrlBuilder,
) : ViewModel() {

    private val username: String = savedStateHandle.get<String>("username").orEmpty()

    private val _uiState = MutableStateFlow(UserProfileUiState())
    val uiState: StateFlow<UserProfileUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun load() {
        _uiState.update { it.copy(isLoading = true, loadError = false) }
        viewModelScope.launch {
            try {
                val profile = repository.getPublicProfile(username)
                _uiState.update { it.copy(isLoading = false, profile = profile) }
                loadMedia(profile.id)
            } catch (_: Throwable) {
                _uiState.update { it.copy(isLoading = false, loadError = true) }
            }
        }
    }

    /** Получает/создаёт чат и грузит первую страницу медиа. Ошибки не валят экран профиля. */
    private fun loadMedia(partnerId: String) {
        _uiState.update { it.copy(mediaLoading = true) }
        viewModelScope.launch {
            try {
                val chatId = repository.getOrCreateDirectChatId(partnerId)
                val page = repository.getChatMedia(chatId)
                _uiState.update {
                    it.copy(
                        chatId = chatId,
                        nextCursor = page.nextCursor,
                        media = page.messages.filter { m -> m.type == "IMAGE" || m.type == "VIDEO" },
                        audio = page.messages.filter { m -> m.type == "AUDIO" || m.type == "CIRCLE_VIDEO" },
                        mediaLoading = false,
                    )
                }
            } catch (_: Throwable) {
                // Профиль уже показан; вкладки просто останутся пустыми.
                _uiState.update { it.copy(mediaLoading = false) }
            }
        }
    }

    fun loadMore() {
        val state = _uiState.value
        val chatId = state.chatId ?: return
        val cursor = state.nextCursor ?: return
        if (state.loadingMore) return
        _uiState.update { it.copy(loadingMore = true) }
        viewModelScope.launch {
            try {
                val page = repository.getChatMedia(chatId, cursor)
                _uiState.update { cur ->
                    cur.copy(
                        nextCursor = page.nextCursor,
                        media = cur.media + page.messages.filter { m -> m.type == "IMAGE" || m.type == "VIDEO" },
                        audio = cur.audio + page.messages.filter { m -> m.type == "AUDIO" || m.type == "CIRCLE_VIDEO" },
                        loadingMore = false,
                    )
                }
            } catch (_: Throwable) {
                _uiState.update { it.copy(loadingMore = false) }
            }
        }
    }

    fun selectTab(tab: UserProfileTab) {
        _uiState.update { it.copy(tab = tab) }
    }

    /** Открывает чат с пользователем. Если chatId ещё не получен — создаёт на лету. */
    fun startChat(onOpenChat: (String) -> Unit) {
        val existing = _uiState.value.chatId
        if (existing != null) {
            onOpenChat(existing)
            return
        }
        val partnerId = _uiState.value.profile?.id ?: return
        viewModelScope.launch {
            try {
                val chatId = repository.getOrCreateDirectChatId(partnerId)
                _uiState.update { it.copy(chatId = chatId) }
                onOpenChat(chatId)
            } catch (_: Throwable) {
                // Молча: ошибку покажем только при загрузке профиля.
            }
        }
    }
}
