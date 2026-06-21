package com.infy.messenger.core.di

import com.infy.messenger.feature.auth.data.AuthRepositoryImpl
import com.infy.messenger.feature.auth.domain.AuthRepository
import com.infy.messenger.feature.chat.data.ChatRepositoryImpl
import com.infy.messenger.feature.chat.domain.ChatRepository
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class RepositoryModule {

    @Binds
    @Singleton
    abstract fun bindAuthRepository(impl: AuthRepositoryImpl): AuthRepository

    @Binds
    @Singleton
    abstract fun bindChatRepository(impl: ChatRepositoryImpl): ChatRepository
}
