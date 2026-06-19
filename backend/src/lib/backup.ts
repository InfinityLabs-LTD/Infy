import { spawn } from 'child_process'
import { createWriteStream } from 'fs'
import { stat, unlink, mkdtemp, rmdir } from 'fs/promises'
import path from 'path'
import os from 'os'
import { pipeline } from 'stream/promises'
import { createGzip, createGunzip } from 'zlib'
import * as Minio from 'minio'
import { env } from './env.js'

// ── Хранилище бэкапов ─────────────────────────────────────────
// Дампы PostgreSQL лежат в отдельном бакете MinIO (S3). Это переживает
// пересборку контейнеров и позволяет скачивать/загружать копии из админки.

export const BACKUP_BUCKET = env.MINIO_BUCKET_BACKUPS

// Минимальный логгер на уровне библиотеки: сюда заходит и scheduler-воркер,
// у которого нет fastify-логгера. Пишем стадию операции и ошибку с stack —
// чтобы из логов контейнера было видно, на каком шаге всё сломалось.
function blog(stage: string, extra?: Record<string, unknown>): void {
  console.log(JSON.stringify({ scope: 'backup', stage, ...extra }))
}
function blogErr(stage: string, err: unknown, extra?: Record<string, unknown>): void {
  const e = err instanceof Error ? err : new Error(String(err))
  console.error(JSON.stringify({
    scope: 'backup', stage,
    err: { name: e.name, message: e.message, code: (e as { code?: unknown }).code, stack: e.stack },
    ...extra,
  }))
}

let bucketReady = false
async function ensureBucket(minio: Minio.Client): Promise<void> {
  if (bucketReady) return
  try {
    const exists = await minio.bucketExists(BACKUP_BUCKET)
    if (!exists) {
      blog('ensureBucket.create', { bucket: BACKUP_BUCKET })
      await minio.makeBucket(BACKUP_BUCKET)
    }
    bucketReady = true
  } catch (err) {
    blogErr('ensureBucket', err, { bucket: BACKUP_BUCKET })
    throw err
  }
}

// ── Разбор DATABASE_URL для pg_dump/pg_restore ────────────────

interface PgConn {
  host: string
  port: string
  user: string
  password: string
  database: string
}

function parseDatabaseUrl(url: string): PgConn {
  const u = new URL(url)
  return {
    host: u.hostname,
    port: u.port || '5432',
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: decodeURIComponent(u.pathname.replace(/^\//, '')),
  }
}

function pgEnv(conn: PgConn): NodeJS.ProcessEnv {
  return { ...process.env, PGPASSWORD: conn.password }
}

// ── Описание объекта-бэкапа ───────────────────────────────────

export interface BackupInfo {
  name: string          // ключ объекта в бакете (== имя файла)
  size: number          // байт
  createdAt: string     // ISO
  trigger: 'manual' | 'scheduled' | 'upload'
}

function triggerFromMeta(meta: Record<string, string> | undefined): BackupInfo['trigger'] {
  const t = meta?.['x-amz-meta-trigger'] ?? meta?.['trigger']
  if (t === 'scheduled' || t === 'upload') return t
  return 'manual'
}

function makeBackupName(now = new Date()): string {
  // infy-2026-06-19T03-00-00Z.sql.gz — сортируется лексикографически по времени.
  const ts = now.toISOString().replace(/:/g, '-').replace(/\.\d+Z$/, 'Z')
  return `infy-${ts}.sql.gz`
}

// ── Создание дампа ────────────────────────────────────────────

/**
 * Делает pg_dump текущей БД, gzip-ит на диск во временный файл, заливает в MinIO
 * и удаляет временный файл. Возвращает метаданные созданной копии.
 */
export async function createBackup(
  minio: Minio.Client,
  trigger: BackupInfo['trigger'] = 'manual',
): Promise<BackupInfo> {
  await ensureBucket(minio)
  const conn = parseDatabaseUrl(env.DATABASE_URL)
  const name = makeBackupName()

  const dir = await mkdtemp(path.join(os.tmpdir(), 'infy-backup-'))
  const tmpFile = path.join(dir, name)

  try {
    blog('dump.start', { name, host: conn.host, db: conn.database, trigger })
    await runDump(conn, tmpFile)
    const { size } = await stat(tmpFile)
    blog('dump.done', { name, size })

    await minio.fPutObject(BACKUP_BUCKET, name, tmpFile, {
      'Content-Type': 'application/gzip',
      'x-amz-meta-trigger': trigger,
    })
    blog('put.done', { name, size })

    return { name, size, createdAt: new Date().toISOString(), trigger }
  } catch (err) {
    blogErr('createBackup', err, { name, trigger })
    throw err
  } finally {
    await unlink(tmpFile).catch(() => {})
    await rmdir(dir).catch(() => {})
  }
}

async function runDump(conn: PgConn, outFile: string): Promise<void> {
  // --no-owner/--no-acl делают дамп переносимым между ролями/инсталляциями.
  const args = [
    '-h', conn.host,
    '-p', conn.port,
    '-U', conn.user,
    '-d', conn.database,
    '--no-owner',
    '--no-acl',
    '--clean',
    '--if-exists',
  ]
  const child = spawn('pg_dump', args, { env: pgEnv(conn) })

  let stderr = ''
  child.stderr.on('data', (d) => { stderr += d.toString() })

  // Код завершения процесса (или ошибка запуска).
  const exit = new Promise<number>((resolve, reject) => {
    child.on('error', (err) => reject(new Error(`pg_dump не запущен: ${err.message}`)))
    child.on('close', (code) => resolve(code ?? -1))
  })

  // Сжатие потока в файл. pipeline дождётся полной записи и закрытия файла.
  const piped = pipeline(child.stdout, createGzip(), createWriteStream(outFile))

  const [code] = await Promise.all([exit, piped])
  if (code !== 0) {
    throw new Error(`pg_dump завершился с кодом ${code}: ${stderr.slice(0, 500)}`)
  }
}

// ── Список / удаление / скачивание ────────────────────────────

export async function listBackups(minio: Minio.Client): Promise<BackupInfo[]> {
  await ensureBucket(minio)
  const items: BackupInfo[] = []

  await new Promise<void>((resolve, reject) => {
    const stream = minio.listObjectsV2(BACKUP_BUCKET, '', true)
    stream.on('data', (obj) => {
      if (!obj.name) return
      items.push({
        name: obj.name,
        size: obj.size ?? 0,
        createdAt: (obj.lastModified ?? new Date()).toISOString(),
        trigger: 'manual',  // уточним метаданными ниже при необходимости
      })
    })
    stream.on('end', () => resolve())
    stream.on('error', reject)
  })

  // Подтягиваем trigger из метаданных (дёшево, копий немного).
  await Promise.all(items.map(async (it) => {
    try {
      const s = await minio.statObject(BACKUP_BUCKET, it.name)
      it.trigger = triggerFromMeta(s.metaData)
    } catch { /* объект мог исчезнуть — оставляем дефолт */ }
  }))

  // Новейшие сверху.
  items.sort((a, b) => b.name.localeCompare(a.name))
  return items
}

export async function deleteBackup(minio: Minio.Client, name: string): Promise<void> {
  assertSafeName(name)
  await minio.removeObject(BACKUP_BUCKET, name)
}

// Presigned URL для скачивания (живёт 5 минут).
// MinIO SDK подставляет внутренний хост (minio:9000) — заменяем на публичный.
export async function presignBackup(minio: Minio.Client, name: string): Promise<string> {
  assertSafeName(name)
  await minio.statObject(BACKUP_BUCKET, name)   // 404, если нет
  const raw = await minio.presignedGetObject(BACKUP_BUCKET, name, 5 * 60)
  const publicBase = new URL(env.MINIO_PUBLIC_URL)
  const u = new URL(raw)
  u.protocol = publicBase.protocol
  u.hostname = publicBase.hostname
  u.port     = publicBase.port
  return u.toString()
}

// Стрим объекта (для прокси-скачивания через бэкенд).
export async function getBackupStream(
  minio: Minio.Client,
  name: string,
): Promise<{ stream: NodeJS.ReadableStream; size: number }> {
  assertSafeName(name)
  const s = await minio.statObject(BACKUP_BUCKET, name)
  const stream = await minio.getObject(BACKUP_BUCKET, name)
  return { stream, size: s.size }
}

// ── Загрузка копии на сервер (из файла админа) ────────────────

/**
 * Принимает загруженный поток (ожидается .sql.gz), сохраняет в бакет под
 * нормализованным именем с пометкой trigger=upload.
 */
export async function uploadBackup(
  minio: Minio.Client,
  source: NodeJS.ReadableStream & { truncated?: boolean },
  originalName: string,
): Promise<BackupInfo> {
  await ensureBucket(minio)
  const safe = sanitizeUploadName(originalName)

  const dir = await mkdtemp(path.join(os.tmpdir(), 'infy-upload-'))
  const tmpFile = path.join(dir, safe)
  try {
    await pipeline(source, createWriteStream(tmpFile))
    // multipart-лимит мог оборвать поток — не сохраняем неполный файл в хранилище.
    if (source.truncated) throw new Error('TRUNCATED')
    const { size } = await stat(tmpFile)
    await minio.fPutObject(BACKUP_BUCKET, safe, tmpFile, {
      'Content-Type': 'application/gzip',
      'x-amz-meta-trigger': 'upload',
    })
    return { name: safe, size, createdAt: new Date().toISOString(), trigger: 'upload' }
  } finally {
    await unlink(tmpFile).catch(() => {})
    await rmdir(dir).catch(() => {})
  }
}

// ── Восстановление из копии ───────────────────────────────────

/**
 * Восстанавливает БД из ранее созданной копии. Скачивает объект, разжимает и
 * скармливает в psql. Дамп делается с --clean --if-exists, поэтому psql сам
 * пересоздаёт объекты. ОПАСНО: перезаписывает текущие данные.
 */
export async function restoreBackup(minio: Minio.Client, name: string): Promise<void> {
  assertSafeName(name)
  const conn = parseDatabaseUrl(env.DATABASE_URL)

  const dir = await mkdtemp(path.join(os.tmpdir(), 'infy-restore-'))
  const tmpFile = path.join(dir, 'restore.sql')
  try {
    // Скачиваем + разжимаем во временный .sql.
    blog('restore.fetch', { name })
    const objStream = await minio.getObject(BACKUP_BUCKET, name)
    await pipeline(objStream, createGunzip(), createWriteStream(tmpFile))
    blog('restore.psql', { name })
    await runRestore(conn, tmpFile)
    blog('restore.done', { name })
  } catch (err) {
    blogErr('restoreBackup', err, { name })
    throw err
  } finally {
    await unlink(tmpFile).catch(() => {})
    await rmdir(dir).catch(() => {})
  }
}

function runRestore(conn: PgConn, sqlFile: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      '-h', conn.host,
      '-p', conn.port,
      '-U', conn.user,
      '-d', conn.database,
      '-v', 'ON_ERROR_STOP=1',
      '-f', sqlFile,
    ]
    const child = spawn('psql', args, { env: pgEnv(conn) })
    let stderr = ''
    child.stderr.on('data', (d) => { stderr += d.toString() })
    child.on('error', (err) => reject(new Error(`psql не запущен: ${err.message}`)))
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`psql завершился с кодом ${code}: ${stderr.slice(0, 800)}`))
    })
  })
}

// ── Ретеншн ───────────────────────────────────────────────────

/**
 * Оставляет только N новейших АВТОМАТИЧЕСКИХ копий (trigger=scheduled).
 * Ручные и загруженные копии не трогаем — их удаляет только админ.
 */
export async function applyRetention(minio: Minio.Client, keep: number): Promise<number> {
  const all = await listBackups(minio)
  const scheduled = all.filter(b => b.trigger === 'scheduled')   // уже отсортированы новейшие сверху
  const toDelete = scheduled.slice(keep)
  for (const b of toDelete) {
    await minio.removeObject(BACKUP_BUCKET, b.name).catch(() => {})
  }
  return toDelete.length
}

// ── Безопасность имён ─────────────────────────────────────────

function assertSafeName(name: string): void {
  if (!name || name.includes('/') || name.includes('\\') || name.includes('..')) {
    throw new Error('Недопустимое имя резервной копии')
  }
}

function sanitizeUploadName(name: string): string {
  const base = path.basename(name).replace(/[^a-zA-Z0-9._-]/g, '_')
  const cleaned = base.replace(/^\.+/, '') || 'upload.sql.gz'
  // Гарантируем уникальность префиксом-временем, чтобы не перетереть существующую.
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  return `upload-${ts}-${cleaned}`
}
