package com.infy.messenger.feature.chat

import com.infy.messenger.feature.chat.data.optimisticSortKey
import com.infy.messenger.feature.chat.data.toDomain
import com.infy.messenger.feature.chat.data.toEntity
import com.infy.messenger.feature.chat.data.dto.MessageDto
import com.infy.messenger.feature.chat.data.dto.MessageSenderDto
import com.infy.messenger.feature.chat.domain.DeliveryStatus
import com.infy.messenger.feature.chat.domain.MessageType
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ChatMapperTest {

    private fun dto(id: String, senderId: String, content: String = "hi") = MessageDto(
        id = id,
        chatId = "chat1",
        content = content,
        type = "TEXT",
        createdAt = "2026-06-21T10:00:00.000Z",
        sender = MessageSenderDto(id = senderId, username = "u", nickname = "Nick"),
    )

    @Test
    fun `confirmed message uses server id as sortKey and is marked SENT`() {
        val entity = dto("01ULID", senderId = "42").toEntity(currentUserId = "42")
        assertEquals("01ULID", entity.sortKey)
        assertEquals("01ULID", entity.serverId)
        assertEquals(DeliveryStatus.SENT.name, entity.deliveryStatus)
    }

    @Test
    fun `isOwn computed from sender id vs current user`() {
        assertTrue(dto("a", senderId = "42").toEntity("42").isOwn)
        assertTrue(!dto("a", senderId = "99").toEntity("42").isOwn)
    }

    @Test
    fun `optimistic sortKey sorts after any ULID`() {
        // ULID — base32 (заканчивается цифрами/буквами A-Z), '~' (0x7E) больше любого из них.
        val optimistic = optimisticSortKey(1_000L)
        assertTrue(optimistic > "ZZZZZZZZZZZZZZZZZZZZZZZZZZ")
        assertTrue(optimistic > "01J0000000000000000000000Z")
    }

    @Test
    fun `entity round-trips to domain preserving fields`() {
        val domain = dto("01ULID", senderId = "42", content = "hello").toEntity("42").toDomain()
        assertEquals("01ULID", domain.id)
        assertEquals("hello", domain.content)
        assertEquals(MessageType.TEXT, domain.type)
        assertTrue(domain.isOwn)
        assertEquals(DeliveryStatus.SENT, domain.deliveryStatus)
    }
}
