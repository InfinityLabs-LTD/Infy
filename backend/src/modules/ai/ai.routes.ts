import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../../middleware/authenticate.js'
import { aiAvailable } from '../../lib/aiSettings.js'
import {
  summarizeChat,
  suggestReplies,
  chatWithAssistant,
  getConversation,
  clearConversation,
  askInChat,
} from './ai.service.js'

const aiRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', authenticate)

  // GET /ai/status — включён ли ассистент
  app.get('/status', {
    schema: { tags: ['AI'], summary: 'AI availability', security: [{ bearerAuth: [] }] },
  }, async () => {
    return { data: { enabled: await aiAvailable(app.prisma) } }
  })

  // POST /ai/chats/:chatId/summary — сводка (с выбором периода)
  app.post('/chats/:chatId/summary', {
    schema: {
      tags: ['AI'],
      summary: 'Summarize chat (AI)',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          period: { type: 'string', enum: ['hour', 'day', 'week', 'month', 'year', 'all'] },
          from: { type: 'string', format: 'date-time' },
          to: { type: 'string', format: 'date-time' },
        },
      },
    },
  }, async (request) => {
    const { chatId } = request.params as { chatId: string }
    const range = z
      .object({
        period: z.enum(['hour', 'day', 'week', 'month', 'year', 'all']).optional(),
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
      })
      .parse(request.body ?? {})
    const userId = BigInt(request.user.sub)
    return { data: await summarizeChat(app.prisma, chatId, userId, range) }
  })

  // POST /ai/chats/:chatId/replies — умные варианты ответа
  app.post('/chats/:chatId/replies', {
    schema: { tags: ['AI'], summary: 'Suggest replies (AI)', security: [{ bearerAuth: [] }] },
  }, async (request) => {
    const { chatId } = request.params as { chatId: string }
    const userId = BigInt(request.user.sub)
    return { data: await suggestReplies(app.prisma, chatId, userId) }
  })

  // GET /ai/chats/:chatId/conversation — приватная история диалога с ассистентом
  app.get('/chats/:chatId/conversation', {
    schema: { tags: ['AI'], summary: 'Private AI conversation history', security: [{ bearerAuth: [] }] },
  }, async (request) => {
    const { chatId } = request.params as { chatId: string }
    const userId = BigInt(request.user.sub)
    return { data: await getConversation(app.prisma, chatId, userId) }
  })

  // POST /ai/chats/:chatId/conversation — отправить сообщение ассистенту (приватно)
  app.post('/chats/:chatId/conversation', {
    schema: {
      tags: ['AI'],
      summary: 'Send message to private AI assistant',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['message'],
        properties: { message: { type: 'string', minLength: 1, maxLength: 4000 } },
      },
    },
  }, async (request) => {
    const { chatId } = request.params as { chatId: string }
    const { message } = z.object({ message: z.string().min(1).max(4000) }).parse(request.body)
    const userId = BigInt(request.user.sub)
    return { data: await chatWithAssistant(app.prisma, app.redis, chatId, userId, message) }
  })

  // DELETE /ai/chats/:chatId/conversation — очистить приватный диалог
  app.delete('/chats/:chatId/conversation', {
    schema: { tags: ['AI'], summary: 'Clear private AI conversation', security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const { chatId } = request.params as { chatId: string }
    const userId = BigInt(request.user.sub)
    await clearConversation(app.prisma, chatId, userId)
    return reply.code(204).send()
  })

  // POST /ai/chats/:chatId/ask — публичный вопрос ИИ (ответ виден обоим в чате)
  app.post('/chats/:chatId/ask', {
    schema: {
      tags: ['AI'],
      summary: 'Ask AI in chat (visible to both participants)',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['question'],
        properties: { question: { type: 'string', minLength: 1, maxLength: 4000 } },
      },
    },
  }, async (request, reply) => {
    const { chatId } = request.params as { chatId: string }
    const { question } = z.object({ question: z.string().min(1).max(4000) }).parse(request.body)
    const userId = BigInt(request.user.sub)
    const result = await askInChat(app.prisma, app.redis, chatId, userId, question)
    // 202: вопрос принят и опубликован; ответ ИИ придёт асинхронно по сокету.
    return reply.code(202).send({ data: result })
  })
}

export default aiRoutes
