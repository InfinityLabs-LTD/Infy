import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../../middleware/authenticate.js'
import * as ChatService from './chat.service.js'
import { publishMessage } from '../../lib/pubsub.js'

const chatRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', authenticate)

  // GET /chats — list user's chats
  app.get('/', {
    schema: {
      tags: ['Chat'],
      summary: 'List chats',
      security: [{ bearerAuth: [] }],
    },
  }, async (request) => {
    const userId = BigInt(request.user.sub)
    const chats = await ChatService.listChats(app.prisma, userId)
    return { data: chats }
  })

  // GET /chats/search?q= — search messages across the user's chats
  app.get('/search', {
    schema: {
      tags: ['Chat'],
      summary: 'Search messages in user chats',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        required: ['q'],
        properties: { q: { type: 'string', minLength: 2 } },
      },
    },
  }, async (request) => {
    const { q } = z.object({ q: z.string().min(2) }).parse(request.query)
    const userId = BigInt(request.user.sub)
    const results = await ChatService.searchMessages(app.prisma, userId, q)
    return { data: results }
  })

  // POST /chats — create or get direct chat with a user
  app.post('/', {
    schema: {
      tags: ['Chat'],
      summary: 'Create or get direct chat',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['partnerId'],
        properties: {
          partnerId: { type: 'string', description: 'User id of the chat partner' },
        },
      },
    },
  }, async (request, reply) => {
    const { partnerId } = z.object({ partnerId: z.string() }).parse(request.body)
    const userId = BigInt(request.user.sub)
    const chat = await ChatService.getOrCreateDirectChat(app.prisma, userId, BigInt(partnerId))
    return reply.code(201).send({ data: ChatService.serializeChat(chat as Parameters<typeof ChatService.serializeChat>[0], userId) })
  })

  // GET /chats/partner/:partnerId — get or create direct chat (CDN-safe, no POST required)
  app.get('/partner/:partnerId', {
    schema: {
      tags: ['Chat'],
      summary: 'Get or create direct chat by partner user ID',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['partnerId'],
        properties: { partnerId: { type: 'string' } },
      },
    },
  }, async (request) => {
    const { partnerId } = request.params as { partnerId: string }
    const userId = BigInt(request.user.sub)
    const chat = await ChatService.getOrCreateDirectChat(app.prisma, userId, BigInt(partnerId))
    return { data: ChatService.serializeChat(chat as Parameters<typeof ChatService.serializeChat>[0], userId) }
  })

  // GET /chats/:id/info — single chat in list format (partner, lastMessage, unread)
  app.get('/:id/info', {
    schema: {
      tags: ['Chat'],
      summary: 'Get a single chat (list-format) by id',
      security: [{ bearerAuth: [] }],
      params: { type: 'object', properties: { id: { type: 'string' } } },
    },
  }, async (request) => {
    const { id } = request.params as { id: string }
    const userId = BigInt(request.user.sub)
    const chat = await ChatService.getChat(app.prisma, id, userId)
    return { data: chat }
  })

  // GET /chats/:id/media — paginated media messages (non-TEXT)
  app.get('/:id/media', {
    schema: {
      tags: ['Chat'],
      summary: 'Get media messages for a chat (images, videos, audio)',
      security: [{ bearerAuth: [] }],
      params: { type: 'object', properties: { id: { type: 'string' } } },
      querystring: {
        type: 'object',
        properties: {
          cursor: { type: 'string' },
          limit: { type: 'integer', minimum: 1, maximum: 50, default: 30 },
        },
      },
    },
  }, async (request) => {
    const { id } = request.params as { id: string }
    const { cursor, limit } = request.query as { cursor?: string; limit?: number }
    const userId = BigInt(request.user.sub)
    const result = await ChatService.getChatMedia(app.prisma, id, userId, cursor, limit ?? 30)
    return { data: result }
  })

  // GET /chats/:id/messages — paginated history
  app.get('/:id/messages', {
    schema: {
      tags: ['Chat'],
      summary: 'Get message history (cursor-based)',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: { id: { type: 'string' } },
      },
      querystring: {
        type: 'object',
        properties: {
          cursor: { type: 'string' },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
        },
      },
    },
  }, async (request) => {
    const { id } = request.params as { id: string }
    const { cursor, limit } = (request.query as { cursor?: string; limit?: number })
    const userId = BigInt(request.user.sub)
    const result = await ChatService.getMessages(app.prisma, id, userId, cursor, limit ?? 50)
    return { data: result }
  })

  // GET /chats/:id/messages/after — forward-sync (messages strictly newer than `after`)
  // Для залечивания разрыва после оффлайна/реконнекта.
  app.get('/:id/messages/after', {
    schema: {
      tags: ['Chat'],
      summary: 'Get messages newer than a given id (forward sync)',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: { id: { type: 'string' } },
      },
      querystring: {
        type: 'object',
        required: ['after'],
        properties: {
          after: { type: 'string' },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
        },
      },
    },
  }, async (request) => {
    const { id } = request.params as { id: string }
    const { after, limit } = request.query as { after: string; limit?: number }
    const userId = BigInt(request.user.sub)
    const result = await ChatService.getMessagesAfter(app.prisma, id, userId, after, limit ?? 50)
    return { data: result }
  })

  // POST /chats/:id/messages — send message via REST (also publishes to Redis)
  app.post('/:id/messages', {
    schema: {
      tags: ['Chat'],
      summary: 'Send a message (text or media)',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: { id: { type: 'string' } },
      },
      body: {
        type: 'object',
        properties: {
          content: { type: 'string', minLength: 1, maxLength: 4000 },
          type: { type: 'string', enum: ['TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'CIRCLE_VIDEO', 'FILE', 'ALBUM'] },
          replyToId: { type: 'string' },
          clientMessageId: { type: 'string', maxLength: 64 },
          attachment: {
            type: 'object',
            properties: {
              storageKey:   { type: 'string' },
              fileName:     { type: 'string' },
              thumbnailKey: { type: 'string' },
              mimeType:     { type: 'string' },
              sizeBytes:    { type: 'number' },
              width:        { type: 'number' },
              height:       { type: 'number' },
              durationMs:   { type: 'number' },
              waveform:     { type: 'array', items: { type: 'number' } },
            },
          },
          attachments: {
            type: 'array',
            maxItems: 10,
            items: {
              type: 'object',
              properties: {
                storageKey:   { type: 'string' },
                fileName:     { type: 'string' },
                thumbnailKey: { type: 'string' },
                mimeType:     { type: 'string' },
                sizeBytes:    { type: 'number' },
                width:        { type: 'number' },
                height:       { type: 'number' },
                durationMs:   { type: 'number' },
                waveform:     { type: 'array', items: { type: 'number' } },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const attachmentSchema = z.object({
      storageKey:   z.string(),
      fileName:     z.string().optional(),
      thumbnailKey: z.string().optional(),
      mimeType:     z.string(),
      sizeBytes:    z.number(),
      width:        z.number().optional(),
      height:       z.number().optional(),
      durationMs:   z.number().optional(),
      waveform:     z.array(z.number()).optional(),
    })
    const input = z.object({
      content: z.string().min(1).max(4000).optional(),
      type: z.enum(['TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'CIRCLE_VIDEO', 'FILE', 'ALBUM']).optional(),
      replyToId: z.string().optional(),
      clientMessageId: z.string().max(64).optional(),
      attachment: attachmentSchema.optional(),
      attachments: z.array(attachmentSchema).max(10).optional(),
    }).parse(request.body)

    const userId = BigInt(request.user.sub)
    const message = await ChatService.sendMessage(app.prisma, id, userId, input)

    // Publish to Redis so realtime service can push to WS clients
    await publishMessage(app.redis, 'chat:message', { event: 'message_new', data: message })

    return reply.code(201).send({ data: message })
  })

  // PATCH /messages/:id — edit message
  app.patch('/messages/:id', {
    schema: {
      tags: ['Chat'],
      summary: 'Edit a message',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: { id: { type: 'string' } },
      },
      body: {
        type: 'object',
        required: ['content'],
        properties: { content: { type: 'string', minLength: 1, maxLength: 4000 } },
      },
    },
  }, async (request) => {
    const { id } = request.params as { id: string }
    const { content } = z.object({ content: z.string().min(1).max(4000) }).parse(request.body)
    const userId = BigInt(request.user.sub)
    const message = await ChatService.editMessage(app.prisma, id, userId, content)
    await publishMessage(app.redis, 'chat:message', { event: 'message_edited', data: message })
    return { data: message }
  })

  // POST /messages/:id/react — toggle emoji reaction
  app.post('/messages/:id/react', {
    schema: {
      tags: ['Chat'],
      summary: 'Toggle emoji reaction on a message',
      security: [{ bearerAuth: [] }],
      params: { type: 'object', properties: { id: { type: 'string' } } },
      body: {
        type: 'object',
        required: ['emoji'],
        properties: { emoji: { type: 'string', maxLength: 8 } },
      },
    },
  }, async (request) => {
    const { id } = request.params as { id: string }
    const { emoji } = request.body as { emoji: string }
    const userId = BigInt(request.user.sub)
    const message = await ChatService.toggleReaction(app.prisma, id, userId, emoji)
    await publishMessage(app.redis, 'chat:message', { event: 'message_updated', data: message })
    return { data: message }
  })

  // POST /messages/:id/transcribe — распознать речь в голосовом/кружке
  app.post('/messages/:id/transcribe', {
    schema: {
      tags: ['Chat'],
      summary: 'Transcribe a voice message or video circle to text',
      security: [{ bearerAuth: [] }],
      params: { type: 'object', properties: { id: { type: 'string' } } },
    },
  }, async (request) => {
    const { id } = request.params as { id: string }
    const userId = BigInt(request.user.sub)
    const message = await ChatService.transcribeMessageAudio(app.prisma, app.minio, id, userId)
    // Транскрипт виден обоим участникам — рассылаем обновление.
    await publishMessage(app.redis, 'chat:message', { event: 'message_updated', data: message })
    return { data: message }
  })

  // POST /messages/:id/listen — отметить голосовое / кружок прослушанным
  app.post('/messages/:id/listen', {
    schema: {
      tags: ['Chat'],
      summary: 'Mark a voice message or circle video as listened',
      security: [{ bearerAuth: [] }],
      params: { type: 'object', properties: { id: { type: 'string' } } },
    },
  }, async (request) => {
    const { id } = request.params as { id: string }
    const userId = BigInt(request.user.sub)
    const result = await ChatService.markVoiceListened(app.prisma, id, userId)
    // Уведомляем отправителя (второго участника) через Redis → realtime
    await publishMessage(app.redis, 'chat:voice', { event: 'voice_listened', data: result })
    return { data: result }
  })

  // POST /messages/:id/pin — toggle pin (one pinned message per chat)
  app.post('/messages/:id/pin', {
    schema: {
      tags: ['Chat'],
      summary: 'Toggle pin on a message',
      security: [{ bearerAuth: [] }],
      params: { type: 'object', properties: { id: { type: 'string' } } },
    },
  }, async (request) => {
    const { id } = request.params as { id: string }
    const userId = BigInt(request.user.sub)
    const { message, systemMessage } = await ChatService.togglePin(app.prisma, id, userId)
    // Обновлённое состояние закрепления + системное уведомление обоим участникам
    await publishMessage(app.redis, 'chat:message', { event: 'message_updated', data: message })
    await publishMessage(app.redis, 'chat:message', { event: 'message_new', data: systemMessage })
    return { data: message }
  })

  // GET /chats/:id/pinned — current pinned message of a chat
  app.get('/:id/pinned', {
    schema: {
      tags: ['Chat'],
      summary: 'Get the pinned message of a chat',
      security: [{ bearerAuth: [] }],
      params: { type: 'object', properties: { id: { type: 'string' } } },
    },
  }, async (request) => {
    const { id } = request.params as { id: string }
    const userId = BigInt(request.user.sub)
    const message = await ChatService.getPinnedMessage(app.prisma, id, userId)
    return { data: message }
  })

  // DELETE /chats/:id — удалить чат для обоих участников
  app.delete('/:id', {
    schema: {
      tags: ['Chat'],
      summary: 'Delete a chat for both participants',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: { id: { type: 'string' } },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const userId = BigInt(request.user.sub)
    const result = await ChatService.deleteChat(app.prisma, id, userId)
    // Уведомляем обоих участников, чтобы чат исчез у них в реальном времени.
    await publishMessage(app.redis, 'chat:message', {
      event: 'chat_deleted',
      data: { chatId: result.id, memberIds: result.memberIds },
    })
    return reply.code(204).send()
  })

  // DELETE /messages/:id — soft delete
  app.delete('/messages/:id', {
    schema: {
      tags: ['Chat'],
      summary: 'Delete a message',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: { id: { type: 'string' } },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const userId = BigInt(request.user.sub)
    const result = await ChatService.deleteMessage(app.prisma, id, userId)
    await publishMessage(app.redis, 'chat:message', { event: 'message_deleted', data: result })
    return reply.code(204).send()
  })
}

export default chatRoutes
