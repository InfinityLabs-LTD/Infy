package com.infy.messenger.feature.media.data

import android.content.ContentResolver
import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import com.infy.messenger.core.media.ProgressRequestBody
import com.infy.messenger.core.network.apiCall
import com.infy.messenger.feature.chat.data.remote.ChatApi
import com.infy.messenger.feature.chat.data.dto.AttachmentInput
import com.infy.messenger.feature.chat.data.dto.SendMessageRequest
import com.infy.messenger.feature.media.domain.MediaKind
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Загрузка медиа и отправка его сообщением. Поток:
 *   1) читаем контент по Uri, узнаём mime/имя/размер;
 *   2) грузим в /media/upload (с прогрессом);
 *   3) шлём POST /chats/:id/messages с attachment и нужным type.
 *
 * Прогресс публикуется в [uploadProgress] (0..1; null — нет активной загрузки).
 */
@Singleton
class MediaRepository @Inject constructor(
    @ApplicationContext private val context: Context,
    private val mediaApi: MediaApi,
    private val chatApi: ChatApi,
) {
    private val resolver: ContentResolver get() = context.contentResolver

    private val _uploadProgress = MutableStateFlow<Float?>(null)
    val uploadProgress: StateFlow<Float?> = _uploadProgress

    /**
     * Загрузить файл по [uri] и отправить в чат [chatId] как [kind].
     * [durationMs] — длительность для audio/video (если известна).
     */
    suspend fun sendMedia(
        chatId: String,
        uri: Uri,
        kind: MediaKind,
        durationMs: Long? = null,
        caption: String? = null,
    ) {
        val meta = resolveMeta(uri)
        val mime = meta.mimeType
        val size = meta.sizeBytes

        val progressBody = ProgressRequestBody(
            streamProvider = {
                resolver.openInputStream(uri)
                    ?: throw IllegalStateException("Cannot open $uri")
            },
            contentLength = size,
            contentType = mime.toMediaTypeOrNull(),
            onProgress = { sent, total ->
                _uploadProgress.value = if (total > 0) sent.toFloat() / total else null
            },
        )
        val part = MultipartBody.Part.createFormData("file", meta.fileName, progressBody)

        try {
            _uploadProgress.value = 0f
            val upload = apiCall {
                mediaApi.upload(part, kind.typeHint, durationMs).data
            }
            apiCall {
                chatApi.sendMessage(
                    chatId,
                    SendMessageRequest(
                        content = caption?.takeIf { it.isNotBlank() },
                        type = kind.messageType,
                        clientMessageId = UUID.randomUUID().toString(),
                        attachment = AttachmentInput(
                            storageKey = upload.storageKey,
                            fileName = upload.fileName,
                            thumbnailKey = upload.thumbnailKey,
                            mimeType = upload.mimeType,
                            sizeBytes = upload.sizeBytes,
                            width = upload.width,
                            height = upload.height,
                            durationMs = upload.durationMs,
                            waveform = upload.waveform,
                        ),
                    ),
                ).data
            }
        } finally {
            _uploadProgress.value = null
        }
    }

    private data class MediaMeta(
        val fileName: String,
        val mimeType: String,
        val sizeBytes: Long,
    )

    private fun resolveMeta(uri: Uri): MediaMeta {
        val mime = resolver.getType(uri) ?: "application/octet-stream"
        var name = "file"
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
            // Фолбэк: читаем размер потоком (например, для свежезаписанного файла).
            size = resolver.openInputStream(uri)?.use { it.available().toLong() } ?: 0L
        }
        return MediaMeta(fileName = name, mimeType = mime, sizeBytes = size)
    }
}
