package com.infy.messenger.feature.profile.data

import com.infy.messenger.feature.profile.domain.DeviceSession
import com.infy.messenger.feature.profile.domain.Profile
import com.infy.messenger.feature.profile.domain.ProfileStats
import kotlinx.serialization.Serializable

@Serializable
data class ProfileDto(
    val id: String,
    val username: String,
    val nickname: String,
    val avatarUrl: String? = null,
    val coverUrl: String? = null,
    val bio: String? = null,
    val role: String,
    val email: String? = null,
    val emailVerified: Boolean = false,
    val birthdate: String? = null,
    val timezone: String? = null,
    val interests: List<String> = emptyList(),
    val aiSuggestReplies: Boolean = true,
    val notifyPopup: Boolean = true,
    val notifySound: Boolean = true,
    val notifyVibrate: Boolean = true,
)

@Serializable
data class ProfileStatsDto(
    val contacts: Int = 0,
    val chats: Int = 0,
    val groups: Int = 0,
    val devices: Int = 0,
)

@Serializable
data class UpdateProfileRequest(
    val nickname: String? = null,
    val bio: String? = null,
    val birthdate: String? = null,
    val interests: List<String>? = null,
    val timezone: String? = null,
    val aiSuggestReplies: Boolean? = null,
    val notifyPopup: Boolean? = null,
    val notifySound: Boolean? = null,
    val notifyVibrate: Boolean? = null,
)

@Serializable
data class AvatarResponse(val avatarUrl: String? = null)

@Serializable
data class CoverResponse(val coverUrl: String? = null)

@Serializable
data class DeviceSessionDto(
    val id: String,
    val deviceName: String? = null,
    val userAgent: String? = null,
    val ip: String? = null,
    val createdAt: String,
    val lastActiveAt: String,
    val isCurrent: Boolean = false,
)

@Serializable
data class LogoutAllRequest(val exceptCurrent: Boolean = true)

@Serializable
data class LogoutAllResponse(val revokedCount: Int = 0)

// ── Мапперы ──────────────────────────────────────────────────────────

fun ProfileDto.toDomain(): Profile = Profile(
    id = id,
    username = username,
    nickname = nickname,
    avatarUrl = avatarUrl,
    coverUrl = coverUrl,
    bio = bio,
    role = role,
    email = email,
    emailVerified = emailVerified,
    birthdate = birthdate,
    timezone = timezone,
    interests = interests,
    aiSuggestReplies = aiSuggestReplies,
    notifyPopup = notifyPopup,
    notifySound = notifySound,
    notifyVibrate = notifyVibrate,
)

fun ProfileStatsDto.toDomain(): ProfileStats = ProfileStats(contacts, chats, groups, devices)

fun DeviceSessionDto.toDomain(): DeviceSession = DeviceSession(
    id = id,
    deviceName = deviceName,
    userAgent = userAgent,
    ip = ip,
    createdAt = com.infy.messenger.core.util.parseIsoToMillisOrNow(createdAt),
    lastActiveAt = com.infy.messenger.core.util.parseIsoToMillisOrNow(lastActiveAt),
    isCurrent = isCurrent,
)
