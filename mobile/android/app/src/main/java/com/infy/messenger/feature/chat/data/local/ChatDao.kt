package com.infy.messenger.feature.chat.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import kotlinx.coroutines.flow.Flow

@Dao
interface ChatDao {

    @Query("SELECT * FROM chats ORDER BY lastMessageAt DESC, createdAt DESC")
    fun observeChats(): Flow<List<ChatEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertChats(chats: List<ChatEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertChat(chat: ChatEntity)

    @Query("SELECT * FROM chats WHERE id = :chatId LIMIT 1")
    suspend fun getChat(chatId: String): ChatEntity?

    @Query("DELETE FROM chats WHERE id = :chatId")
    suspend fun deleteChat(chatId: String)

    /**
     * Полностью заменить список чатов содержимым сервера: удаляем пропавшие,
     * вставляем актуальные. Делаем в транзакции, чтобы UI не моргал.
     */
    @Transaction
    suspend fun replaceAll(chats: List<ChatEntity>) {
        clearChats()
        upsertChats(chats)
    }

    @Query("DELETE FROM chats")
    suspend fun clearChats()
}

@Dao
interface MessageDao {

    @Query("SELECT * FROM messages WHERE chatId = :chatId ORDER BY sortKey ASC")
    fun observeMessages(chatId: String): Flow<List<MessageEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(message: MessageEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(messages: List<MessageEntity>)

    @Query("SELECT * FROM messages WHERE localId = :localId LIMIT 1")
    suspend fun getByLocalId(localId: String): MessageEntity?

    @Query("SELECT * FROM messages WHERE clientMessageId = :clientId LIMIT 1")
    suspend fun getByClientId(clientId: String): MessageEntity?

    @Query("SELECT * FROM messages WHERE serverId = :serverId LIMIT 1")
    suspend fun getByServerId(serverId: String): MessageEntity?

    @Query("DELETE FROM messages WHERE localId = :localId")
    suspend fun deleteByLocalId(localId: String)

    @Query("DELETE FROM messages WHERE serverId = :serverId OR localId = :serverId")
    suspend fun deleteByServerId(serverId: String)

    /** Самый старый серверный id в чате — курсор для подгрузки истории. */
    @Query(
        "SELECT serverId FROM messages WHERE chatId = :chatId AND serverId IS NOT NULL " +
            "ORDER BY sortKey ASC LIMIT 1",
    )
    suspend fun oldestServerId(chatId: String): String?

    /**
     * Заменить оптимистичную запись (по clientMessageId) на подтверждённую:
     * удаляем старую по localId, вставляем новую. В транзакции — без мерцания.
     */
    @Transaction
    suspend fun replaceOptimistic(oldLocalId: String, confirmed: MessageEntity) {
        deleteByLocalId(oldLocalId)
        upsert(confirmed)
    }
}
