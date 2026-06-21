package com.infy.messenger.feature.chat.data.local

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/** Кэш элемента списка диалогов. */
@Entity(tableName = "chats")
data class ChatEntity(
    @PrimaryKey val id: String,
    val partnerId: String?,
    val partnerUsername: String?,
    val partnerNickname: String?,
    val partnerAvatarUrl: String?,
    val partnerLastSeenAt: Long?,
    val lastMessageContent: String?,
    val lastMessageType: String?,
    val lastMessageIsOwn: Boolean,
    val lastMessageAt: Long?,
    val unreadCount: Int,
    val partnerLastReadMessageId: String?,
    val createdAt: Long,
)

/**
 * Кэш сообщения. Первичный ключ — [localId]: для подтверждённых это серверный id,
 * для оптимистичных (ещё без серверного id) — clientMessageId. Это позволяет
 * заменить оптимистичную запись на подтверждённую без дубликата.
 *
 * [sortKey] определяет порядок: у подтверждённых = серверный ULID (лексикографически
 * сортируем), у оптимистичных = "~" + время (после всех реальных id, т.к. '~' > 'Z'/'z'
 * в ASCII), чтобы свежеотправленное было внизу ленты.
 */
@Entity(
    tableName = "messages",
    indices = [Index("chatId"), Index("clientMessageId")],
)
data class MessageEntity(
    @PrimaryKey val localId: String,
    val serverId: String?,
    val chatId: String,
    val content: String?,
    val type: String,
    val createdAt: Long,
    val editedAt: Long?,
    val pinnedAt: Long?,
    val senderId: String,
    val senderNickname: String,
    val senderAvatarUrl: String?,
    val isOwn: Boolean,
    /** JSON ReplyPreview или null. */
    val replyToJson: String?,
    /** JSON List<MessageReaction>. */
    val reactionsJson: String,
    /** JSON List<Attachment>. */
    val attachmentsJson: String,
    val clientMessageId: String?,
    /** Имя [com.infy.messenger.feature.chat.domain.DeliveryStatus]. */
    val deliveryStatus: String,
    val sortKey: String,
)
