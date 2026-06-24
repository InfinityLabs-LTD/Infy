package com.infy.messenger.feature.profile.data

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import com.infy.messenger.core.network.apiCall
import com.infy.messenger.core.network.ensureSuccessOrThrow
import com.infy.messenger.feature.profile.domain.DeviceSession
import com.infy.messenger.feature.profile.domain.Profile
import com.infy.messenger.feature.profile.domain.ProfileStats
import dagger.hilt.android.qualifiers.ApplicationContext
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ProfileRepository @Inject constructor(
    @ApplicationContext private val context: Context,
    private val profileApi: ProfileApi,
    private val sessionsApi: SessionsApi,
    private val notificationPrefs: com.infy.messenger.core.notification.NotificationPrefs,
) {
    suspend fun getProfile(): Profile =
        apiCall { profileApi.getMe().data.toDomain() }.also { syncNotifPrefs(it) }

    suspend fun getStats(): ProfileStats = apiCall { profileApi.getStats().data.toDomain() }

    suspend fun updateProfile(request: UpdateProfileRequest): Profile =
        apiCall { profileApi.updateProfile(request).data.toDomain() }.also { syncNotifPrefs(it) }

    /** Зеркалим настройки уведомлений локально, чтобы AppNotifier их учитывал. */
    private fun syncNotifPrefs(p: Profile) {
        notificationPrefs.update(p.notifyPopup, p.notifySound, p.notifyVibrate)
    }

    /** Загрузить аватар из галереи; возвращает обновлённый профиль. */
    suspend fun uploadAvatar(uri: Uri): Profile = apiCall {
        profileApi.uploadAvatar(filePart(uri))
        // Перечитываем профиль, чтобы получить новый avatarUrl в полном виде.
        profileApi.getMe().data.toDomain()
    }

    suspend fun uploadCover(uri: Uri): Profile = apiCall {
        profileApi.uploadCover(filePart(uri))
        profileApi.getMe().data.toDomain()
    }

    // ── Сессии ───────────────────────────────────────────────────────

    suspend fun listSessions(): List<DeviceSession> =
        apiCall { sessionsApi.listSessions().data.map { it.toDomain() } }

    suspend fun revokeSession(id: String) = apiCall {
        sessionsApi.revokeSession(id).ensureSuccessOrThrow()
    }

    suspend fun logoutOtherSessions(): Int = apiCall {
        sessionsApi.logoutAll(LogoutAllRequest(exceptCurrent = true)).data.revokedCount
    }

    private fun filePart(uri: Uri): MultipartBody.Part {
        val resolver = context.contentResolver
        val mime = resolver.getType(uri) ?: "image/jpeg"
        var name = "image"
        resolver.query(uri, null, null, null, null)?.use { c ->
            if (c.moveToFirst()) {
                val idx = c.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                if (idx >= 0) c.getString(idx)?.let { name = it }
            }
        }
        val bytes = resolver.openInputStream(uri)?.use { it.readBytes() } ?: ByteArray(0)
        val body = bytes.toRequestBody(mime.toMediaTypeOrNull())
        return MultipartBody.Part.createFormData("file", name, body)
    }
}
