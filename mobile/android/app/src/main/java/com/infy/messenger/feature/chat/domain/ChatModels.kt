package com.infy.messenger.feature.chat.domain

/** Тип содержимого сообщения (зеркалит enum бэкенда). */
enum class MessageType {
    TEXT, IMAGE, VIDEO, AUDIO, CIRCLE_VIDEO, FILE, ALBUM, SYSTEM, AI, AI_QUERY, UNKNOWN;

    companion object {
        fun from(raw: String?): MessageType =
            entries.firstOrNull { it.name == raw } ?: UNKNOWN
    }
}

/** Статус доставки исходящего сообщения (только клиентская логика). */
enum class DeliveryStatus {
    /** Лежит в очереди / отправляется (оптимистичное сообщение). */
    SENDING,
    /** Подтверждено сервером (получили id). */
    SENT,
    /** Прочитано собеседником. */
    READ,
    /** Не удалось отправить — можно повторить. */
    FAILED,
}

/** Краткое представление собеседника в диалоге. */
data class ChatPartner(
    val id: String,
    val username: String,
    val nickname: String,
    val avatarUrl: String?,
    val lastSeenAt: Long?,
)

/** Элемент списка диалогов. */
data class ChatSummary(
    val id: String,
    val partner: ChatPartner?,
    val lastMessagePreview: String?,
    val lastMessageType: MessageType,
    val lastMessageIsOwn: Boolean,
    val lastMessageAt: Long?,
    val unreadCount: Int,
    /** id последнего прочитанного собеседником сообщения — для статуса «прочитано». */
    val partnerLastReadMessageId: String?,
    val createdAt: Long,
)

/** Реакция-эмодзи, сгруппированная по символу. */
data class MessageReaction(
    val emoji: String,
    val count: Int,
    val userIds: List<String>,
)

/** Вложение сообщения (изображение/видео/аудио/кружок/файл). */
data class Attachment(
    val id: String,
    val storageKey: String,
    val fileName: String?,
    val thumbnailKey: String?,
    val mimeType: String,
    val sizeBytes: Long?,
    val width: Int?,
    val height: Int?,
    val durationMs: Int?,
    val waveform: List<Float>,
    val transcript: String?,
    val listenedAt: Long?,
)

/** Краткое сообщение-цитата (ответ на сообщение). */
data class ReplyPreview(
    val id: String,
    val content: String?,
    val type: MessageType,
    val deleted: Boolean,
    val senderNickname: String,
)

/** Сообщение чата. */
data class ChatMessage(
    /** Серверный id (ULID). Для ещё не подтверждённых — пустой, см. [clientMessageId]. */
    val id: String,
    val chatId: String,
    val content: String?,
    val type: MessageType,
    val createdAt: Long,
    val editedAt: Long?,
    val pinnedAt: Long?,
    val senderId: String,
    val senderNickname: String,
    val senderAvatarUrl: String?,
    val isOwn: Boolean,
    val replyTo: ReplyPreview?,
    val reactions: List<MessageReaction>,
    val attachments: List<Attachment>,
    /** Идемпотентный клиентский id; присутствует у исходящих, переживает подтверждение. */
    val clientMessageId: String?,
    val deliveryStatus: DeliveryStatus,
)
