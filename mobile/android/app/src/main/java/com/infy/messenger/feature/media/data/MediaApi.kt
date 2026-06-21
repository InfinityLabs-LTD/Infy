package com.infy.messenger.feature.media.data

import com.infy.messenger.core.network.ApiEnvelope
import okhttp3.MultipartBody
import retrofit2.http.Header
import retrofit2.http.Multipart
import retrofit2.http.POST
import retrofit2.http.Part

interface MediaApi {

    /**
     * Загрузка одного файла. Поле формы — `file`. Заголовки:
     *   - `x-media-type`: подсказка типа (`circle_video` / `document`), опционально;
     *   - `x-media-duration`: длительность в мс (для audio/video), опционально.
     */
    @Multipart
    @POST("media/upload")
    suspend fun upload(
        @Part file: MultipartBody.Part,
        @Header("x-media-type") mediaTypeHint: String?,
        @Header("x-media-duration") durationMs: Long?,
    ): ApiEnvelope<UploadResultDto>
}
