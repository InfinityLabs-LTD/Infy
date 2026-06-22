package com.infy.messenger.feature.profile.data

import kotlinx.serialization.Serializable

/**
 * Публичный профиль другого пользователя (GET /profile/{username}).
 * Бэкенд отдаёт только публичные поля — email/настройки сюда НЕ попадают.
 */
@Serializable
data class PublicProfileDto(
    val id: String,
    val username: String,
    val nickname: String,
    val avatarUrl: String? = null,
    val coverUrl: String? = null,
    val bio: String? = null,
    val role: String,
    val interests: List<String> = emptyList(),
    val badges: List<BadgeDto> = emptyList(),
    val createdAt: String? = null,
    val lastSeenAt: String? = null,
)

/** Кастомный бейдж пользователя. color — строка "R,G,B"; icon — эмодзи. */
@Serializable
data class BadgeDto(
    val slug: String,
    val label: String,
    val color: String? = null,
    val icon: String? = null,
    val description: String? = null,
)
