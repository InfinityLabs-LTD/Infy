package com.infy.messenger.core.media

import android.content.Context
import android.media.MediaRecorder
import android.net.Uri
import android.os.Build
import androidx.core.content.FileProvider
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Запись голосовых сообщений через MediaRecorder в контейнер OGG/Opus (API 29+)
 * либо M4A/AAC на более старых устройствах. Бэкенд всё равно перекодирует в Opus,
 * поэтому здесь важно лишь отдать валидный аудиофайл с длительностью.
 */
@Singleton
class VoiceRecorder @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    private var recorder: MediaRecorder? = null
    private var outputFile: File? = null
    private var startedAt: Long = 0L

    val isRecording: Boolean get() = recorder != null

    /** Начать запись. Бросает, если нет разрешения RECORD_AUDIO. */
    fun start() {
        if (recorder != null) return
        val (file, useOpus) = newOutputFile()
        outputFile = file

        @Suppress("DEPRECATION")
        val rec = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            MediaRecorder(context)
        } else {
            MediaRecorder()
        }
        rec.setAudioSource(MediaRecorder.AudioSource.MIC)
        if (useOpus) {
            rec.setOutputFormat(MediaRecorder.OutputFormat.OGG)
            rec.setAudioEncoder(MediaRecorder.AudioEncoder.OPUS)
        } else {
            rec.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            rec.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
        }
        rec.setAudioSamplingRate(48_000)
        rec.setAudioEncodingBitRate(64_000)
        rec.setOutputFile(file.absolutePath)
        rec.prepare()
        rec.start()
        recorder = rec
        startedAt = System.currentTimeMillis()
    }

    /** Результат завершённой записи. */
    data class Recording(val uri: Uri, val durationMs: Long)

    /** Остановить запись и вернуть файл + длительность, либо null при ошибке/слишком короткой. */
    fun stop(): Recording? {
        val rec = recorder ?: return null
        val file = outputFile
        val duration = System.currentTimeMillis() - startedAt
        recorder = null
        outputFile = null
        return try {
            rec.stop()
            rec.release()
            if (file == null || duration < MIN_DURATION_MS) {
                file?.delete()
                null
            } else {
                Recording(uriFor(file), duration)
            }
        } catch (_: Throwable) {
            rec.runCatching { release() }
            file?.delete()
            null
        }
    }

    /** Отменить запись без сохранения. */
    fun cancel() {
        val rec = recorder ?: return
        recorder = null
        rec.runCatching { stop() }
        rec.runCatching { release() }
        outputFile?.delete()
        outputFile = null
    }

    private fun newOutputFile(): Pair<File, Boolean> {
        val useOpus = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
        val ext = if (useOpus) "ogg" else "m4a"
        val dir = File(context.cacheDir, "voice").apply { mkdirs() }
        return File(dir, "voice-${System.currentTimeMillis()}.$ext") to useOpus
    }

    private fun uriFor(file: File): Uri =
        FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)

    private companion object {
        const val MIN_DURATION_MS = 700L
    }
}
