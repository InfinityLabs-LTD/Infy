package com.infy.messenger.feature.auth.domain

/**
 * Доменный контракт авторизации. UI/ViewModel зависят только от него.
 * Реализация ([com.infy.messenger.feature.auth.data.AuthRepositoryImpl]) бросает
 * [com.infy.messenger.core.network.ApiError] при сбоях.
 */
interface AuthRepository {
    suspend fun register(
        username: String,
        nickname: String,
        password: String,
        email: String?,
    ): AuthSession

    suspend fun login(username: String, password: String): AuthSession

    suspend fun requestPasswordReset(email: String)

    suspend fun logout()
}
