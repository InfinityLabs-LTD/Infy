package com.infy.messenger.feature.reports.data

import android.content.ContentResolver
import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import com.infy.messenger.core.media.ProgressRequestBody
import com.infy.messenger.core.network.apiCall
import com.infy.messenger.feature.media.data.MediaApi
import dagger.hilt.android.qualifiers.ApplicationContext
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Жалобы на пользователей (паритет с web).
 * При наличии скриншотов сначала грузим их в /media/upload и собираем
 * полученные storageKey в evidenceKeys, затем создаём жалобу POST /reports.
 */
@Singleton
class ReportsRepository @Inject constructor(
    @ApplicationContext private val context: Context,
    private val reportsApi: ReportsApi,
    private val mediaApi: MediaApi,
) {
    private val resolver: ContentResolver get() = context.contentResolver

    /** Лимит скриншотов-доказательств (как в web). */
    val maxEvidence: Int = MAX_EVIDENCE

    /**
     * Отправить жалобу. [evidenceUris] — выбранные скриншоты (опционально, до 5);
     * каждый сначала загружается в media, его storageKey уходит в evidenceKeys.
     */
    suspend fun submit(
        targetId: String,
        category: String,
        description: String,
        chatId: String?,
        evidenceUris: List<Uri>,
    ): Result<Unit> = runCatching {
        val keys = evidenceUris.take(MAX_EVIDENCE).map { uri -> uploadEvidence(uri) }
        apiCall {
            reportsApi.create(
                ReportInput(
                    targetId = targetId,
                    category = category,
                    description = description,
                    chatId = chatId,
                    evidenceKeys = keys.ifEmpty { null },
                ),
            ).data
        }
        Unit
    }

    /** Загрузить один скриншот в media, вернуть его storageKey. */
    private suspend fun uploadEvidence(uri: Uri): String {
        val meta = resolveMeta(uri)
        val body = ProgressRequestBody(
            streamProvider = {
                resolver.openInputStream(uri)
                    ?: throw IllegalStateException("Cannot open $uri")
            },
            contentLength = meta.sizeBytes,
            contentType = meta.mimeType.toMediaTypeOrNull(),
            onProgress = { _, _ -> },
        )
        val part = MultipartBody.Part.createFormData("file", meta.fileName, body)
        return apiCall { mediaApi.upload(part, null, null).data }.storageKey
    }

    private data class MediaMeta(
        val fileName: String,
        val mimeType: String,
        val sizeBytes: Long,
    )

    private fun resolveMeta(uri: Uri): MediaMeta {
        val mime = resolver.getType(uri) ?: "application/octet-stream"
        var name = "screenshot"
        var size = -1L
        resolver.query(uri, null, null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) {
                val nameIdx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                val sizeIdx = cursor.getColumnIndex(OpenableColumns.SIZE)
                if (nameIdx >= 0) cursor.getString(nameIdx)?.let { name = it }
                if (sizeIdx >= 0 && !cursor.isNull(sizeIdx)) size = cursor.getLong(sizeIdx)
            }
        }
        if (size < 0) {
            size = resolver.openInputStream(uri)?.use { it.available().toLong() } ?: 0L
        }
        return MediaMeta(fileName = name, mimeType = mime, sizeBytes = size)
    }

    private companion object {
        const val MAX_EVIDENCE = 5
    }
}
