package com.infy.messenger.feature.chat.domain

import kotlinx.coroutines.flow.Flow

/** Страница истории сообщений (курсорная пагинация). */
data class MessagePage(
    val messages: List<ChatMessage>,
    /** Курсор для подгрузки более старых сообщений; null — старее нет. */
    val nextCursor: String?,
)

/**
 * Offline-first контракт чатов. Списки/сообщения отдаются как Flow из Room,
 * сетевые операции обновляют кэш. Реализация бросает
 * [com.infy.messenger.core.network.ApiError] при сбоях сети.
 */
interface ChatRepository {

    /** Реактивный список диалогов из локального кэша. */
    fun observeChats(): Flow<List<ChatSummary>>

    /** Перечитать список диалогов с сервера и обновить кэш. */
    suspend fun refreshChats()

    /** Реактивная лента сообщений чата из локального кэша (по возрастанию времени). */
    fun observeMessages(chatId: String): Flow<List<ChatMessage>>

    /** Загрузить страницу истории (старее [cursor]) и слить в кэш. Возвращает курсор. */
    suspend fun loadMessagePage(chatId: String, cursor: String?): MessagePage

    /**
     * Отправить текст. Сразу кладёт оптимистичное сообщение в кэш (SENDING),
     * затем подтверждает/помечает FAILED. clientMessageId генерируется внутри.
     */
    suspend fun sendText(chatId: String, content: String, replyToId: String?)

    /** Повторить отправку ранее упавшего сообщения. */
    suspend fun retrySend(chatId: String, clientMessageId: String)

    /** Отметить сообщение прочитанным (и синхронизировать с сервером). */
    suspend fun markRead(chatId: String, messageId: String)

    /** Переключить реакцию-эмодзи. */
    suspend fun toggleReaction(messageId: String, emoji: String)

    /** Расшифровать голосовое/кружок (Whisper). Возвращает распознанный текст. */
    suspend fun transcribe(messageId: String): String

    /** Получить/создать прямой диалог с пользователем, вернуть его id. */
    suspend fun getOrCreateDirectChat(partnerId: String): String

    /** Удалить сообщение из кэша (по событию message_deleted). */
    suspend fun removeMessage(chatId: String, messageId: String)
}
