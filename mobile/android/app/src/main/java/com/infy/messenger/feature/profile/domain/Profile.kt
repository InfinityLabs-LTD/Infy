package com.infy.messenger.feature.profile.domain

/** Полный профиль текущего пользователя (приватные поля включены). */
data class Profile(
    val id: String,
    val username: String,
    val nickname: String,
    val avatarUrl: String?,
    val coverUrl: String?,
    val bio: String?,
    val role: String,
    val email: String?,
    val emailVerified: Boolean,
    val birthdate: String?,
    val timezone: String?,
    val interests: List<String>,
    val aiSuggestReplies: Boolean,
    val notifyPopup: Boolean,
    val notifySound: Boolean,
    val notifyVibrate: Boolean,
)

/** Статистика профиля. */
data class ProfileStats(
    val contacts: Int,
    val chats: Int,
    val groups: Int,
    val devices: Int,
)

/** Сессия устройства. */
data class DeviceSession(
    val id: String,
    val deviceName: String?,
    val userAgent: String?,
    val ip: String?,
    val createdAt: Long,
    val lastActiveAt: Long,
    val isCurrent: Boolean,
)
