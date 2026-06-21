package com.infy.messenger.core.security

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Хранилище токенов поверх EncryptedSharedPreferences (ключ — в Android Keystore).
 * Только синхронный доступ к строкам токенов; реактивное состояние авторизации
 * держит [com.infy.messenger.feature.auth.data.SessionManager].
 */
@Singleton
class TokenStorage @Inject constructor(
    @ApplicationContext context: Context,
) {
    private val prefs: SharedPreferences = run {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()

        EncryptedSharedPreferences.create(
            context,
            FILE_NAME,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    var accessToken: String?
        get() = prefs.getString(KEY_ACCESS, null)
        private set(value) = prefs.edit().putStringOrRemove(KEY_ACCESS, value).apply()

    var refreshToken: String?
        get() = prefs.getString(KEY_REFRESH, null)
        private set(value) = prefs.edit().putStringOrRemove(KEY_REFRESH, value).apply()

    fun saveTokens(access: String, refresh: String) {
        prefs.edit()
            .putString(KEY_ACCESS, access)
            .putString(KEY_REFRESH, refresh)
            .apply()
    }

    /** Обновить только access-токен (после refresh access меняется всегда). */
    fun updateAccessToken(access: String) {
        prefs.edit().putString(KEY_ACCESS, access).apply()
    }

    fun updateRefreshToken(refresh: String) {
        prefs.edit().putString(KEY_REFRESH, refresh).apply()
    }

    /** id текущего пользователя — нужен для вычисления isOwn в чатах. */
    var userId: String?
        get() = prefs.getString(KEY_USER_ID, null)
        set(value) = prefs.edit().putStringOrRemove(KEY_USER_ID, value).apply()

    fun clear() {
        prefs.edit().clear().apply()
    }

    val hasSession: Boolean
        get() = !refreshToken.isNullOrBlank()

    private fun SharedPreferences.Editor.putStringOrRemove(
        key: String,
        value: String?,
    ): SharedPreferences.Editor =
        if (value == null) remove(key) else putString(key, value)

    private companion object {
        const val FILE_NAME = "infy_secure_tokens"
        const val KEY_ACCESS = "access_token"
        const val KEY_REFRESH = "refresh_token"
        const val KEY_USER_ID = "user_id"
    }
}
