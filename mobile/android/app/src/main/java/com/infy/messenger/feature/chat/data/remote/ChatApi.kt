package com.infy.messenger.feature.chat.data.remote

import com.infy.messenger.core.network.ApiEnvelope
import com.infy.messenger.feature.chat.data.dto.ChatSummaryDto
import com.infy.messenger.feature.chat.data.dto.CreateChatRequest
import com.infy.messenger.feature.chat.data.dto.EditMessageRequest
import com.infy.messenger.feature.chat.data.dto.MessageDto
import com.infy.messenger.feature.chat.data.dto.MessagePageDto
import com.infy.messenger.feature.chat.data.dto.MessageSearchResultDto
import com.infy.messenger.feature.chat.data.dto.ReactRequest
import com.infy.messenger.feature.chat.data.dto.SendMessageRequest
import com.infy.messenger.feature.chat.data.dto.TranscriptDto
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

interface ChatApi {

    @GET("chats")
    suspend fun listChats(): ApiEnvelope<List<ChatSummaryDto>>

    @GET("chats/{id}/messages")
    suspend fun getMessages(
        @Path("id") chatId: String,
        @Query("cursor") cursor: String?,
        @Query("limit") limit: Int,
    ): ApiEnvelope<MessagePageDto>

    @GET("chats/{id}/messages/after")
    suspend fun getMessagesAfter(
        @Path("id") chatId: String,
        @Query("after") after: String,
        @Query("limit") limit: Int,
    ): ApiEnvelope<MessagePageDto>

    @POST("chats/{id}/messages")
    suspend fun sendMessage(
        @Path("id") chatId: String,
        @Body body: SendMessageRequest,
    ): ApiEnvelope<MessageDto>

    @POST("messages/{id}/react")
    suspend fun react(
        @Path("id") messageId: String,
        @Body body: ReactRequest,
    ): ApiEnvelope<MessageDto>

    /** Редактировать текст своего сообщения. */
    @retrofit2.http.PATCH("chats/messages/{id}")
    suspend fun editMessage(
        @Path("id") messageId: String,
        @Body body: EditMessageRequest,
    ): ApiEnvelope<MessageDto>

    /** Удалить своё сообщение для всех. */
    @retrofit2.http.DELETE("chats/messages/{id}")
    suspend fun deleteMessage(
        @Path("id") messageId: String,
    ): ApiEnvelope<Unit>

    /** Закрепить/открепить сообщение (toggle на сервере). */
    @POST("chats/messages/{id}/pin")
    suspend fun pinMessage(
        @Path("id") messageId: String,
    ): ApiEnvelope<MessageDto>

    /** Расшифровать голосовое/кружок (Whisper). Возвращает распознанный текст. */
    @POST("messages/{id}/transcribe")
    suspend fun transcribe(
        @Path("id") messageId: String,
    ): ApiEnvelope<TranscriptDto>

    @POST("chats")
    suspend fun createDirectChat(
        @Body body: CreateChatRequest,
    ): ApiEnvelope<ChatSummaryDto>

    /** Получить/создать direct-чат с пользователем по его id (без POST, CDN-safe). */
    @GET("chats/partner/{partnerId}")
    suspend fun getOrCreateDirectChat(
        @Path("partnerId") partnerId: String,
    ): ApiEnvelope<ChatSummaryDto>

    /** Медиа-сообщения чата (IMAGE/VIDEO/AUDIO/CIRCLE_VIDEO), курсорная пагинация. */
    @GET("chats/{id}/media")
    suspend fun getChatMedia(
        @Path("id") chatId: String,
        @Query("cursor") cursor: String?,
        @Query("limit") limit: Int,
    ): ApiEnvelope<MessagePageDto>

    /** Глобальный поиск по сообщениям (q ≥ 2 символа, только TEXT, лимит 30). */
    @GET("chats/search")
    suspend fun searchMessages(
        @Query("q") q: String,
    ): ApiEnvelope<List<MessageSearchResultDto>>
}
