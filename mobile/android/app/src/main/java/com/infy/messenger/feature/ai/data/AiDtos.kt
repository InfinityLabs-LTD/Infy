package com.infy.messenger.feature.ai.data

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

/** Ответ GET ai/status → { enabled }. */
@Serializable
data class StatusDto(
    val enabled: Boolean,
)

/**
 * Тело POST ai/chats/{chatId}/summary.
 * [period] — один из hour|day|week|month|year|all; либо явный диапазон [from]/[to] (ISO).
 */
@Serializable
data class SummaryRequest(
    val period: String? = null,
    val from: String? = null,
    val to: String? = null,
)

/** Ответ summary → { summary, messageCount, period }. */
@Serializable
data class SummaryDto(
    val summary: String,
    val messageCount: Int = 0,
    val period: String? = null,
)

/** Ответ POST ai/chats/{chatId}/replies → { replies: [...] }. */
@Serializable
data class RepliesDto(
    val replies: List<String> = emptyList(),
)

/** Ответ GET ai/chats/{chatId}/conversation → { id, messages: [...] }. */
@Serializable
data class ConversationDto(
    val id: String,
    val messages: List<AiMessageDto> = emptyList(),
)

/** Сообщение приватного диалога ассистента. [role] = USER|ASSISTANT. */
@Serializable
data class AiMessageDto(
    val id: String,
    val role: String,
    val content: String,
    // Произвольный JSON (toolsUsed, usedWebSearch и т.п.); в UI не используется.
    val meta: JsonElement? = null,
    val createdAt: String? = null,
)

/** Тело POST ai/chats/{chatId}/conversation. [message] — 1..4000. */
@Serializable
data class SendMessageRequest(
    val message: String,
)

/** Ответ отправки в ассистент → { reply, toolsUsed, usedWebSearch, conversationId }. */
@Serializable
data class SendReplyDto(
    val reply: String,
    val toolsUsed: List<String> = emptyList(),
    val usedWebSearch: Boolean = false,
    val conversationId: String? = null,
)

/** Тело POST ai/chats/{chatId}/ask. [question] — 1..4000. */
@Serializable
data class AskRequest(
    val question: String,
)
