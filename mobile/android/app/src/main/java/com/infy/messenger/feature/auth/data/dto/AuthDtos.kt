package com.infy.messenger.feature.auth.data.dto

import com.infy.messenger.feature.auth.domain.AuthSession
import com.infy.messenger.feature.auth.domain.User
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// ── Запросы ──────────────────────────────────────────────────────────

@Serializable
data class RegisterRequest(
    val username: String,
    val nickname: String,
    val password: String,
    val email: String? = null,
    val birthdate: String? = null,
)

@Serializable
data class LoginRequest(
    val username: String,
    val password: String,
)

@Serializable
data class RefreshRequest(
    val refreshToken: String,
)

@Serializable
data class ForgotPasswordRequest(
    val email: String,
)

@Serializable
data class ResetPasswordRequest(
    val token: String,
    val password: String,
)

// ── Ответы ───────────────────────────────────────────────────────────

/** Тело { data } для register/login: serializeUser + токены + sessionId. */
@Serializable
data class AuthSessionDto(
    val user: UserDto,
    val accessToken: String,
    val refreshToken: String,
    val sessionId: String,
)

/** Тело { data } для refresh: только новая пара токенов (sessionId не приходит). */
@Serializable
data class TokenPairDto(
    val accessToken: String,
    val refreshToken: String,
)

@Serializable
data class UserDto(
    val id: String,
    val username: String,
    val nickname: String,
    val avatarUrl: String? = null,
    val coverUrl: String? = null,
    val bio: String? = null,
    val role: String,
    val email: String? = null,
    val emailVerified: Boolean = false,
    @SerialName("interests") val interests: List<String> = emptyList(),
)

fun UserDto.toDomain(): User = User(
    id = id,
    username = username,
    nickname = nickname,
    avatarUrl = avatarUrl,
    role = role,
    email = email,
    emailVerified = emailVerified,
)

fun AuthSessionDto.toDomain(): AuthSession = AuthSession(
    user = user.toDomain(),
    accessToken = accessToken,
    refreshToken = refreshToken,
    sessionId = sessionId,
)
