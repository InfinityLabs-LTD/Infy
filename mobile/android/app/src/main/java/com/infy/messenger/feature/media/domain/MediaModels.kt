package com.infy.messenger.feature.media.domain

/** Вид отправляемого медиа — определяет тип сообщения и подсказку бэкенду. */
enum class MediaKind(val messageType: String, val typeHint: String?) {
    IMAGE("IMAGE", null),
    VIDEO("VIDEO", null),
    AUDIO("AUDIO", null),
    CIRCLE_VIDEO("CIRCLE_VIDEO", "circle_video"),
    FILE("FILE", "document"),
}

/** Состояние загрузки вложения (для прогресса в UI). */
sealed interface UploadState {
    data object Idle : UploadState
    data class Uploading(val progress: Float) : UploadState
    data object Done : UploadState
    data class Failed(val errorCode: String) : UploadState
}
