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
  // C-7: результат успешной загрузки файла в MinIO. Кэшируется в задании, чтобы
  // при ретрае не заливать тот же файл повторно (иначе копятся orphan-объекты).
  // Структура совпадает с ответом mediaApi.upload (UploadResult).
  uploaded?: unknown
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
  // C-6: счётчик попыток и время следующего разрешённого ретрая (epoch ms).
  // flushOutbox пропускает задание, пока now < nextRetryAt — это даёт
  // экспоненциальный backoff и гасит шторм мгновенных ретраев при флаппинге сети.
  attempts?: number
  nextRetryAt?: number
}

// C-6: backoff. Базовая задержка 2с, удвоение, потолок 60с, с джиттером.
const RETRY_BASE_MS = 2_000
const RETRY_MAX_MS = 60_000

export function computeBackoffMs(attempts: number): number {
  const exp = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.max(0, attempts - 1))
  const jitter = Math.random() * 0.3 * exp   // ±30% джиттер против синхронных ретраев
  return Math.round(exp + jitter)
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

// C-7: сохраняет результат успешной загрузки файла в задание (персистится в IDB),
// чтобы ретрай переиспользовал storageKey вместо повторной заливки.
export function setUploadedLocal(tempId: string, localIndex: number, uploaded: unknown) {
  const job = jobs.get(tempId)
  if (!job || !job.locals[localIndex]) return
  job.locals[localIndex].uploaded = uploaded
  void dbPut(job)
}

// C-6: помечает задание неудачным и планирует следующий ретрай с backoff.
// retryAfterMs (из заголовка Retry-After для 429) имеет приоритет над формулой.
export function scheduleRetry(tempId: string, retryAfterMs?: number) {
  const job = jobs.get(tempId)
  if (!job) return
  job.attempts = (job.attempts ?? 0) + 1
  const delay = retryAfterMs && retryAfterMs > 0 ? retryAfterMs : computeBackoffMs(job.attempts)
  job.nextRetryAt = Date.now() + delay
  void dbPut(job)
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
  let earliestNext = Infinity
  // M-2: сериализация по chatId. Запускаем не более одного задания на чат за раз и
  // строго в порядке createdAt — иначе параллельная отправка инвертирует порядок
  // у получателя (серверный ULID присваивается в момент записи, кто первый дошёл).
  const launchingChat = new Set<string>()
  for (const cid of inFlightChats()) launchingChat.add(cid)

  for (const job of getAllPendingJobs()) {   // отсортированы по createdAt
    if (now - job.createdAt >= PENDING_TTL_MS) continue
    if (inFlight.has(job.tempId)) continue
    // C-6: уважаем backoff — ещё рано ретраить.
    if (job.nextRetryAt && job.nextRetryAt > now) {
      earliestNext = Math.min(earliestNext, job.nextRetryAt)
      continue
    }
    // В этом чате уже есть отправляющееся/запускаемое задание — ждём его завершения.
    if (launchingChat.has(job.chatId)) continue
    launchingChat.add(job.chatId)
    inFlight.add(job.tempId)
    Promise.resolve(runner(job))
      .catch(() => { /* раннер сам помечает failed + scheduleRetry */ })
      .finally(() => {
        inFlight.delete(job.tempId)
        // Следующее задание этого чата подхватится следующим flush.
        flushOutbox()
      })
  }
  // Планируем повторный flush к моменту, когда созреет ближайший отложенный job,
  // чтобы ретрай случился без внешнего события (online/reconnect).
  if (earliestNext !== Infinity) {
    const wait = Math.max(250, earliestNext - now)
    if (retryWakeTimer) clearTimeout(retryWakeTimer)
    retryWakeTimer = setTimeout(() => { retryWakeTimer = null; flushOutbox() }, wait)
  }
}

// Множество chatId, по которым сейчас есть отправляющееся задание.
function inFlightChats(): Set<string> {
  const set = new Set<string>()
  for (const tempId of inFlight) {
    const job = jobs.get(tempId)
    if (job) set.add(job.chatId)
  }
  return set
}

let retryWakeTimer: ReturnType<typeof setTimeout> | null = null

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
