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

    // ── Звонки (WebRTC сигналинг) ────────────────────────────────────

    /** Нам звонят. */
    data class CallIncoming(
        val callId: String,
        val chatId: String,
        val media: String,
        val fromId: String,
        val fromUsername: String,
        val fromNickname: String,
        val fromAvatarUrl: String?,
    ) : RealtimeEvent

    /** Наш исходящий пошёл (получатель получил incoming). */
    data class CallRinging(val callId: String, val chatId: String, val media: String) : RealtimeEvent

    /** Получатель принял — инициатор шлёт offer. */
    data class CallAccepted(val callId: String) : RealtimeEvent

    /** Ретрансляция SDP/ICE от пира (data — непрозрачный JSON-объект). */
    data class CallSignal(val callId: String, val fromId: String, val dataJson: String) : RealtimeEvent

    /** Изменение медиа-состояния пира (mute/камера/экран). */
    data class CallMediaState(
        val callId: String,
        val fromId: String,
        val micOn: Boolean?,
        val camOn: Boolean?,
        val screenOn: Boolean?,
    ) : RealtimeEvent

    /** Звонок завершён. */
    data class CallEnded(
        val callId: String,
        val chatId: String,
        val reason: String,
        val status: String,
        val durationSec: Int,
        val by: String?,
    ) : RealtimeEvent

    /** Звонок принят на другом устройстве получателя. */
    data class CallTakenElsewhere(val callId: String) : RealtimeEvent

    /** Абонент занят. */
    data class CallPeerBusy(val chatId: String) : RealtimeEvent
}

/** Состояние соединения с realtime-сервером. */
enum class ConnectionState {
    DISCONNECTED, CONNECTING, CONNECTED,
}
