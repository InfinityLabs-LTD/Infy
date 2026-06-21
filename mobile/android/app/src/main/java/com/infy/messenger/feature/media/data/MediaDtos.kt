package com.infy.messenger.feature.media.data

import kotlinx.serialization.Serializable

/** Ответ POST /media/upload (UploadResult на бэке). */
@Serializable
data class UploadResultDto(
    val storageKey: String,
    val fileName: String? = null,
    val thumbnailKey: String? = null,
    val mimeType: String,
    val sizeBytes: Long,
    val width: Int? = null,
    val height: Int? = null,
    val durationMs: Int? = null,
    val waveform: List<Int> = emptyList(),
    val publicUrl: String,
    val thumbnailUrl: String? = null,
)
