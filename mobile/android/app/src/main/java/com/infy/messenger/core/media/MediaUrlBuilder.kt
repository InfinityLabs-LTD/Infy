package com.infy.messenger.core.media

import android.util.Base64
import com.infy.messenger.BuildConfig
import com.infy.messenger.feature.auth.data.SessionManager
import java.net.URLEncoder
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Строит авторизованный URL стриминга медиа из storageKey:
 *   {API_BASE_URL}media/{base64url(storageKey)}?token={accessToken}
 *
 * Эндпоинт `GET /media/:encodedKey` принимает токен в query (нужно для ExoPlayer/
 * Coil, которые не дают удобно проставить заголовок Authorization). Поддерживает
 * Range — поэтому используем его и для видео/кружков.
 */
@Singleton
class MediaUrlBuilder @Inject constructor(
    private val sessionManager: SessionManager,
) {
    /** Полный URL для скачивания/стриминга объекта по его storageKey. */
    fun url(storageKey: String): String {
        val encoded = Base64.encodeToString(
            storageKey.toByteArray(Charsets.UTF_8),
            Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP,
        )
        val base = BuildConfig.API_BASE_URL.trimEnd('/')
        val token = sessionManager.currentAccessToken()
        val tokenQuery = token?.let { "?token=${URLEncoder.encode(it, "UTF-8")}" }.orEmpty()
        return "$base/media/$encoded$tokenQuery"
    }

    /** URL превью, если есть thumbnailKey, иначе основной объект. */
    fun thumbnailUrl(thumbnailKey: String?, storageKey: String): String =
        url(thumbnailKey ?: storageKey)

    /**
     * Абсолютный URL для avatarUrl/coverUrl из профиля. Бэкенд отдаёт их
     * относительными (`/media/avatars/…`); префиксуем origin'ом API-базы.
     * Аватары публичны — токен не нужен. null/пусто → null.
     */
    fun absoluteOrNull(relativeOrAbsolute: String?): String? {
        val v = relativeOrAbsolute?.takeIf { it.isNotBlank() } ?: return null
        if (v.startsWith("http://") || v.startsWith("https://")) return v
        val base = BuildConfig.API_BASE_URL.trimEnd('/')
        // base оканчивается на ".../api"; относительный путь начинается с "/media/…".
        return base + if (v.startsWith("/")) v else "/$v"
    }
}
