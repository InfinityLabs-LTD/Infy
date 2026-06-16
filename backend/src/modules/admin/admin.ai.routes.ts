import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { authenticate, requireAdmin } from '../../middleware/authenticate.js'
import { getAiSettingsPublic, updateAiSettings } from '../../lib/aiSettings.js'

const adminAiRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', authenticate)
  app.addHook('preHandler', requireAdmin)

  // GET /admin/ai/settings — текущие настройки ассистента (без сырых ключей)
  app.get('/settings', {
    schema: { tags: ['Admin'], summary: 'AI settings (admin)', security: [{ bearerAuth: [] }] },
  }, async () => {
    return { data: await getAiSettingsPublic(app.prisma) }
  })

  // PATCH /admin/ai/settings — обновить настройки (провайдер, модель, ключ, тумблеры)
  app.patch('/settings', {
    schema: { tags: ['Admin'], summary: 'Update AI settings (admin)', security: [{ bearerAuth: [] }] },
  }, async (request) => {
    const body = z.object({
      enabled: z.boolean().optional(),
      provider: z.enum(['ANTHROPIC', 'OPENAI']).optional(),
      webSearch: z.boolean().optional(),
      anthropicModel: z.string().max(100).optional(),
      anthropicKey: z.string().max(300).optional(),  // '' очищает
      anthropicBaseUrl: z.string().max(300).optional(),
      openaiModel: z.string().max(100).optional(),
      openaiKey: z.string().max(300).optional(),      // '' очищает
      openaiBaseUrl: z.string().max(300).optional(),
    }).parse(request.body)

    return { data: await updateAiSettings(app.prisma, body) }
  })
}

export default adminAiRoutes
