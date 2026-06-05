import { Readable } from 'stream'
import path from 'path'
import os from 'os'
import fs from 'fs/promises'
import * as Minio from 'minio'
import { env } from '../../lib/env.js'
import {
  probeMedia,
  transcodeVideo,
  transcodeCircleVideo,
  transcodeAudio,
  generateWaveform,
  generateThumbnail,
  withTempFile,
} from '../../lib/transcode.js'

export type UploadedFileType = 'image' | 'video' | 'audio' | 'circle_video'

const IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
const VIDEO_MIME = new Set(['video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska'])
const AUDIO_MIME = new Set(['audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/wav'])

const SIZE_LIMITS: Record<UploadedFileType, number> = {
  image:        20 * 1024 * 1024,
  video:       200 * 1024 * 1024,
  audio:        30 * 1024 * 1024,
  circle_video: 50 * 1024 * 1024,
}

export function detectFileType(mime: string, hint?: string): UploadedFileType {
  if (hint === 'circle_video') return 'circle_video'
  if (IMAGE_MIME.has(mime)) return 'image'
  if (VIDEO_MIME.has(mime)) return 'video'
  if (AUDIO_MIME.has(mime)) return 'audio'
  throw new Error(`Unsupported MIME type: ${mime}`)
}

export interface UploadResult {
  storageKey: string
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

export async function uploadMedia(
  minio: Minio.Client,
  buffer: Buffer,
  originalMime: string,
  fileType: UploadedFileType,
  userId: string,
): Promise<UploadResult> {
  const sizeBytes = buffer.length
  const limit = SIZE_LIMITS[fileType]
  if (sizeBytes > limit) {
    throw new Error(`File too large. Max ${Math.round(limit / 1024 / 1024)} MB for ${fileType}`)
  }

  const now = Date.now()
  const prefix = `${userId}/${now}`
  const bucket = env.MINIO_BUCKET_MEDIA

  // Write buffer to temp file for ffmpeg processing
  const inputExt = originalMime.includes('webm') ? '.webm'
    : originalMime.includes('ogg') ? '.ogg'
    : originalMime.includes('mp4') ? '.mp4'
    : originalMime.includes('quicktime') ? '.mov'
    : originalMime.includes('mpeg') ? '.mp3'
    : originalMime.includes('wav') ? '.wav'
    : '.bin'

  const tmpInput = path.join(os.tmpdir(), `infy-in-${now}${inputExt}`)
  await fs.writeFile(tmpInput, buffer)

  try {
    if (fileType === 'image') {
      const key = `${prefix}/image${path.extname(tmpInput) || '.jpg'}`
      await minio.putObject(bucket, key, Readable.from(buffer), sizeBytes, {
        'Content-Type': originalMime,
      })
      return {
        storageKey: key,
        mimeType: originalMime,
        sizeBytes,
        publicUrl: buildUrl(bucket, key),
      }
    }

    if (fileType === 'audio') {
      const outPath = path.join(os.tmpdir(), `infy-out-${now}.opus`)
      await transcodeAudio(tmpInput, outPath).catch(() => {
        // If transcode fails (ffmpeg not available), use original
        return fs.copyFile(tmpInput, outPath)
      })

      const [outBuf, info, waveform] = await Promise.all([
        fs.readFile(outPath),
        probeMedia(outPath),
        generateWaveform(tmpInput),
      ])

      const key = `${prefix}/audio.opus`
      await minio.putObject(bucket, key, Readable.from(outBuf), outBuf.length, {
        'Content-Type': 'audio/ogg; codecs=opus',
      })
      await fs.unlink(outPath).catch(() => {})

      return {
        storageKey: key,
        mimeType: 'audio/ogg; codecs=opus',
        sizeBytes: outBuf.length,
        durationMs: info.durationMs,
        waveform,
        publicUrl: buildUrl(bucket, key),
      }
    }

    if (fileType === 'circle_video') {
      const outPath = path.join(os.tmpdir(), `infy-out-${now}.mp4`)
      const thumbPath = path.join(os.tmpdir(), `infy-thumb-${now}.jpg`)
      await transcodeCircleVideo(tmpInput, outPath).catch(() => fs.copyFile(tmpInput, outPath))

      const [outBuf, info] = await Promise.all([
        fs.readFile(outPath),
        probeMedia(outPath),
        generateThumbnail(outPath, thumbPath).catch(() => {}),
      ])

      const key = `${prefix}/circle.mp4`
      const thumbKey = `${prefix}/circle-thumb.jpg`

      await minio.putObject(bucket, key, Readable.from(outBuf), outBuf.length, {
        'Content-Type': 'video/mp4',
      })

      let thumbnailKey: string | undefined
      try {
        const thumbBuf = await fs.readFile(thumbPath)
        await minio.putObject(bucket, thumbKey, Readable.from(thumbBuf), thumbBuf.length, {
          'Content-Type': 'image/jpeg',
        })
        thumbnailKey = thumbKey
      } catch { /* thumb optional */ }

      await Promise.all([fs.unlink(outPath), fs.unlink(thumbPath)].map(p => p.catch(() => {})))

      return {
        storageKey: key,
        thumbnailKey,
        mimeType: 'video/mp4',
        sizeBytes: outBuf.length,
        width: info.width,
        height: info.height,
        durationMs: info.durationMs,
        publicUrl: buildUrl(bucket, key),
        thumbnailUrl: thumbnailKey ? buildUrl(bucket, thumbnailKey) : undefined,
      }
    }

    // Regular video
    const outPath = path.join(os.tmpdir(), `infy-out-${now}.mp4`)
    const thumbPath = path.join(os.tmpdir(), `infy-thumb-${now}.jpg`)
    await transcodeVideo(tmpInput, outPath).catch(() => fs.copyFile(tmpInput, outPath))

    const [outBuf, info] = await Promise.all([
      fs.readFile(outPath),
      probeMedia(outPath),
      generateThumbnail(outPath, thumbPath).catch(() => {}),
    ])

    const key = `${prefix}/video.mp4`
    const thumbKey = `${prefix}/video-thumb.jpg`

    await minio.putObject(bucket, key, Readable.from(outBuf), outBuf.length, {
      'Content-Type': 'video/mp4',
    })

    let thumbnailKey: string | undefined
    try {
      const thumbBuf = await fs.readFile(thumbPath)
      await minio.putObject(bucket, thumbKey, Readable.from(thumbBuf), thumbBuf.length, {
        'Content-Type': 'image/jpeg',
      })
      thumbnailKey = thumbKey
    } catch { /* thumb optional */ }

    await Promise.all([fs.unlink(outPath), fs.unlink(thumbPath)].map(p => p.catch(() => {})))

    return {
      storageKey: key,
      thumbnailKey,
      mimeType: 'video/mp4',
      sizeBytes: outBuf.length,
      width: info.width,
      height: info.height,
      durationMs: info.durationMs,
      publicUrl: buildUrl(bucket, key),
      thumbnailUrl: thumbnailKey ? buildUrl(bucket, thumbnailKey) : undefined,
    }
  } finally {
    await fs.unlink(tmpInput).catch(() => {})
  }
}

export async function getPresignedUrl(minio: Minio.Client, key: string): Promise<string> {
  const bucket = key.startsWith('avatars/') ? env.MINIO_BUCKET_AVATARS : env.MINIO_BUCKET_MEDIA
  return minio.presignedGetObject(bucket, key, 3600)
}

function buildUrl(bucket: string, key: string): string {
  return `${env.MINIO_PUBLIC_URL}/${bucket}/${key}`
}
