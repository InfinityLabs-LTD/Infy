import { execFile } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import os from 'os'
import fs from 'fs/promises'
import { createReadStream, createWriteStream } from 'fs'

const execFileAsync = promisify(execFile)

// Resolve ffmpeg/ffprobe — prefer system install, fall back to ffmpeg-static
function ffmpegPath(): string {
  return process.env.FFMPEG_PATH ?? 'ffmpeg'
}
function ffprobePath(): string {
  return process.env.FFPROBE_PATH ?? 'ffprobe'
}

export interface MediaInfo {
  durationMs?: number
  width?: number
  height?: number
  waveform?: number[]   // normalized 0-1, ~100 samples
}

export async function probeMedia(filePath: string): Promise<MediaInfo> {
  try {
    const { stdout } = await execFileAsync(ffprobePath(), [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_streams',
      '-show_format',
      filePath,
    ])
    const data = JSON.parse(stdout)
    const videoStream = data.streams?.find((s: { codec_type: string }) => s.codec_type === 'video')
    const audioStream = data.streams?.find((s: { codec_type: string }) => s.codec_type === 'audio')
    const durationSec = parseFloat(data.format?.duration ?? '0')

    return {
      durationMs: durationSec > 0 ? Math.round(durationSec * 1000) : undefined,
      width: videoStream?.width,
      height: videoStream?.height,
    }
  } catch {
    return {}
  }
}

export async function transcodeVideo(inputPath: string, outputPath: string): Promise<void> {
  await execFileAsync(ffmpegPath(), [
    '-i', inputPath,
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '23',
    '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',   // ensure even dimensions
    '-maxrate', '2M',
    '-bufsize', '4M',
    '-vf', 'scale=-2:720',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart',
    '-y',
    outputPath,
  ])
}

export async function transcodeCircleVideo(inputPath: string, outputPath: string): Promise<void> {
  // Crop to square, scale to 400x400, encode as mp4
  await execFileAsync(ffmpegPath(), [
    '-i', inputPath,
    '-vf', [
      'crop=min(iw\\,ih):min(iw\\,ih)',
      'scale=400:400',
      'format=yuv420p',
    ].join(','),
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '26',
    '-t', '60',           // max 60 seconds
    '-c:a', 'aac',
    '-b:a', '96k',
    '-movflags', '+faststart',
    '-y',
    outputPath,
  ])
}

export async function transcodeAudio(inputPath: string, outputPath: string): Promise<void> {
  await execFileAsync(ffmpegPath(), [
    '-i', inputPath,
    '-c:a', 'libopus',
    '-b:a', '48k',
    '-vbr', 'on',
    '-y',
    outputPath,
  ])
}

export async function generateWaveform(inputPath: string, samples = 100): Promise<number[]> {
  try {
    const tmpOut = path.join(os.tmpdir(), `waveform-${Date.now()}.txt`)
    await execFileAsync(ffmpegPath(), [
      '-i', inputPath,
      '-af', `aresample=8000,asetnsamples=${samples},astats=metadata=1:reset=1`,
      '-f', 'null',
      '-',
    ])
    // Simpler approach: use volumedetect + split into chunks
    const { stdout } = await execFileAsync(ffmpegPath(), [
      '-i', inputPath,
      '-af', `aformat=channel_layouts=mono,compand,astats=metadata=1:reset=1:length=0.1,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=${tmpOut}`,
      '-f', 'null',
      '-',
    ]).catch(() => ({ stdout: '' }))

    const text = await fs.readFile(tmpOut, 'utf8').catch(() => '')
    await fs.unlink(tmpOut).catch(() => {})

    const values = text
      .split('\n')
      .filter(l => l.includes('RMS_level='))
      .map(l => {
        const v = parseFloat(l.split('=')[1])
        return isNaN(v) ? -60 : v
      })

    if (values.length === 0) return Array(samples).fill(0.5)

    // Normalize from dB (-60..0) to 0..1
    const min = -60
    const max = 0
    const normalized = values.map(v => Math.max(0, Math.min(1, (v - min) / (max - min))))

    // Resample to exactly `samples` points
    const result: number[] = []
    for (let i = 0; i < samples; i++) {
      const idx = Math.floor((i / samples) * normalized.length)
      result.push(normalized[idx] ?? 0)
    }
    return result
  } catch {
    return Array(samples).fill(0.5)
  }
}

export async function generateThumbnail(inputPath: string, outputPath: string): Promise<void> {
  await execFileAsync(ffmpegPath(), [
    '-i', inputPath,
    '-ss', '00:00:01',
    '-vframes', '1',
    '-vf', 'scale=320:-1',
    '-y',
    outputPath,
  ])
}

export async function withTempFile<T>(
  ext: string,
  fn: (filePath: string) => Promise<T>,
): Promise<T> {
  const filePath = path.join(os.tmpdir(), `infy-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`)
  try {
    return await fn(filePath)
  } finally {
    await fs.unlink(filePath).catch(() => {})
  }
}
