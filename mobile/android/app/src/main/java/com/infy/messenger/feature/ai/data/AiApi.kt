package com.infy.messenger.feature.ai.data

import com.infy.messenger.core.network.ApiEnvelope
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

/**
 * Retrofit-интерфейс Infy AI. Базовый префикс `.../api/` уже в baseUrl,
 * поэтому пути относительные (без ведущего слэша). Зеркалит web-контракты.
 */
interface AiApi {

    @GET("ai/status")
    suspend fun status(): ApiEnvelope<StatusDto>

    @POST("ai/chats/{chatId}/summary")
    suspend fun summary(
        @Path("chatId") chatId: String,
        @Body body: SummaryRequest,
    ): ApiEnvelope<SummaryDto>

    @POST("ai/chats/{chatId}/replies")
    suspend fun replies(@Path("chatId") chatId: String): ApiEnvelope<RepliesDto>

    @GET("ai/chats/{chatId}/conversation")
    suspend fun getConversation(@Path("chatId") chatId: String): ApiEnvelope<ConversationDto>

    @POST("ai/chats/{chatId}/conversation")
    suspend fun sendMessage(
        @Path("chatId") chatId: String,
        @Body body: SendMessageRequest,
    ): ApiEnvelope<SendReplyDto>

    @DELETE("ai/chats/{chatId}/conversation")
    suspend fun clearConversation(@Path("chatId") chatId: String): Response<Unit>

    /** Асинхронный /ask: ответ приходит по сокету (AI_QUERY/AI). Сервер отдаёт 202. */
    @POST("ai/chats/{chatId}/ask")
    suspend fun ask(
        @Path("chatId") chatId: String,
        @Body body: AskRequest,
    ): Response<Unit>
}
