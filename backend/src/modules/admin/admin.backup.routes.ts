import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { authenticate, requireAdmin } from '../../middleware/authenticate.js'
import { AppError } from '../../lib/errors.js'
import {
  createBackup,
  listBackups,
  deleteBackup,
  presignBackup,
  getBackupStream,
  uploadBackup,
  restoreBackup,
  applyRetention,
} from '../../lib/backup.js'
import {
  getBackupSchedule,
  updateBackupSchedule,
} from '../../lib/backupSettings.js'
import { env } from '../../lib/env.js'

// Подробный лог любой ошибки бэкап-модуля: помимо message пишем stack, имя
// класса ошибки и контекст операции — иначе из глобального хендлера видно
// только «Internal server error», а из AppError причина не логируется вовсе.
function logBackupError(
  app: Parameters<FastifyPluginAsync>[0],
  op: string,
  err: unknown,
  ctx: Record<string, unknown> = {},
): string {
  const e = err instanceof Error ? err : new Error(String(err))
  app.log.error(
    {
      op,
      ...ctx,
      err: {
        name: e.name,
        message: e.message,
        stack: e.stack,
        // у ошибок MinIO/драйвера часто есть code/ key, тащим их тоже
        code: (e as { code?: unknown }).code,
        cause: (e as { cause?: unknown }).cause,
      },
    },
    `backup: операция «${op}» завершилась ошибкой`,
  )
  return e.message
}

const adminBackupRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', authenticate)
  app.addHook('preHandler', requireAdmin)

  // GET /admin/backups — список копий + текущее расписание.
  app.get('/', {
    schema: { tags: ['Admin'], summary: 'List DB backups + schedule', security: [{ bearerAuth: [] }] },
  }, async () => {
    // Раздельные try/catch, чтобы в логе было видно, что именно отвалилось —
    // объектное хранилище (listBackups) или БД настроек (getBackupSchedule).
    let backups, schedule
    try {
      backups = await listBackups(app.minio)
    } catch (err) {
      const msg = logBackupError(app, 'list', err, { bucket: env.MINIO_BUCKET_BACKUPS })
      throw new AppError('BACKUP_FAILED', `Не удалось получить список копий: ${msg}`, 500)
    }
    try {
      schedule = await getBackupSchedule(app.prisma)
    } catch (err) {
      const msg = logBackupError(app, 'schedule.read', err)
      throw new AppError('BACKUP_FAILED', `Не удалось прочитать расписание: ${msg}`, 500)
    }
    return { data: { backups, schedule } }
  })

  // POST /admin/backups — создать копию вручную.
  app.post('/', {
    schema: { tags: ['Admin'], summary: 'Create a DB backup now', security: [{ bearerAuth: [] }] },
  }, async () => {
    try {
      const info = await createBackup(app.minio, 'manual')
      app.log.info({ op: 'create', name: info.name, size: info.size }, 'backup: копия создана')
      return { data: info }
    } catch (err) {
      const msg = logBackupError(app, 'create', err, { trigger: 'manual' })
      throw new AppError('BACKUP_FAILED', msg, 500)
    }
  })

  // GET /admin/backups/:name/download — скачать (proxy-стрим через бэкенд).
  app.get('/:name/download', {
    schema: {
      tags: ['Admin'], summary: 'Download a backup', security: [{ bearerAuth: [] }],
      params: { type: 'object', properties: { name: { type: 'string' } } },
    },
  }, async (request, reply) => {
    const { name } = request.params as { name: string }
    try {
      const { stream, size } = await getBackupStream(app.minio, name)
      reply.header('Content-Type', 'application/gzip')
      reply.header('Content-Length', String(size))
      reply.header('Content-Disposition', `attachment; filename="${name}"`)
      return reply.send(stream)
    } catch (err) {
      const msg = logBackupError(app, 'download', err, { name })
      throw new AppError('BACKUP_NOT_FOUND', msg, 404)
    }
  })

  // GET /admin/backups/:name/link — presigned-ссылка (альтернатива прокси-скачиванию).
  app.get('/:name/link', {
    schema: {
      tags: ['Admin'], summary: 'Presigned download URL', security: [{ bearerAuth: [] }],
      params: { type: 'object', properties: { name: { type: 'string' } } },
    },
  }, async (request) => {
    const { name } = request.params as { name: string }
    try {
      const url = await presignBackup(app.minio, name)
      return { data: { url } }
    } catch (err) {
      const msg = logBackupError(app, 'link', err, { name })
      throw new AppError('BACKUP_NOT_FOUND', msg, 404)
    }
  })

  // DELETE /admin/backups/:name — удалить копию.
  app.delete('/:name', {
    schema: {
      tags: ['Admin'], summary: 'Delete a backup', security: [{ bearerAuth: [] }],
      params: { type: 'object', properties: { name: { type: 'string' } } },
    },
  }, async (request, reply) => {
    const { name } = request.params as { name: string }
    try {
      await deleteBackup(app.minio, name)
    } catch (err) {
      const msg = logBackupError(app, 'delete', err, { name })
      throw new AppError('BACKUP_FAILED', `Не удалось удалить копию: ${msg}`, 500)
    }
    app.log.info({ op: 'delete', name }, 'backup: копия удалена')
    return reply.code(204).send()
  })

  // POST /admin/backups/upload — загрузить файл копии на сервер (multipart .sql.gz).
  app.post('/upload', {
    schema: {
      tags: ['Admin'], summary: 'Upload a backup file', security: [{ bearerAuth: [] }],
      consumes: ['multipart/form-data'],
    },
  }, async (request) => {
    const data = await request.file({ limits: { fileSize: env.MAX_UPLOAD_BYTES } })
    if (!data) throw new AppError('BACKUP_NO_FILE', 'Файл не передан', 400)
    if (!/\.(sql\.gz|gz|sql)$/i.test(data.filename)) {
      throw new AppError('BACKUP_BAD_FILE', 'Ожидается файл .sql.gz', 400)
    }
    try {
      const info = await uploadBackup(app.minio, data.file, data.filename)
      app.log.info({ op: 'upload', name: info.name, size: info.size }, 'backup: файл загружен')
      return { data: info }
    } catch (err) {
      if (err instanceof Error && err.message === 'TRUNCATED') {
        app.log.warn({ op: 'upload', filename: data.filename }, 'backup: загрузка оборвана лимитом размера')
        throw new AppError('BACKUP_TOO_LARGE', 'Файл превышает лимит загрузки', 413)
      }
      const msg = logBackupError(app, 'upload', err, { filename: data.filename })
      throw new AppError('BACKUP_UPLOAD_FAILED', msg, 500)
    }
  })

  // POST /admin/backups/:name/restore — восстановить БД из копии (ОПАСНО).
  app.post('/:name/restore', {
    schema: {
      tags: ['Admin'], summary: 'Restore DB from a backup', security: [{ bearerAuth: [] }],
      params: { type: 'object', properties: { name: { type: 'string' } } },
    },
  }, async (request) => {
    const { name } = request.params as { name: string }
    const body = z.object({ confirm: z.literal(true) }).safeParse(request.body)
    if (!body.success) throw new AppError('BACKUP_CONFIRM_REQUIRED', 'Требуется подтверждение', 400)
    app.log.warn({ op: 'restore', name }, 'backup: запрошено восстановление БД из копии')
    try {
      await restoreBackup(app.minio, name)
      app.log.info({ op: 'restore', name }, 'backup: восстановление завершено успешно')
      return { data: { ok: true } }
    } catch (err) {
      const msg = logBackupError(app, 'restore', err, { name })
      throw new AppError('BACKUP_RESTORE_FAILED', msg, 500)
    }
  })

  // PATCH /admin/backups/schedule — обновить расписание авто-бэкапов.
  app.patch('/schedule', {
    schema: { tags: ['Admin'], summary: 'Update backup schedule', security: [{ bearerAuth: [] }] },
  }, async (request) => {
    const body = z.object({
      enabled: z.boolean().optional(),
      frequency: z.enum(['daily', 'weekly', 'monthly']).optional(),
      hour: z.number().int().min(0).max(23).optional(),
      minute: z.number().int().min(0).max(59).optional(),
      weekday: z.number().int().min(0).max(6).optional(),
      day: z.number().int().min(1).max(28).optional(),
      retention: z.number().int().min(1).max(365).optional(),
    }).parse(request.body)

    let schedule
    try {
      schedule = await updateBackupSchedule(app.prisma, body)
    } catch (err) {
      const msg = logBackupError(app, 'schedule.update', err, { patch: body })
      throw new AppError('BACKUP_FAILED', `Не удалось сохранить расписание: ${msg}`, 500)
    }
    // Если ретеншн ужесточили — подчистим лишние авто-копии сразу.
    // Ошибку ретеншна не роняем наружу (расписание уже сохранено), но логируем.
    if (body.retention !== undefined) {
      await applyRetention(app.minio, schedule.retention).catch((err) => {
        logBackupError(app, 'retention', err, { retention: schedule.retention })
      })
    }
    return { data: schedule }
  })
}

export default adminBackupRoutes
