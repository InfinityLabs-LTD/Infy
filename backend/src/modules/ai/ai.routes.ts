import { FastifyPluginAsync } from 'fastify'
import { authenticate } from '../../middleware/authenticate.js'
import { aiEnabled, summarizeChat, suggestReplies } from './ai.service.js'

const aiRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', authenticate)

  // GET /ai/status — включена ли AI-фича на сервере
  app.get('/status', {
    schema: { tags: ['AI'], summary: 'AI availability', security: [{ bearerAuth: [] }] },
  }, async () => {
    return { data: { enabled: aiEnabled() } }
  })

  // POST /ai/chats/:chatId/summary — сводка последних сообщений
  app.post('/chats/:chatId/summary', {
    schema: { tags: ['AI'], summary: 'Summarize chat (AI)', security: [{ bearerAuth: [] }] },
  }, async (request) => {
    const { chatId } = request.params as { chatId: string }
    const userId = BigInt(request.user.sub)
    const result = await summarizeChat(app.prisma, chatId, userId)
    return { data: result }
  })

  // POST /ai/chats/:chatId/replies — умные варианты ответа
  app.post('/chats/:chatId/replies', {
    schema: { tags: ['AI'], summary: 'Suggest replies (AI)', security: [{ bearerAuth: [] }] },
  }, async (request) => {
    const { chatId } = request.params as { chatId: string }
    const userId = BigInt(request.user.sub)
    const result = await suggestReplies(app.prisma, chatId, userId)
    return { data: result }
  })
}

export default aiRoutes
