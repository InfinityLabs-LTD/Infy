package com.infy.messenger.feature.chat.ui.list

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.infy.messenger.core.media.MediaUrlBuilder
import com.infy.messenger.core.realtime.ConnectionState
import com.infy.messenger.core.realtime.RealtimeSyncManager
import com.infy.messenger.feature.chat.domain.ChatRepository
import com.infy.messenger.feature.chat.domain.ChatSummary
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ChatListItemUi(
    val chat: ChatSummary,
    val isPartnerOnline: Boolean,
)

data class ChatListUiState(
    val items: List<ChatListItemUi> = emptyList(),
    val isRefreshing: Boolean = false,
    val connectionState: ConnectionState = ConnectionState.DISCONNECTED,
)

@HiltViewModel
class ChatListViewModel @Inject constructor(
    private val chatRepository: ChatRepository,
    private val realtimeSyncManager: RealtimeSyncManager,
    val mediaUrlBuilder: MediaUrlBuilder,
) : ViewModel() {

    val uiState: StateFlow<ChatListUiState> =
        combine(
            chatRepository.observeChats(),
            realtimeSyncManager.onlineUsers,
            realtimeSyncManager.connectionState,
        ) { chats, online, connection ->
            ChatListUiState(
                items = chats.map { chat ->
                    ChatListItemUi(
                        chat = chat,
                        isPartnerOnline = chat.partner?.id?.let { it in online } ?: false,
                    )
                },
                connectionState = connection,
            )
        }.stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5_000),
            initialValue = ChatListUiState(),
        )

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            // Ошибку сети глушим: список останется из кэша (offline-first).
            runCatching { chatRepository.refreshChats() }
        }
    }
}
