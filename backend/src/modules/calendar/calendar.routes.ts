import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../../middleware/authenticate.js'
import * as CalendarService from './calendar.service.js'
import { publishMessage } from '../../lib/pubsub.js'

const reminderSchema = z.object({
  offsetMin: z.number().int().min(0).max(60 * 24 * 365),
  target: z.enum(['SELF', 'PARTNER', 'BOTH']),
  notify: z.boolean(),
})

const eventBodySchema = z.object({
  title: z.string().min(1).max(120),
  notes: z.string().max(1000).nullish(),
  eventAt: z.string().datetime({ offset: true }),
  allDay: z.boolean().optional(),
  presetKey: z.string().max(32).nullish(),
  categoryId: z.string().nullish(),
  reminders: z.array(reminderSchema).max(5).default([]),
})

const calendarRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', authenticate)

  // ── События ────────────────────────────────────────────────

  // GET /calendar/:chatId/events?from=&to=
  app.get('/:chatId/events', {
    schema: {
      tags: ['Calendar'],
      summary: 'List calendar events for a chat',
      security: [{ bearerAuth: [] }],
      params: { type: 'object', properties: { chatId: { type: 'string' } } },
      querystring: {
        type: 'object',
        properties: { from: { type: 'string' }, to: { type: 'string' } },
      },
    },
  }, async (request) => {
    const { chatId } = request.params as { chatId: string }
    const { from, to } = request.query as { from?: string; to?: string }
    const userId = BigInt(request.user.sub)
    const events = await CalendarService.listEvents(app.prisma, chatId, userId, from, to)
    return { data: events }
  })

  // POST /calendar/:chatId/events
  app.post('/:chatId/events', {
    schema: { tags: ['Calendar'], summary: 'Create calendar event', security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const { chatId } = request.params as { chatId: string }
    const input = eventBodySchema.parse(request.body)
    const userId = BigInt(request.user.sub)
    const event = await CalendarService.createEvent(app.prisma, chatId, userId, input)
    await publishMessage(app.redis, 'chat:calendar', { event: 'event_created', data: event })
    return reply.code(201).send({ data: event })
  })

  // PUT /calendar/events/:eventId
  app.put('/events/:eventId', {
    schema: { tags: ['Calendar'], summary: 'Update calendar event', security: [{ bearerAuth: [] }] },
  }, async (request) => {
    const { eventId } = request.params as { eventId: string }
    const input = eventBodySchema.parse(request.body)
    const userId = BigInt(request.user.sub)
    const event = await CalendarService.updateEvent(app.prisma, eventId, userId, input)
    await publishMessage(app.redis, 'chat:calendar', { event: 'event_updated', data: event })
    return { data: event }
  })

  // DELETE /calendar/events/:eventId
  app.delete('/events/:eventId', {
    schema: { tags: ['Calendar'], summary: 'Delete calendar event', security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const { eventId } = request.params as { eventId: string }
    const userId = BigInt(request.user.sub)
    const result = await CalendarService.deleteEvent(app.prisma, eventId, userId)
    await publishMessage(app.redis, 'chat:calendar', { event: 'event_deleted', data: result })
    return reply.code(204).send()
  })

  // ── Категории ──────────────────────────────────────────────

  // GET /calendar/:chatId/categories
  app.get('/:chatId/categories', {
    schema: { tags: ['Calendar'], summary: 'List categories (presets + custom)', security: [{ bearerAuth: [] }] },
  }, async (request) => {
    const { chatId } = request.params as { chatId: string }
    const userId = BigInt(request.user.sub)
    const data = await CalendarService.listCategories(app.prisma, chatId, userId)
    return { data }
  })

  // POST /calendar/:chatId/categories
  app.post('/:chatId/categories', {
    schema: {
      tags: ['Calendar'],
      summary: 'Create custom category',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['name', 'color'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 40 },
          color: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { chatId } = request.params as { chatId: string }
    const { name, color } = z.object({
      name: z.string().min(1).max(40),
      color: z.string().regex(/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/, 'Invalid hex color'),
    }).parse(request.body)
    const userId = BigInt(request.user.sub)
    const cat = await CalendarService.createCategory(app.prisma, chatId, userId, name, color)
    await publishMessage(app.redis, 'chat:calendar', { event: 'category_created', data: { chatId, category: cat } })
    return reply.code(201).send({ data: cat })
  })

  // DELETE /calendar/categories/:categoryId
  app.delete('/categories/:categoryId', {
    schema: { tags: ['Calendar'], summary: 'Delete custom category', security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const { categoryId } = request.params as { categoryId: string }
    const userId = BigInt(request.user.sub)
    const result = await CalendarService.deleteCategory(app.prisma, categoryId, userId)
    await publishMessage(app.redis, 'chat:calendar', { event: 'category_deleted', data: result })
    return reply.code(204).send()
  })

  // ── Настройки (общий тумблер напоминаний) ──────────────────

  // GET /calendar/:chatId/settings
  app.get('/:chatId/settings', {
    schema: { tags: ['Calendar'], summary: 'Get calendar reminder settings', security: [{ bearerAuth: [] }] },
  }, async (request) => {
    const { chatId } = request.params as { chatId: string }
    const userId = BigInt(request.user.sub)
    const data = await CalendarService.getSettings(app.prisma, chatId, userId)
    return { data }
  })

  // PATCH /calendar/:chatId/settings
  app.patch('/:chatId/settings', {
    schema: {
      tags: ['Calendar'],
      summary: 'Update calendar reminder settings',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['remindersEnabled'],
        properties: { remindersEnabled: { type: 'boolean' } },
      },
    },
  }, async (request) => {
    const { chatId } = request.params as { chatId: string }
    const { remindersEnabled } = z.object({ remindersEnabled: z.boolean() }).parse(request.body)
    const userId = BigInt(request.user.sub)
    const data = await CalendarService.updateSettings(app.prisma, chatId, userId, remindersEnabled)
    return { data }
  })
}

export default calendarRoutes
