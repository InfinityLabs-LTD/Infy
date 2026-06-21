package com.infy.messenger.feature.auth.domain

/**
 * Доменная модель пользователя — подмножество того, что отдаёт serializeUser на бэке.
 * На этапе 1 нужны только идентификация и базовые поля; остальное добавим на этапе профиля.
 */
data class User(
    val id: String,
    val username: String,
    val nickname: String,
    val avatarUrl: String?,
    val role: String,
    val email: String?,
    val emailVerified: Boolean,
)

/** Результат успешной авторизации (register / login). */
data class AuthSession(
    val user: User,
    val accessToken: String,
    val refreshToken: String,
    val sessionId: String,
)
