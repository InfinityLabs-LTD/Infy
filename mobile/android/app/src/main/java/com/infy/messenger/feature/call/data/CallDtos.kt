package com.infy.messenger.feature.call.data

import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive

/** Ответ GET /calls/ice. */
@Serializable
data class IceServersDto(
    val iceServers: List<IceServerDto> = emptyList(),
)

/**
 * ICE-сервер. Поле `urls` бэкенд отдаёт то строкой, то массивом строк —
 * кастомный сериализатор приводит оба варианта к списку.
 */
@Serializable
data class IceServerDto(
    @Serializable(with = StringOrListSerializer::class)
    val urls: List<String>,
    val username: String? = null,
    val credential: String? = null,
)

/** Принимает строку ИЛИ массив строк, всегда отдаёт List<String>. */
object StringOrListSerializer : KSerializer<List<String>> {
    override val descriptor: SerialDescriptor =
        PrimitiveSerialDescriptor("urls", PrimitiveKind.STRING)

    override fun deserialize(decoder: Decoder): List<String> {
        val input = decoder as? JsonDecoder ?: return emptyList()
        return when (val element = input.decodeJsonElement()) {
            is JsonArray -> element.jsonArray.map { it.jsonPrimitive.content }
            is JsonPrimitive -> listOf(element.content)
            else -> emptyList()
        }
    }

    override fun serialize(encoder: Encoder, value: List<String>) {
        encoder.encodeString(value.firstOrNull().orEmpty())
    }
}

// ── История звонков ──────────────────────────────────────────────────

@Serializable
data class CallHistoryPageDto(
    val calls: List<CallHistoryItemDto> = emptyList(),
    val nextCursor: String? = null,
)

@Serializable
data class CallHistoryItemDto(
    val id: String,
    val chatId: String,
    val media: String,
    val status: String,
    val direction: String, // "incoming" | "outgoing"
    val missed: Boolean = false,
    val durationSec: Int = 0,
    val createdAt: String,
    val peer: CallPeerDto? = null,
)

@Serializable
data class CallPeerDto(
    val id: String,
    val username: String,
    val nickname: String,
    val avatarUrl: String? = null,
)
