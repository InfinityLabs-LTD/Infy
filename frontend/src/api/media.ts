import { api } from './client'

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

export const mediaApi = {
  upload: (file: File | Blob, hint?: 'circle_video' | 'document') => {
    const form = new FormData()
    form.append('file', file)
    return api.post<{ data: UploadResult }>('/media/upload', form, {
      headers: {
        'Content-Type': 'multipart/form-data',
        ...(hint ? { 'x-media-type': hint } : {}),
      },
    })
  },
}
