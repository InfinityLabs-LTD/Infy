package com.infy.messenger.feature.chat.data.remote

import com.infy.messenger.core.network.ApiEnvelope
import com.infy.messenger.feature.chat.data.dto.ChatSummaryDto
import com.infy.messenger.feature.chat.data.dto.CreateChatRequest
import com.infy.messenger.feature.chat.data.dto.MessageDto
import com.infy.messenger.feature.chat.data.dto.MessagePageDto
import com.infy.messenger.feature.chat.data.dto.ReactRequest
import com.infy.messenger.feature.chat.data.dto.SendMessageRequest
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

    @POST("chats")
    suspend fun createDirectChat(
        @Body body: CreateChatRequest,
    ): ApiEnvelope<ChatSummaryDto>
}
