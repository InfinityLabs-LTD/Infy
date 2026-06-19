// Персистентная очередь исходящих сообщений (outbox).
//
// Хранит задания отправки (текст и медиа) вместе с исходными файлами в IndexedDB,
// чтобы они переживали перезагрузку страницы, выгрузку фоновой вкладки и потерю
// сети. По восстановлению соединения (`window 'online'` / реконнект сокета)
// очередь автоматически до-отправляется (flushOutbox) без действий пользователя.
//
// Дедупликация на сервере — по clientMessageId (идемпотентный ключ задания),
// поэтому повторная отправка одного задания не создаёт дубль.

export type PendingKind = 'image' | 'video' | 'document'

export interface PendingLocal {
  file: File | Blob
  kind: PendingKind
  hint?: 'circle_video' | 'document'
  // previewUrl — object URL для мгновенного предпросмотра. НЕ персистится
  // (создаётся заново из Blob при восстановлении).
  previewUrl?: string
  // Длительность (мс), измеренная на клиенте — для аудио/кружков.
  durationMs?: number
}

export interface PendingJob {
  tempId: string
  // Идемпотентный ключ отправки (совпадает с message.clientMessageId).
  clientMessageId: string
  chatId: string
  // TEXT — текстовое сообщение (content), остальные — медиа (locals).
  msgType: 'TEXT' | 'IMAGE' | 'VIDEO' | 'AUDIO' | 'CIRCLE_VIDEO' | 'FILE' | 'ALBUM'
  locals: PendingLocal[]
  content?: string        // текст сообщения (для TEXT) или подпись альбома
  caption?: string
  replyToId?: string
  createdAt: number
}

// Время жизни задания — 24 часа.
export const PENDING_TTL_MS = 24 * 60 * 60 * 1000

// ── In-memory зеркало (быстрый доступ; источник истины — IndexedDB) ──
const jobs = new Map<string, PendingJob>()
// tempId заданий, которые сейчас отправляются — чтобы flush не запускал их дважды.
const inFlight = new Set<string>()

let onExpire: ((job: PendingJob) => void) | null = null
// Раннер фактической отправки задания. Регистрируется в ChatPage (там есть
// доступ к API и стору). Возвращает Promise; ошибки — это «не удалось, повторим».
let runner: ((job: PendingJob) => Promise<void>) | null = null

// ── IndexedDB ────────────────────────────────────────────────
const DB_NAME = 'infy-outbox'
const STORE = 'jobs'
let dbPromise: Promise<IDBDatabase | null> | null = null

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') { resolve(null); return }
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'tempId' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => resolve(null)  // IndexedDB недоступен (приватный режим) — деградируем до RAM
  })
  return dbPromise
}

// Сериализуемая форма задания для IndexedDB. Blob'ы IndexedDB хранит нативно;
// previewUrl (object URL) не сохраняем — он невалиден в новой сессии.
type StoredJob = Omit<PendingJob, 'locals'> & {
  locals: Array<Omit<PendingLocal, 'previewUrl'>>
}

function toStored(job: PendingJob): StoredJob {
  return {
    ...job,
    locals: job.locals.map(({ previewUrl: _omit, ...rest }) => rest),
  }
}

async function dbPut(job: PendingJob): Promise<void> {
  const db = await openDb()
  if (!db) return
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(toStored(job))
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
  })
}

async function dbDelete(tempId: string): Promise<void> {
  const db = await openDb()
  if (!db) return
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(tempId)
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
  })
}

async function dbGetAll(): Promise<StoredJob[]> {
  const db = await openDb()
  if (!db) return []
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).getAll()
    req.onsuccess = () => resolve((req.result as StoredJob[]) ?? [])
    req.onerror = () => resolve([])
  })
}

// ── Публичный API ────────────────────────────────────────────

export function setPendingExpireHandler(fn: (job: PendingJob) => void) {
  onExpire = fn
}

export function setOutboxRunner(fn: (job: PendingJob) => Promise<void>) {
  runner = fn
}

export function addPendingJob(job: Omit<PendingJob, 'createdAt'> & { createdAt?: number }) {
  const full: PendingJob = { ...job, createdAt: job.createdAt ?? Date.now() }
  jobs.set(full.tempId, full)
  void dbPut(full)
}

export function getPendingJob(tempId: string): PendingJob | undefined {
  return jobs.get(tempId)
}

export function getAllPendingJobs(): PendingJob[] {
  return [...jobs.values()].sort((a, b) => a.createdAt - b.createdAt)
}

export function removePendingJob(tempId: string) {
  const job = jobs.get(tempId)
  if (job) {
    job.locals.forEach((l) => l.previewUrl && URL.revokeObjectURL(l.previewUrl))
    jobs.delete(tempId)
  }
  inFlight.delete(tempId)
  void dbDelete(tempId)
}

// Удаляет просроченные задания (старше суток), оповещая обработчик.
export function sweepExpired(now = Date.now()) {
  for (const [tempId, job] of jobs) {
    if (now - job.createdAt >= PENDING_TTL_MS) {
      job.locals.forEach((l) => l.previewUrl && URL.revokeObjectURL(l.previewUrl))
      jobs.delete(tempId)
      inFlight.delete(tempId)
      void dbDelete(tempId)
      onExpire?.(job)
    }
  }
}

// Запускает отправку всех заданий, которые сейчас не в полёте. Вызывается при
// восстановлении сети/сокета и после восстановления очереди со старта.
export function flushOutbox() {
  if (!runner) return
  const now = Date.now()
  for (const job of getAllPendingJobs()) {
    if (now - job.createdAt >= PENDING_TTL_MS) continue
    if (inFlight.has(job.tempId)) continue
    inFlight.add(job.tempId)
    Promise.resolve(runner(job))
      .catch(() => { /* раннер сам помечает failed */ })
      .finally(() => { inFlight.delete(job.tempId) })
  }
}

export function isInFlight(tempId: string): boolean {
  return inFlight.has(tempId)
}

// Восстанавливает очередь из IndexedDB в память (вызывается на старте).
// Для каждого задания заново создаёт previewUrl из сохранённого Blob и отдаёт
// колбэку, чтобы тот вернул оптимистичное сообщение в ленту. Просроченные —
// удаляет. Возвращает восстановленные задания (уже с previewUrl).
export async function restoreOutbox(): Promise<PendingJob[]> {
  const stored = await dbGetAll()
  const now = Date.now()
  const restored: PendingJob[] = []
  for (const sj of stored) {
    if (now - sj.createdAt >= PENDING_TTL_MS) { void dbDelete(sj.tempId); continue }
    const job: PendingJob = {
      ...sj,
      locals: sj.locals.map((l) => ({
        ...l,
        previewUrl: l.kind === 'document' ? undefined : URL.createObjectURL(l.file),
      })),
    }
    jobs.set(job.tempId, job)
    restored.push(job)
  }
  return restored
}

// Периодическая чистка раз в 10 минут (на случай долгоживущей вкладки).
let sweepTimer: ReturnType<typeof setInterval> | null = null
export function startPendingSweeper() {
  if (sweepTimer) return
  sweepTimer = setInterval(() => sweepExpired(), 10 * 60 * 1000)
}
