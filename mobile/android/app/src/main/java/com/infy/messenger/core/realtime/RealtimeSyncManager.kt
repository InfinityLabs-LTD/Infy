package com.infy.messenger.core.realtime

import com.infy.messenger.feature.auth.data.AuthState
import com.infy.messenger.feature.auth.data.SessionManager
import com.infy.messenger.feature.chat.data.ChatRepositoryImpl
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Связывает [RealtimeClient] с локальным кэшем и состоянием присутствия:
 *   - управляет жизненным циклом соединения по [AuthState];
 *   - применяет входящие события к Room через репозиторий;
 *   - держит набор online-пользователей и «печатает…» для UI.
 *
 * Запускается один раз из Application (см. InfyApp).
 */
@Singleton
class RealtimeSyncManager @Inject constructor(
    private val realtimeClient: RealtimeClient,
    private val chatRepository: ChatRepositoryImpl,
    private val sessionManager: SessionManager,
) {
    private val scope = CoroutineScope(SupervisorJob())

    private val _onlineUsers = MutableStateFlow<Set<String>>(emptySet())
    val onlineUsers: StateFlow<Set<String>> = _onlineUsers.asStateFlow()

    /** Набор (chatId,userId) тех, кто сейчас печатает. */
    private val _typingByChat = MutableStateFlow<Map<String, Set<String>>>(emptyMap())
    val typingByChat: StateFlow<Map<String, Set<String>>> = _typingByChat.asStateFlow()

    val connectionState: StateFlow<ConnectionState> get() = realtimeClient.connectionState

    fun start() {
        // Подключаемся/отключаемся в зависимости от авторизации.
        scope.launch {
            sessionManager.authState.collect { state ->
                when (state) {
                    is AuthState.Authenticated -> realtimeClient.connect()
                    AuthState.Unauthenticated -> {
                        realtimeClient.disconnect()
                        _onlineUsers.value = emptySet()
                        _typingByChat.value = emptyMap()
                    }
                    AuthState.Unknown -> Unit
                }
            }
        }

        // Применяем события к кэшу/состоянию.
        scope.launch {
            realtimeClient.events.collect { event -> handle(event) }
        }

        // После refresh пересобираем соединение со свежим access-токеном.
        scope.launch {
            sessionManager.tokensRefreshed.collect {
                realtimeClient.reconnectWithFreshToken()
            }
        }
    }

    private suspend fun handle(event: RealtimeEvent) {
        when (event) {
            is RealtimeEvent.MessageNew -> chatRepository.applyRealtimeMessage(event.message)
            is RealtimeEvent.MessageUpdated -> chatRepository.applyRealtimeMessage(event.message)
            is RealtimeEvent.MessageDeleted ->
                chatRepository.removeMessage(event.chatId, event.messageId)
            is RealtimeEvent.ChatDeleted -> chatRepository.removeChat(event.chatId)
            is RealtimeEvent.MessagesRead ->
                chatRepository.applyMessagesRead(event.chatId, event.userId, event.messageId)
            is RealtimeEvent.OnlineSnapshot -> _onlineUsers.value = event.userIds
            is RealtimeEvent.Presence -> _onlineUsers.update { current ->
                if (event.online) current + event.userId else current - event.userId
            }
            is RealtimeEvent.Typing -> _typingByChat.update { current ->
                val set = current[event.chatId].orEmpty()
                val updated = if (event.typing) set + event.userId else set - event.userId
                current + (event.chatId to updated)
            }
            else -> Unit
        }
    }
}
