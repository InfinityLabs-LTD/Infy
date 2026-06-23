package com.infy.messenger.feature.chat.data

import com.infy.messenger.core.network.apiCall
import com.infy.messenger.core.realtime.RealtimeClient
import com.infy.messenger.feature.auth.data.SessionManager
import com.infy.messenger.feature.chat.data.dto.CreateChatRequest
import com.infy.messenger.feature.chat.data.dto.EditMessageRequest
import com.infy.messenger.feature.chat.data.dto.MessageDto
import com.infy.messenger.feature.chat.data.dto.ReactRequest
import com.infy.messenger.feature.chat.data.dto.SendMessageRequest
import com.infy.messenger.feature.chat.data.local.ChatDao
import com.infy.messenger.feature.chat.data.local.MessageDao
import com.infy.messenger.feature.chat.data.local.MessageEntity
import com.infy.messenger.feature.chat.data.remote.ChatApi
import com.infy.messenger.feature.chat.domain.ChatMessage
import com.infy.messenger.feature.chat.domain.ChatRepository
import com.infy.messenger.feature.chat.domain.ChatSummary
import com.infy.messenger.feature.chat.domain.DeliveryStatus
import com.infy.messenger.feature.chat.domain.MessagePage
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ChatRepositoryImpl @Inject constructor(
    private val api: ChatApi,
    private val chatDao: ChatDao,
    private val messageDao: MessageDao,
    private val sessionManager: SessionManager,
    private val realtimeClient: RealtimeClient,
) : ChatRepository {

    private fun currentUserId(): String = sessionManager.currentUserId().orEmpty()

    override fun observeChats(): Flow<List<ChatSummary>> =
        chatDao.observeChats().map { list -> list.map { it.toDomain() } }

    override suspend fun refreshChats() = apiCall {
        val dtos = api.listChats().data
        chatDao.replaceAll(dtos.map { it.toEntity() })
    }

    override fun observeMessages(chatId: String): Flow<List<ChatMessage>> =
        combine(
            messageDao.observeMessages(chatId),
            chatDao.observeChat(chatId).map { it?.partnerLastReadMessageId },
        ) { list, partnerLastReadId ->
            list.map { entity ->
                val msg = entity.toDomain()
                // Статус «прочитано» вычисляем динамически, как в web: своё подтверждённое
                // сообщение прочитано, если его id <= последнего прочитанного собеседником.
                // ULID монотонны, поэтому достаточно лексикографического сравнения строк.
                if (
                    msg.isOwn &&
                    msg.deliveryStatus == DeliveryStatus.SENT &&
                    msg.id.isNotBlank() &&
                    partnerLastReadId != null &&
                    msg.id <= partnerLastReadId
                ) {
                    msg.copy(deliveryStatus = DeliveryStatus.READ)
                } else {
                    msg
                }
            }
        }

    override suspend fun loadMessagePage(chatId: String, cursor: String?): MessagePage = apiCall {
        val page = api.getMessages(chatId, cursor, PAGE_SIZE).data
        val uid = currentUserId()
        messageDao.upsertAll(page.messages.map { it.toEntity(uid) })
        MessagePage(
            messages = page.messages.map { it.toEntity(uid).toDomain() },
            nextCursor = page.nextCursor,
        )
    }

    override suspend fun sendText(chatId: String, content: String, replyToId: String?) {
        val clientMessageId = UUID.randomUUID().toString()
        val now = System.currentTimeMillis()
        val uid = currentUserId()

        // 1) Оптимистичная запись в кэш — мгновенно видна в ленте.
        val optimistic = MessageEntity(
            localId = clientMessageId,
            serverId = null,
            chatId = chatId,
            content = content,
            type = "TEXT",
            createdAt = now,
            editedAt = null,
            pinnedAt = null,
            senderId = uid,
            senderNickname = "",
            senderAvatarUrl = null,
            isOwn = true,
            replyToJson = null,
            reactionsJson = "[]",
            attachmentsJson = "[]",
            clientMessageId = clientMessageId,
            deliveryStatus = DeliveryStatus.SENDING.name,
            sortKey = optimisticSortKey(now),
        )
        messageDao.upsert(optimistic)

        // 2) Отправка на сервер; idемпотентность по clientMessageId.
        runCatching {
            apiCall {
                api.sendMessage(
                    chatId,
                    SendMessageRequest(
                        content = content,
                        type = "TEXT",
                        replyToId = replyToId,
                        clientMessageId = clientMessageId,
                    ),
                ).data
            }
        }.onSuccess { dto ->
            // 3a) Заменяем оптимистичную запись подтверждённой (serverId, sortKey=id).
            messageDao.replaceOptimistic(clientMessageId, dto.toEntity(uid))
        }.onFailure {
            // 3b) Помечаем FAILED — UI покажет кнопку повтора.
            messageDao.upsert(optimistic.copy(deliveryStatus = DeliveryStatus.FAILED.name))
        }
    }

    override suspend fun retrySend(chatId: String, clientMessageId: String) {
        val entity = messageDao.getByClientId(clientMessageId) ?: return
        val content = entity.content ?: return
        // Возвращаем в SENDING и переотправляем с тем же clientMessageId.
        messageDao.upsert(entity.copy(deliveryStatus = DeliveryStatus.SENDING.name))
        val uid = currentUserId()
        runCatching {
            apiCall {
                api.sendMessage(
                    chatId,
                    SendMessageRequest(content = content, type = "TEXT", clientMessageId = clientMessageId),
                ).data
            }
        }.onSuccess { dto ->
            messageDao.replaceOptimistic(clientMessageId, dto.toEntity(uid))
        }.onFailure {
            messageDao.upsert(entity.copy(deliveryStatus = DeliveryStatus.FAILED.name))
        }
    }

    override suspend fun markRead(chatId: String, messageId: String) {
        // Реальное время — мгновенно; REST-дублирование не требуется (сокет пишет в БД).
        realtimeClient.markRead(chatId, messageId)
        // Локально сбрасываем счётчик непрочитанного для отзывчивого UI.
        chatDao.getChat(chatId)?.let { chatDao.upsertChat(it.copy(unreadCount = 0)) }
    }

    override suspend fun toggleReaction(messageId: String, emoji: String) = apiCall {
        val dto = api.react(messageId, ReactRequest(emoji)).data
        messageDao.upsert(dto.toEntity(currentUserId()))
    }

    override suspend fun editMessage(messageId: String, content: String) = apiCall {
        val dto = api.editMessage(messageId, EditMessageRequest(content)).data
        messageDao.upsert(dto.toEntity(currentUserId()))
    }

    override suspend fun deleteMessage(messageId: String) = apiCall {
        api.deleteMessage(messageId)
        messageDao.deleteByServerId(messageId)
    }

    override suspend fun pinMessage(messageId: String) = apiCall {
        val dto = api.pinMessage(messageId).data
        messageDao.upsert(dto.toEntity(currentUserId()))
    }

    override suspend fun transcribe(messageId: String): String = apiCall {
        api.transcribe(messageId).data.transcript
    }

    override suspend fun getOrCreateDirectChat(partnerId: String): String = apiCall {
        val dto = api.createDirectChat(CreateChatRequest(partnerId)).data
        chatDao.upsertChat(dto.toEntity())
        dto.id
    }

    /**
     * Слить пришедшее по сокету сообщение в кэш. Если это эхо нашего же сообщения
     * (известный clientMessageId есть в кэше как оптимистичное) — заменяем его,
     * чтобы не было дубликата.
     */
    suspend fun applyRealtimeMessage(dto: MessageDto) {
        val uid = currentUserId()
        val clientId = dto.clientMessageId
        if (clientId != null && messageDao.getByClientId(clientId) != null) {
            messageDao.replaceOptimistic(clientId, dto.toEntity(uid))
        } else {
            messageDao.upsert(dto.toEntity(uid))
        }
    }

    override suspend fun removeMessage(chatId: String, messageId: String) {
        messageDao.deleteByServerId(messageId)
    }

    /** Применить событие «прочитано»: если читал собеседник — обновляем маркер в чате. */
    suspend fun applyMessagesRead(chatId: String, readerUserId: String, messageId: String) {
        if (readerUserId == currentUserId()) return
        chatDao.getChat(chatId)?.let {
            chatDao.upsertChat(it.copy(partnerLastReadMessageId = messageId))
        }
    }

    /** Удалить чат из кэша (событие chat_deleted). */
    suspend fun removeChat(chatId: String) {
        chatDao.deleteChat(chatId)
    }

    private companion object {
        const val PAGE_SIZE = 50
    }
}
