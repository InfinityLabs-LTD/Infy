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

const adminBackupRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', authenticate)
  app.addHook('preHandler', requireAdmin)

  // GET /admin/backups — список копий + текущее расписание.
  app.get('/', {
    schema: { tags: ['Admin'], summary: 'List DB backups + schedule', security: [{ bearerAuth: [] }] },
  }, async () => {
    const [backups, schedule] = await Promise.all([
      listBackups(app.minio),
      getBackupSchedule(app.prisma),
    ])
    return { data: { backups, schedule } }
  })

  // POST /admin/backups — создать копию вручную.
  app.post('/', {
    schema: { tags: ['Admin'], summary: 'Create a DB backup now', security: [{ bearerAuth: [] }] },
  }, async () => {
    try {
      const info = await createBackup(app.minio, 'manual')
      return { data: info }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Backup failed'
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
      const msg = err instanceof Error ? err.message : 'Not found'
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
      const msg = err instanceof Error ? err.message : 'Not found'
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
    await deleteBackup(app.minio, name)
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
      return { data: info }
    } catch (err) {
      if (err instanceof Error && err.message === 'TRUNCATED') {
        throw new AppError('BACKUP_TOO_LARGE', 'Файл превышает лимит загрузки', 413)
      }
      const msg = err instanceof Error ? err.message : 'Upload failed'
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
    try {
      await restoreBackup(app.minio, name)
      return { data: { ok: true } }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Restore failed'
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

    const schedule = await updateBackupSchedule(app.prisma, body)
    // Если ретеншн ужесточили — подчистим лишние авто-копии сразу.
    if (body.retention !== undefined) {
      await applyRetention(app.minio, schedule.retention).catch(() => {})
    }
    return { data: schedule }
  })
}

export default adminBackupRoutes
