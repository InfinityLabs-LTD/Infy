package com.infy.messenger.feature.chat.data.local

import androidx.room.Database
import androidx.room.RoomDatabase

@Database(
    entities = [ChatEntity::class, MessageEntity::class],
    version = 1,
    exportSchema = false,
)
abstract class InfyDatabase : RoomDatabase() {
    abstract fun chatDao(): ChatDao
    abstract fun messageDao(): MessageDao
}
