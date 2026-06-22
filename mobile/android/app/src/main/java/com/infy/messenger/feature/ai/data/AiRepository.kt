package com.infy.messenger.feature.ai.data

import com.infy.messenger.core.network.apiCall
import com.infy.messenger.core.network.ensureSuccessOrThrow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Репозиторий Infy AI. Тонкая обёртка над [AiApi]: все вызовы проходят через
 * [apiCall], приводящий сбои к ApiError. Возвращает DTO напрямую —
 * они простые и сериализуемые, отдельный доменный слой не нужен.
 */
@Singleton
class AiRepository @Inject constructor(
    private val api: AiApi,
) {
    /** Доступен ли Infy AI на сервере. */
    suspend fun status(): StatusDto =
        apiCall { api.status().data }

    /** Сводка по чату за период (all/week/month/…) либо явный диапазон from/to. */
    suspend fun summary(
        chatId: String,
        period: String? = null,
        from: String? = null,
        to: String? = null,
    ): SummaryDto =
        apiCall { api.summary(chatId, SummaryRequest(period = period, from = from, to = to)).data }

    /** Подсказки ответов для чата. */
    suspend fun replies(chatId: String): List<String> =
        apiCall { api.replies(chatId).data.replies }

    /** История приватного диалога с ассистентом. */
    suspend fun getConversation(chatId: String): ConversationDto =
        apiCall { api.getConversation(chatId).data }

    /** Отправить сообщение ассистенту, получить ответ (синхронно). */
    suspend fun sendToAssistant(chatId: String, text: String): SendReplyDto =
        apiCall { api.sendMessage(chatId, SendMessageRequest(message = text)).data }

    /** Очистить историю приватного диалога. */
    suspend fun clearConversation(chatId: String) =
        apiCall { api.clearConversation(chatId).ensureSuccessOrThrow() }

    /** Спросить Infy AI в чате (/ask): ответ прилетит асинхронно по сокету. */
    suspend fun ask(chatId: String, question: String) =
        apiCall { api.ask(chatId, AskRequest(question = question)).ensureSuccessOrThrow() }
}
