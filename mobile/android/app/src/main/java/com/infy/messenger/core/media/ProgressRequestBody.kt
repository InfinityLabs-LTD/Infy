package com.infy.messenger.core.media

import okhttp3.MediaType
import okhttp3.RequestBody
import okio.BufferedSink
import java.io.InputStream

/**
 * RequestBody поверх InputStream с колбэком прогресса (для индикатора загрузки).
 * Размер обязателен — без него прогресс в процентах не посчитать.
 */
class ProgressRequestBody(
    private val streamProvider: () -> InputStream,
    private val contentLength: Long,
    private val contentType: MediaType?,
    private val onProgress: (bytesSent: Long, total: Long) -> Unit,
) : RequestBody() {

    override fun contentType(): MediaType? = contentType

    override fun contentLength(): Long = contentLength

    override fun writeTo(sink: BufferedSink) {
        val buffer = ByteArray(DEFAULT_BUFFER)
        var uploaded = 0L
        streamProvider().use { input ->
            while (true) {
                val read = input.read(buffer)
                if (read == -1) break
                sink.write(buffer, 0, read)
                uploaded += read
                onProgress(uploaded, contentLength)
            }
        }
    }

    private companion object {
        const val DEFAULT_BUFFER = 8 * 1024
    }
}
