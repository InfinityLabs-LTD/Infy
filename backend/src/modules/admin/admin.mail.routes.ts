import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { authenticate, requireAdmin } from '../../middleware/authenticate.js'
import { getMailSettingsPublic, updateMailSettings } from '../../lib/mailSettings.js'
import { sendTestEmail } from '../../lib/mailer.js'

const adminMailRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', authenticate)
  app.addHook('preHandler', requireAdmin)

  // GET /admin/mail/settings — текущие настройки SMTP (без пароля).
  app.get('/settings', {
    schema: { tags: ['Admin'], summary: 'Mail (SMTP) settings (admin)', security: [{ bearerAuth: [] }] },
  }, async () => {
    return { data: await getMailSettingsPublic(app.prisma) }
  })

  // PATCH /admin/mail/settings — обновить настройки SMTP.
  app.patch('/settings', {
    schema: { tags: ['Admin'], summary: 'Update mail settings (admin)', security: [{ bearerAuth: [] }] },
  }, async (request) => {
    const body = z.object({
      enabled: z.boolean().optional(),
      host: z.string().max(255).optional(),
      port: z.number().int().min(1).max(65535).optional(),
      secure: z.boolean().optional(),
      user: z.string().max(255).optional(),
      pass: z.string().max(500).optional(),   // '' очищает
      from: z.string().max(255).optional(),
      fromName: z.string().max(100).optional(),
    }).parse(request.body)

    return { data: await updateMailSettings(app.prisma, body) }
  })

  // POST /admin/mail/test — отправить тестовое письмо на указанный адрес.
  app.post('/test', {
    schema: { tags: ['Admin'], summary: 'Send a test email (admin)', security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const { to } = z.object({ to: z.string().email() }).parse(request.body)
    try {
      await sendTestEmail(app.prisma, to)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error'
      return reply.code(502).send({ error: { code: 'EMAIL_SEND_FAILED', message } })
    }
    return reply.send({ data: { ok: true } })
  })
}

export default adminMailRoutes
