import { createReadStream } from 'fs'
import path from 'path'
import os from 'os'
import fs from 'fs/promises'
import * as Minio from 'minio'
import { env } from '../../lib/env.js'
import { Semaphore } from '../../lib/semaphore.js'
import {
  probeMedia,
  probeAudioDurationMs,
  transcodeVideo,
  transcodeCircleVideo,
  transcodeAudio,
  generateWaveform,
  generateThumbnail,
} from '../../lib/transcode.js'

export type UploadedFileType = 'image' | 'video' | 'audio' | 'circle_video' | 'document'

const IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
const VIDEO_MIME = new Set(['video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska'])
const AUDIO_MIME = new Set(['audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/wav'])

const SIZE_LIMITS: Record<UploadedFileType, number> = {
  image:        20 * 1024 * 1024,
  video:       200 * 1024 * 1024,
  audio:        30 * 1024 * 1024,
  circle_video: 50 * 1024 * 1024,
  document:    100 * 1024 * 1024,
}

// H-4: ограничитель параллельных транскодингов ffmpeg на инстанс.
const transcodeSem = new Semaphore(env.MEDIA_TRANSCODE_CONCURRENCY)

export function sizeLimitFor(fileType: UploadedFileType): number {
  return SIZE_LIMITS[fileType]
}

export function detectFileType(mime: string, hint?: string): UploadedFileType {
  if (hint === 'circle_video') return 'circle_video'
  if (hint === 'document') return 'document'
  if (IMAGE_MIME.has(mime)) return 'image'
  if (VIDEO_MIME.has(mime)) return 'video'
  if (AUDIO_MIME.has(mime)) return 'audio'
  // Любой прочий тип сохраняем как документ (без транскодинга)
  return 'document'
}

export interface UploadResult {
  storageKey: string
  fileName?: string
  thumbnailKey?: string
  mimeType: string
  sizeBytes: number
  width?: number
  height?: number
  durationMs?: number
  waveform?: number[]
  publicUrl: string
  thumbnailUrl?: string
}

/** Стримит файл с диска в MinIO без загрузки в память (C-5). */
async function putFile(
  minio: Minio.Client,
  bucket: string,
  key: string,
  filePath: string,
  contentType: string,
): Promise<number> {
  const { size } = await fs.stat(filePath)
  await minio.putObject(bucket, key, createReadStream(filePath), size, { 'Content-Type': contentType })
  return size
}

/**
 * Обрабатывает загруженный файл (уже сохранённый во временный файл tmpInput) и
 * заливает результат в MinIO потоково. Транскодинг проходит через семафор, чтобы
 * не насыщать CPU при множественных параллельных загрузках.
 */
export async function uploadMedia(
  minio: Minio.Client,
  tmpInput: string,
  sizeBytes: number,
  originalMime: string,
  fileType: UploadedFileType,
  userId: string,
  originalName?: string,
  // Клиентская длительность (мс) — запасной вариант, если ffprobe её не отдаёт
  // (короткие WebM/Opus от MediaRecorder часто без длительности в контейнере).
  clientDurationMs?: number,
): Promise<UploadResult> {
  const limit = SIZE_LIMITS[fileType]
  if (sizeBytes > limit) {
    throw new Error(`File too large. Max ${Math.round(limit / 1024 / 1024)} MB for ${fileType}`)
  }

  const now = Date.now()
  const prefix = `${userId}/${now}`
  const bucket = env.MINIO_BUCKET_MEDIA

  // Документ: сохраняем как есть, без транскодинга, сохраняя оригинальное имя.
  if (fileType === 'document') {
    const safeName = (originalName ?? 'file').replace(/[^\w.\-]+/g, '_').slice(-120)
    const key = `${prefix}/${safeName}`
    await putFile(minio, bucket, key, tmpInput, originalMime || 'application/octet-stream')
    return {
      storageKey: key,
      fileName: originalName,
      mimeType: originalMime || 'application/octet-stream',
      sizeBytes,
      publicUrl: buildUrl(bucket, key),
    }
  }

  // Изображение: транскодинг не нужен — стримим оригинал напрямую.
  if (fileType === 'image') {
    const ext = originalMime.includes('png') ? '.png'
      : originalMime.includes('gif') ? '.gif'
      : originalMime.includes('webp') ? '.webp'
      : '.jpg'
    const key = `${prefix}/image${ext}`
    await putFile(minio, bucket, key, tmpInput, originalMime)
    return {
      storageKey: key,
      mimeType: originalMime,
      sizeBytes,
      publicUrl: buildUrl(bucket, key),
    }
  }

  // Аудио / видео / кружок — транскодинг под лимитом параллелизма.
  return transcodeSem.run(async () => {
    if (fileType === 'audio') {
      const outPath = path.join(os.tmpdir(), `infy-out-${now}.opus`)
      try {
        await transcodeAudio(tmpInput, outPath).catch(() => fs.copyFile(tmpInput, outPath))

        const [info, waveform] = await Promise.all([
          probeMedia(outPath),
          generateWaveform(tmpInput),
        ])

        // Длительность: ffprobe → точный подсчёт декодированием → клиентская оценка.
        let durationMs = info.durationMs
        if (!durationMs) durationMs = await probeAudioDurationMs(outPath)
        if (!durationMs && clientDurationMs && clientDurationMs > 0) {
          durationMs = Math.round(clientDurationMs)
        }

        const key = `${prefix}/audio.opus`
        const outSize = await putFile(minio, bucket, key, outPath, 'audio/ogg; codecs=opus')

        return {
          storageKey: key,
          mimeType: 'audio/ogg; codecs=opus',
          sizeBytes: outSize,
          durationMs,
          waveform,
          publicUrl: buildUrl(bucket, key),
        }
      } finally {
        await fs.unlink(outPath).catch(() => {})
      }
    }

    if (fileType === 'circle_video') {
      const outPath = path.join(os.tmpdir(), `infy-out-${now}.mp4`)
      const thumbPath = path.join(os.tmpdir(), `infy-thumb-${now}.jpg`)
      try {
        await transcodeCircleVideo(tmpInput, outPath).catch(() => fs.copyFile(tmpInput, outPath))

        const [info] = await Promise.all([
          probeMedia(outPath),
          generateThumbnail(outPath, thumbPath).catch(() => {}),
        ])

        const key = `${prefix}/circle.mp4`
        const thumbKey = `${prefix}/circle-thumb.jpg`
        const outSize = await putFile(minio, bucket, key, outPath, 'video/mp4')

        let thumbnailKey: string | undefined
        try {
          await putFile(minio, bucket, thumbKey, thumbPath, 'image/jpeg')
          thumbnailKey = thumbKey
        } catch { /* thumb optional */ }

        return {
          storageKey: key,
          thumbnailKey,
          mimeType: 'video/mp4',
          sizeBytes: outSize,
          width: info.width,
          height: info.height,
          durationMs: info.durationMs,
          publicUrl: buildUrl(bucket, key),
          thumbnailUrl: thumbnailKey ? buildUrl(bucket, thumbnailKey) : undefined,
        }
      } finally {
        await Promise.all([fs.unlink(outPath), fs.unlink(thumbPath)].map(p => p.catch(() => {})))
      }
    }

    // Regular video
    const outPath = path.join(os.tmpdir(), `infy-out-${now}.mp4`)
    const thumbPath = path.join(os.tmpdir(), `infy-thumb-${now}.jpg`)
    try {
      await transcodeVideo(tmpInput, outPath).catch(() => fs.copyFile(tmpInput, outPath))

      const [info] = await Promise.all([
        probeMedia(outPath),
        generateThumbnail(outPath, thumbPath).catch(() => {}),
      ])

      const key = `${prefix}/video.mp4`
      const thumbKey = `${prefix}/video-thumb.jpg`
      const outSize = await putFile(minio, bucket, key, outPath, 'video/mp4')

      let thumbnailKey: string | undefined
      try {
        await putFile(minio, bucket, thumbKey, thumbPath, 'image/jpeg')
        thumbnailKey = thumbKey
      } catch { /* thumb optional */ }

      return {
        storageKey: key,
        thumbnailKey,
        mimeType: 'video/mp4',
        sizeBytes: outSize,
        width: info.width,
        height: info.height,
        durationMs: info.durationMs,
        publicUrl: buildUrl(bucket, key),
        thumbnailUrl: thumbnailKey ? buildUrl(bucket, thumbnailKey) : undefined,
      }
    } finally {
      await Promise.all([fs.unlink(outPath), fs.unlink(thumbPath)].map(p => p.catch(() => {})))
    }
  })
}

export async function getPresignedUrl(minio: Minio.Client, key: string): Promise<string> {
  const bucket = key.startsWith('avatars/') ? env.MINIO_BUCKET_AVATARS : env.MINIO_BUCKET_MEDIA
  return minio.presignedGetObject(bucket, key, 3600)
}

function buildUrl(bucket: string, key: string): string {
  return `${env.MINIO_PUBLIC_URL}/${bucket}/${key}`
}
