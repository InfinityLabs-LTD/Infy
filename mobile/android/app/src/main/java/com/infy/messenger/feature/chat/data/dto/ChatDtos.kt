package com.infy.messenger.feature.chat.data.dto

import kotlinx.serialization.Serializable

// ── Список чатов (serializeChat на бэке) ─────────────────────────────

@Serializable
data class ChatSummaryDto(
    val id: String,
    val type: String? = null,
    val partner: ChatPartnerDto? = null,
    val lastMessage: LastMessageDto? = null,
    val unreadCount: Int = 0,
    val partnerLastReadMessageId: String? = null,
    val partnerReadAt: String? = null,
    val createdAt: String,
)

@Serializable
data class ChatPartnerDto(
    val id: String,
    val username: String,
    val nickname: String,
    val avatarUrl: String? = null,
    val lastSeenAt: String? = null,
)

@Serializable
data class LastMessageDto(
    val id: String,
    val content: String? = null,
    val type: String,
    val createdAt: String,
    val isOwn: Boolean = false,
)

// ── Сообщения (serializeMessage на бэке) ─────────────────────────────

@Serializable
data class MessageDto(
    val id: String,
    val chatId: String,
    val content: String? = null,
    val type: String,
    val createdAt: String,
    val editedAt: String? = null,
    val pinnedAt: String? = null,
    val clientMessageId: String? = null,
    val replyTo: ReplyToDto? = null,
    val sender: MessageSenderDto,
    val attachments: List<AttachmentDto> = emptyList(),
    val reactions: List<ReactionDto> = emptyList(),
)

@Serializable
data class MessageSenderDto(
    val id: String,
    val username: String,
    val nickname: String,
    val avatarUrl: String? = null,
)

@Serializable
data class ReplyToDto(
    val id: String,
    val content: String? = null,
    val type: String,
    val deleted: Boolean = false,
    val sender: ReplySenderDto,
)

@Serializable
data class ReplySenderDto(
    val id: String,
    val nickname: String,
)

@Serializable
data class ReactionDto(
    val emoji: String,
    val count: Int,
    val userIds: List<String> = emptyList(),
)

/** Вложение (детально используется на этапе 3; здесь — для парсинга превью). */
@Serializable
data class AttachmentDto(
    val id: String,
    val storageKey: String,
    val fileName: String? = null,
    val thumbnailKey: String? = null,
    val mimeType: String,
    val sizeBytes: Long? = null,
    val width: Int? = null,
    val height: Int? = null,
    val durationMs: Int? = null,
    // Бэкенд отдаёт нормализованные значения 0..1 (Float), НЕ целые —
    // иначе парсинг падает и весь чат не грузится («Не удалось загрузить…»).
    val waveform: List<Float> = emptyList(),
    val transcript: String? = null,
    val listenedAt: String? = null,
)

// ── Обёртки страниц/запросов ─────────────────────────────────────────

@Serializable
data class MessagePageDto(
    val messages: List<MessageDto> = emptyList(),
    val nextCursor: String? = null,
)

@Serializable
data class SendMessageRequest(
    val content: String? = null,
    val type: String = "TEXT",
    val replyToId: String? = null,
    val clientMessageId: String? = null,
    val attachment: AttachmentInput? = null,
)

/** Вложение для отправки (подмножество полей UploadResult, что принимает бэкенд). */
@Serializable
data class AttachmentInput(
    val storageKey: String,
    val fileName: String? = null,
    val thumbnailKey: String? = null,
    val mimeType: String,
    val sizeBytes: Long,
    val width: Int? = null,
    val height: Int? = null,
    val durationMs: Int? = null,
    val waveform: List<Float> = emptyList(),
)

@Serializable
data class ReactRequest(
    val emoji: String,
)

@Serializable
data class CreateChatRequest(
    val partnerId: String,
)
