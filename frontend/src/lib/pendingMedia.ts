// Реестр оптимистичных медиа-отправок: хранит исходные файлы и параметры
// сообщения по tempId, чтобы при неудачной отправке можно было повторить её
// по тапу. Blob'ы держим в памяти не дольше суток — затем задание истекает
// и удаляется (вместе с оптимистичным сообщением из ленты).

export type PendingKind = 'image' | 'video' | 'document'

export interface PendingLocal {
  file: File
  kind: PendingKind
  hint?: 'circle_video' | 'document'
  previewUrl?: string
  // Длительность (мс), измеренная на клиенте — для аудио/кружков, чтобы бэкенд
  // имел запасной вариант, если ffprobe не определит её из контейнера.
  durationMs?: number
}

export interface PendingJob {
  tempId: string
  chatId: string
  msgType: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'CIRCLE_VIDEO' | 'FILE' | 'ALBUM'
  locals: PendingLocal[]
  caption?: string
  replyToId?: string
  createdAt: number
}

// Время жизни задания в памяти — 24 часа.
export const PENDING_TTL_MS = 24 * 60 * 60 * 1000

const jobs = new Map<string, PendingJob>()
// Колбэк, вызываемый когда задание истекло (для удаления сообщения из ленты).
let onExpire: ((job: PendingJob) => void) | null = null

export function setPendingExpireHandler(fn: (job: PendingJob) => void) {
  onExpire = fn
}

export function addPendingJob(job: Omit<PendingJob, 'createdAt'>) {
  jobs.set(job.tempId, { ...job, createdAt: Date.now() })
}

export function getPendingJob(tempId: string): PendingJob | undefined {
  return jobs.get(tempId)
}

export function removePendingJob(tempId: string) {
  const job = jobs.get(tempId)
  if (job) {
    job.locals.forEach((l) => l.previewUrl && URL.revokeObjectURL(l.previewUrl))
    jobs.delete(tempId)
  }
}

// Удаляет просроченные задания (старше суток), оповещая обработчик.
export function sweepExpired(now = Date.now()) {
  for (const [tempId, job] of jobs) {
    if (now - job.createdAt >= PENDING_TTL_MS) {
      job.locals.forEach((l) => l.previewUrl && URL.revokeObjectURL(l.previewUrl))
      jobs.delete(tempId)
      onExpire?.(job)
    }
  }
}

// Периодическая чистка раз в 10 минут (на случай долгоживущей вкладки).
let sweepTimer: ReturnType<typeof setInterval> | null = null
export function startPendingSweeper() {
  if (sweepTimer) return
  sweepTimer = setInterval(() => sweepExpired(), 10 * 60 * 1000)
}
