package com.infy.messenger.core.di

import android.content.Context
import androidx.room.Room
import com.infy.messenger.feature.chat.data.local.ChatDao
import com.infy.messenger.feature.chat.data.local.InfyDatabase
import com.infy.messenger.feature.chat.data.local.MessageDao
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {

    @Provides
    @Singleton
    fun provideDatabase(@ApplicationContext context: Context): InfyDatabase =
        Room.databaseBuilder(context, InfyDatabase::class.java, "infy.db")
            // На этапе разработки схема ещё меняется — пересоздаём кэш при апгрейде.
            .fallbackToDestructiveMigration()
            .build()

    @Provides
    fun provideChatDao(db: InfyDatabase): ChatDao = db.chatDao()

    @Provides
    fun provideMessageDao(db: InfyDatabase): MessageDao = db.messageDao()
}
