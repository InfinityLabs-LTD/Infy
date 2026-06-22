package com.infy.messenger.feature.chat.data

import com.infy.messenger.core.util.parseIsoToMillis
import com.infy.messenger.core.util.parseIsoToMillisOrNow
import com.infy.messenger.feature.chat.data.dto.ChatSummaryDto
import com.infy.messenger.feature.chat.data.dto.MessageDto
import com.infy.messenger.feature.chat.data.local.ChatEntity
import com.infy.messenger.feature.chat.data.local.MessageEntity
import com.infy.messenger.feature.chat.domain.Attachment
import com.infy.messenger.feature.chat.domain.ChatMessage
import com.infy.messenger.feature.chat.domain.ChatPartner
import com.infy.messenger.feature.chat.domain.ChatSummary
import com.infy.messenger.feature.chat.domain.DeliveryStatus
import com.infy.messenger.feature.chat.domain.MessageReaction
import com.infy.messenger.feature.chat.domain.MessageType
import com.infy.messenger.feature.chat.domain.ReplyPreview
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

// ── JSON-формы для упаковки сложных полей в Room ─────────────────────

@Serializable
private data class ReactionJson(val emoji: String, val count: Int, val userIds: List<String>)

@Serializable
private data class ReplyJson(
    val id: String,
    val content: String?,
    val type: String,
    val deleted: Boolean,
    val senderNickname: String,
)

@Serializable
private data class AttachmentJson(
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

private val mapperJson = Json { ignoreUnknownKeys = true }

/** Префикс sortKey для оптимистичных сообщений — после любого ULID. */
private const val OPTIMISTIC_SORT_PREFIX = "~"

fun optimisticSortKey(createdAt: Long): String = "$OPTIMISTIC_SORT_PREFIX$createdAt"

// ── Список чатов ─────────────────────────────────────────────────────

fun ChatSummaryDto.toEntity(): ChatEntity = ChatEntity(
    id = id,
    partnerId = partner?.id,
    partnerUsername = partner?.username,
    partnerNickname = partner?.nickname,
    partnerAvatarUrl = partner?.avatarUrl,
    partnerLastSeenAt = parseIsoToMillis(partner?.lastSeenAt),
    lastMessageContent = lastMessage?.content,
    lastMessageType = lastMessage?.type,
    lastMessageIsOwn = lastMessage?.isOwn ?: false,
    lastMessageAt = parseIsoToMillis(lastMessage?.createdAt),
    unreadCount = unreadCount,
    partnerLastReadMessageId = partnerLastReadMessageId,
    createdAt = parseIsoToMillisOrNow(createdAt),
)

fun ChatEntity.toDomain(): ChatSummary = ChatSummary(
    id = id,
    partner = partnerId?.let {
        ChatPartner(
            id = it,
            username = partnerUsername.orEmpty(),
            nickname = partnerNickname.orEmpty(),
            avatarUrl = partnerAvatarUrl,
            lastSeenAt = partnerLastSeenAt,
        )
    },
    lastMessagePreview = lastMessageContent,
    lastMessageType = MessageType.from(lastMessageType),
    lastMessageIsOwn = lastMessageIsOwn,
    lastMessageAt = lastMessageAt,
    unreadCount = unreadCount,
    partnerLastReadMessageId = partnerLastReadMessageId,
    createdAt = createdAt,
)

// ── Сообщения ────────────────────────────────────────────────────────

/**
 * DTO → Entity. [currentUserId] нужен для вычисления isOwn (бэк отдаёт sender.id,
 * флага own на сообщении нет). Подтверждённое сообщение: localId = серверный id.
 */
fun MessageDto.toEntity(currentUserId: String): MessageEntity {
    val reactionsJson = mapperJson.encodeToString(
        reactions.map { ReactionJson(it.emoji, it.count, it.userIds) },
    )
    val attachmentsJson = mapperJson.encodeToString(
        attachments.map {
            AttachmentJson(
                id = it.id,
                storageKey = it.storageKey,
                fileName = it.fileName,
                thumbnailKey = it.thumbnailKey,
                mimeType = it.mimeType,
                sizeBytes = it.sizeBytes,
                width = it.width,
                height = it.height,
                durationMs = it.durationMs,
                waveform = it.waveform,
                transcript = it.transcript,
                listenedAt = parseIsoToMillis(it.listenedAt),
            )
        },
    )
    val replyJson = replyTo?.let {
        mapperJson.encodeToString(
            ReplyJson(it.id, it.content, it.type, it.deleted, it.sender.nickname),
        )
    }
    val createdMillis = parseIsoToMillisOrNow(createdAt)
    val own = sender.id == currentUserId
    return MessageEntity(
        localId = id,
        serverId = id,
        chatId = chatId,
        content = content,
        type = type,
        createdAt = createdMillis,
        editedAt = parseIsoToMillis(editedAt),
        pinnedAt = parseIsoToMillis(pinnedAt),
        senderId = sender.id,
        senderNickname = sender.nickname,
        senderAvatarUrl = sender.avatarUrl,
        isOwn = own,
        replyToJson = replyJson,
        reactionsJson = reactionsJson,
        attachmentsJson = attachmentsJson,
        clientMessageId = clientMessageId,
        // Подтверждённые — sortKey = серверный ULID (естественный порядок по времени).
        deliveryStatus = DeliveryStatus.SENT.name,
        sortKey = id,
    )
}

fun MessageEntity.toDomain(): ChatMessage {
    val reactions = runCatching {
        mapperJson.decodeFromString<List<ReactionJson>>(reactionsJson)
    }.getOrDefault(emptyList()).map { MessageReaction(it.emoji, it.count, it.userIds) }

    val reply = replyToJson?.let {
        runCatching { mapperJson.decodeFromString<ReplyJson>(it) }.getOrNull()
    }?.let {
        ReplyPreview(it.id, it.content, MessageType.from(it.type), it.deleted, it.senderNickname)
    }

    val attachments = runCatching {
        mapperJson.decodeFromString<List<AttachmentJson>>(attachmentsJson)
    }.getOrDefault(emptyList()).map {
        Attachment(
            id = it.id,
            storageKey = it.storageKey,
            fileName = it.fileName,
            thumbnailKey = it.thumbnailKey,
            mimeType = it.mimeType,
            sizeBytes = it.sizeBytes,
            width = it.width,
            height = it.height,
            durationMs = it.durationMs,
            waveform = it.waveform,
            transcript = it.transcript,
            listenedAt = it.listenedAt,
        )
    }

    return ChatMessage(
        id = serverId.orEmpty(),
        chatId = chatId,
        content = content,
        type = MessageType.from(type),
        createdAt = createdAt,
        editedAt = editedAt,
        pinnedAt = pinnedAt,
        senderId = senderId,
        senderNickname = senderNickname,
        senderAvatarUrl = senderAvatarUrl,
        isOwn = isOwn,
        replyTo = reply,
        reactions = reactions,
        attachments = attachments,
        clientMessageId = clientMessageId,
        deliveryStatus = runCatching { DeliveryStatus.valueOf(deliveryStatus) }
            .getOrDefault(DeliveryStatus.SENT),
    )
}
