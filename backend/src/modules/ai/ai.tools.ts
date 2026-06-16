import { PrismaClient } from '@prisma/client'
import { ToolDef, ToolHandler } from './ai.provider.js'
import { createEvent, EventInput } from '../calendar/calendar.service.js'
import { CATEGORY_PRESETS } from '../calendar/calendar.presets.js'
import { formatInTz, parseInTz } from '../../lib/timezone.js'

// Контекст выполнения инструментов в рамках одного запроса.
export interface ToolContext {
  prisma: PrismaClient
  chatId: string
  userId: bigint
  // IANA-зона пользователя — для форматирования подтверждений в его поясе.
  timezone: string
  // ── Накопители побочных эффектов (читает сервис после прогона агента) ──
  // Созданные через ИИ события календаря — сервис их опубликует/уведомит.
  createdEvents: { id: string; chatId: string; forBoth: boolean }[]
}

// Поиск по сообщениям чата (текстовый ILIKE). Возвращает релевантные строки.
async function searchChatMessages(
  ctx: ToolContext,
  query: string,
  limit = 20,
): Promise<string> {
  const member = await ctx.prisma.chatMember.findUnique({
    where: { chatId_userId: { chatId: ctx.chatId, userId: ctx.userId } },
  })
  if (!member) return 'Нет доступа к этому чату.'

  const rows = await ctx.prisma.message.findMany({
    where: {
      chatId: ctx.chatId,
      deletedAt: null,
      type: { not: 'SYSTEM' },
      content: { contains: query, mode: 'insensitive' },
    },
    include: { sender: { select: { id: true, nickname: true } } },
    orderBy: { id: 'desc' },
    take: limit,
  })
  if (rows.length === 0) return `По запросу «${query}» в чате ничего не найдено.`
  rows.reverse()
  const lines = rows.map(m => {
    const who = m.sender.id === ctx.userId ? 'Я' : m.sender.nickname
    const when = m.createdAt.toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    return `[${when}] ${who}: ${m.content ?? ''}`
  })
  return `Найдено ${rows.length} сообщ.:\n${lines.join('\n')}`
}

// Список доступных категорий-пресетов для подсказки модели.
function presetList(): string {
  return CATEGORY_PRESETS.map(p => `${p.key} (${p.name})`).join(', ')
}

// ── Определения инструментов (нейтральная JSON-схема) ─────────

export function buildToolDefs(): ToolDef[] {
  return [
    {
      name: 'search_chat',
      description:
        'Поиск информации по переписке текущего чата. Используй, когда нужно найти, что обсуждали ' +
        '(договорённости, даты, имена, ссылки, числа). Возвращает релевантные сообщения с авторами и временем.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Слово или фраза для поиска по сообщениям' },
        },
        required: ['query'],
      },
    },
    {
      name: 'create_reminder',
      description:
        'Создать событие с напоминанием в общем календаре чата. Используй, когда пользователь просит ' +
        'запланировать, напомнить или назначить что-то. Перед созданием убедись, что знаешь название и ТОЧНУЮ дату-время (ISO 8601). ' +
        'Если данных не хватает — НЕ вызывай инструмент, а задай уточняющий вопрос в обычном ответе. ' +
        `Параметр forBoth=true делает напоминание для обоих участников чата (придёт уведомление в чат), иначе только для тебя. ` +
        `Категории-пресеты: ${presetList()}.`,
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Краткое название события' },
          eventAt: { type: 'string', description: 'Дата и время события в ISO 8601, напр. 2026-06-20T18:30:00' },
          notes: { type: 'string', description: 'Доп. заметки (необязательно)' },
          presetKey: { type: 'string', description: 'Ключ категории-пресета (необязательно)' },
          remindBeforeMin: { type: 'number', description: 'За сколько минут до события напомнить (по умолчанию 30; 0 — в момент события)' },
          forBoth: { type: 'boolean', description: 'true — напоминание для обоих участников чата; false — только для меня' },
        },
        required: ['title', 'eventAt'],
      },
    },
  ]
}

// ── Обработчики инструментов ──────────────────────────────────

export function buildHandlers(ctx: ToolContext): Record<string, ToolHandler> {
  return {
    search_chat: async (input) => {
      const query = String(input.query ?? '').trim()
      if (!query) return { result: 'Не указан поисковый запрос.' }
      return { result: await searchChatMessages(ctx, query) }
    },

    create_reminder: async (input) => {
      const title = String(input.title ?? '').trim()
      const eventAtRaw = String(input.eventAt ?? '').trim()
      if (!title || !eventAtRaw) return { result: 'Нужны название и дата-время события.' }

      // Дату от модели трактуем в поясе пользователя: «18:30» = 18:30 у него,
      // а не на сервере. parseInTz уважает уже указанный оффсет/Z, если он есть.
      const eventAt = parseInTz(eventAtRaw, ctx.timezone)
      if (!eventAt || Number.isNaN(eventAt.getTime())) {
        return { result: `Не удалось разобрать дату «${eventAtRaw}». Нужен ISO 8601.` }
      }

      const forBoth = input.forBoth === true
      const offsetMin = typeof input.remindBeforeMin === 'number'
        ? Math.max(0, Math.min(input.remindBeforeMin, 60 * 24 * 30))
        : 30
      const presetKey = typeof input.presetKey === 'string' && input.presetKey
        ? input.presetKey
        : 'plans'

      const eventInput: EventInput = {
        title,
        notes: typeof input.notes === 'string' ? input.notes : null,
        eventAt: eventAt.toISOString(),
        presetKey: CATEGORY_PRESETS.some(p => p.key === presetKey) ? presetKey : 'plans',
        reminders: [{
          offsetMin,
          target: forBoth ? 'BOTH' : 'SELF',
          notify: true,
        }],
      }

      const event = await createEvent(ctx.prisma, ctx.chatId, ctx.userId, eventInput)
      ctx.createdEvents.push({ id: event.id, chatId: ctx.chatId, forBoth })

      const when = formatInTz(eventAt, ctx.timezone)
      return {
        result: `Создано событие «${title}» на ${when}. Напоминание за ${offsetMin} мин, ` +
          `${forBoth ? 'для обоих участников' : 'только для тебя'}.`,
      }
    },
  }
}
