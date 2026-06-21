package com.infy.messenger.core.realtime

import com.infy.messenger.feature.chat.data.dto.MessageDto

/** События реального времени, нормализованные из Socket.IO в типобезопасный вид. */
sealed interface RealtimeEvent {

    /** Новое сообщение (или системное/AI). */
    data class MessageNew(val message: MessageDto) : RealtimeEvent

    /** Сообщение отредактировано / обновлено (реакции, закрепление). */
    data class MessageUpdated(val message: MessageDto) : RealtimeEvent

    /** Сообщение удалено. */
    data class MessageDeleted(val chatId: String, val messageId: String) : RealtimeEvent

    /** Чат удалён у обоих участников. */
    data class ChatDeleted(val chatId: String) : RealtimeEvent

    /** Кто-то прочитал сообщения до messageId. */
    data class MessagesRead(
        val chatId: String,
        val userId: String,
        val messageId: String,
    ) : RealtimeEvent

    /** Индикатор «печатает…». */
    data class Typing(
        val chatId: String,
        val userId: String,
        val username: String,
        val typing: Boolean,
    ) : RealtimeEvent

    /** Снимок онлайн-пользователей при подключении. */
    data class OnlineSnapshot(val userIds: Set<String>) : RealtimeEvent

    /** Пользователь вошёл / вышел из сети. */
    data class Presence(
        val userId: String,
        val online: Boolean,
        val lastSeenAt: String?,
    ) : RealtimeEvent
}

/** Состояние соединения с realtime-сервером. */
enum class ConnectionState {
    DISCONNECTED, CONNECTING, CONNECTED,
}
