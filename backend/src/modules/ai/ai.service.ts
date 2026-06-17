import { PrismaClient, AiRole, Prisma } from '@prisma/client'
import Redis from 'ioredis'
import { ulid } from 'ulid'
import { AppError } from '../../lib/errors.js'
import { getAiConfig, AiConfig } from '../../lib/aiSettings.js'
import { runAgent } from './ai.provider.js'
import { buildToolDefs, buildHandlers, ToolContext } from './ai.tools.js'
import { publishMessage } from '../../lib/pubsub.js'
import { listEvents } from '../calendar/calendar.service.js'
import { formatInTz, safeTimezone } from '../../lib/timezone.js'

// ── Доступ / контекст ─────────────────────────────────────────

async function assertMember(prisma: PrismaClient, chatId: string, userId: bigint): Promise<void> {
  const member = await prisma.chatMember.findUnique({
    where: { chatId_userId: { chatId, userId } },
  })
  if (!member) throw new AppError('CHAT_NOT_MEMBER', 'Вы не участник этого чата', 403)
}

async function requireConfig(prisma: PrismaClient): Promise<AiConfig> {
  const config = await getAiConfig(prisma)
  if (!config.enabled || !config.apiKey) {
    throw new AppError('AI_DISABLED', 'AI-функции не настроены на сервере', 503)
  }
  return config
}

// Транскрипт последних сообщений чата для контекста модели.
async function buildTranscript(
  prisma: PrismaClient,
  chatId: string,
  userId: bigint,
  limit: number,
  since?: Date | null,
  until?: Date | null,
): Promise<{ transcript: string; count: number; myNickname: string }> {
  const createdAt = since || until
    ? { ...(since ? { gte: since } : {}), ...(until ? { lte: until } : {}) }
    : undefined
  const rows = await prisma.message.findMany({
    where: {
      chatId,
      deletedAt: null,
      type: { not: 'SYSTEM' },
      ...(createdAt ? { createdAt } : {}),
    },
    include: { sender: { select: { id: true, nickname: true } } },
    orderBy: { id: 'desc' },
    take: limit,
  })
  rows.reverse()
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { nickname: true } })
  const myNickname = me?.nickname ?? 'Вы'
  const lines = rows.map(m => {
    const who = m.sender.id === userId ? myNickname : m.sender.nickname
    return `${who}: ${m.content ?? `[${m.type.toLowerCase()}]`}`
  })
  return { transcript: lines.join('\n'), count: rows.length, myNickname }
}

// Текущая дата/время для системного промпта (чтобы модель планировала корректно).
// tz — IANA-зона пользователя: «сейчас» и относительные даты («завтра 19:00»)
// трактуются в его поясе, иначе модель планировала бы по серверному времени.
function nowContext(tz: string | null | undefined): string {
  const now = new Date()
  const zone = safeTimezone(tz)
  const local = now.toLocaleString('ru-RU', {
    timeZone: zone,
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
  return `Текущие дата и время пользователя: ${local} (часовой пояс ${zone}, ISO UTC: ${now.toISOString()}). ` +
    `Все даты, которые называет пользователь, трактуй в его часовом поясе (${zone}).`
}

// Часовой пояс пользователя (для форматирования и планирования в его зоне).
async function getUserTimezone(prisma: PrismaClient, userId: bigint): Promise<string> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } })
  return safeTimezone(u?.timezone)
}

// Публикует созданные ИИ события календаря и системное упоминание в чат
// (для напоминаний «для обоих»).
async function publishCreatedEvents(
  prisma: PrismaClient,
  redis: Redis,
  ctx: ToolContext,
  actorNickname: string,
): Promise<void> {
  if (ctx.createdEvents.length === 0) return
  for (const created of ctx.createdEvents) {
    // Сериализуем событие так же, как делает calendar route.
    const events = await listEvents(prisma, created.chatId, ctx.userId)
    const full = events.find(e => e.id === created.id)
    if (full) {
      await publishMessage(redis, 'chat:calendar', { event: 'event_created', data: full })
    }
    // Для напоминаний «для обоих» — системное сообщение в чат, чтобы оба увидели.
    if (created.forBoth && full) {
      const when = formatInTz(new Date(full.eventAt), ctx.timezone)
      const sysMsg = await prisma.message.create({
        data: {
          id: ulid(),
          chatId: created.chatId,
          senderId: ctx.userId,
          type: 'SYSTEM',
          content: `🤖 Infy Pulse запланировал: «${full.title}» — ${when}. Напоминание придёт обоим.`,
        },
        include: {
          sender: true,
          attachments: true,
          reactions: { include: { user: true } },
          replyTo: { include: { sender: true } },
        },
      })
      const { serializeMessage } = await import('../chat/chat.service.js')
      await publishMessage(redis, 'chat:message', { event: 'message_new', data: serializeMessage(sysMsg) })
    }
  }
}

// ── Приватный диалог с ассистентом (вкладка «Ассистент» в чате) ──
// История видна только владельцу (userId). Поддерживает поиск по чату,
// веб-поиск, создание напоминаний, ответы по контексту.

const PRIVATE_SYSTEM = (myNickname: string, transcript: string, tz: string) =>
  `Ты — Infy Pulse, умный помощник внутри мессенджера Infy. Ты помогаешь пользователю «${myNickname}» в контексте его личного чата с собеседником. ` +
  `Отвечай на русском, дружелюбно и по делу. ${nowContext(tz)}\n\n` +
  `Твои возможности:\n` +
  `• Находить информацию по переписке (инструмент search_chat).\n` +
  `• Искать актуальную информацию в интернете (веб-поиск).\n` +
  `• Создавать напоминания и планы в календаре чата (инструмент create_reminder). Перед созданием уточняй недостающие детали (точную дату/время).\n` +
  `• Подсказывать, как лучше ответить собеседнику с учётом контекста переписки.\n` +
  `Этот диалог приватный — собеседник из чата его НЕ видит.\n\n` +
  `Недавняя переписка в чате (для контекста):\n${transcript || '(пока пусто)'}`

export interface AiChatResult {
  reply: string
  toolsUsed: string[]
  usedWebSearch: boolean
  conversationId: string
}

// Получить (или создать) приватный диалог пользователя по чату.
async function getOrCreateConversation(prisma: PrismaClient, chatId: string, userId: bigint) {
  return prisma.aiConversation.upsert({
    where: { chatId_userId: { chatId, userId } },
    update: {},
    create: { chatId, userId },
  })
}

// История приватного диалога (для отображения во фронте).
export async function getConversation(
  prisma: PrismaClient,
  chatId: string,
  userId: bigint,
): Promise<{ id: string; messages: { id: string; role: AiRole; content: string; meta: unknown; createdAt: Date }[] }> {
  await assertMember(prisma, chatId, userId)
  const convo = await prisma.aiConversation.findUnique({
    where: { chatId_userId: { chatId, userId } },
    include: { messages: { orderBy: { createdAt: 'asc' }, take: 100 } },
  })
  return {
    id: convo?.id ?? '',
    messages: (convo?.messages ?? []).map(m => ({
      id: m.id, role: m.role, content: m.content, meta: m.meta, createdAt: m.createdAt,
    })),
  }
}

// Очистить приватный диалог.
export async function clearConversation(prisma: PrismaClient, chatId: string, userId: bigint): Promise<void> {
  await assertMember(prisma, chatId, userId)
  const convo = await prisma.aiConversation.findUnique({ where: { chatId_userId: { chatId, userId } } })
  if (convo) await prisma.aiMessage.deleteMany({ where: { conversationId: convo.id } })
}

// Главный метод: пользователь пишет ассистенту в приватном диалоге.
export async function chatWithAssistant(
  prisma: PrismaClient,
  redis: Redis,
  chatId: string,
  userId: bigint,
  userMessage: string,
): Promise<AiChatResult> {
  await assertMember(prisma, chatId, userId)
  const config = await requireConfig(prisma)

  const convo = await getOrCreateConversation(prisma, chatId, userId)

  // Сохраняем сообщение пользователя.
  await prisma.aiMessage.create({
    data: { conversationId: convo.id, role: 'USER', content: userMessage.trim() },
  })

  // История диалога (последние ~20 реплик) + контекст чата.
  const history = await prisma.aiMessage.findMany({
    where: { conversationId: convo.id },
    orderBy: { createdAt: 'asc' },
    take: 40,
  })
  const { transcript, myNickname } = await buildTranscript(prisma, chatId, userId, 50)
  const tz = await getUserTimezone(prisma, userId)

  const ctx: ToolContext = { prisma, chatId, userId, timezone: tz, createdEvents: [] }
  const result = await runAgent({
    config,
    system: PRIVATE_SYSTEM(myNickname, transcript, tz),
    messages: history.map(m => ({ role: m.role === 'USER' ? 'user' as const : 'assistant' as const, content: m.content })),
    tools: buildToolDefs(),
    handlers: buildHandlers(ctx),
    webSearch: config.webSearch,
  })

  // Сохраняем ответ ассистента.
  const meta = { toolsUsed: result.toolsUsed, usedWebSearch: result.usedWebSearch } satisfies Prisma.InputJsonValue
  await prisma.aiMessage.create({
    data: { conversationId: convo.id, role: 'ASSISTANT', content: result.text || '…', meta },
  })
  await prisma.aiConversation.update({ where: { id: convo.id }, data: { updatedAt: new Date() } })

  // Побочные эффекты (созданные напоминания) — публикуем в чат.
  await publishCreatedEvents(prisma, redis, ctx, myNickname)

  return {
    reply: result.text || '…',
    toolsUsed: result.toolsUsed,
    usedWebSearch: result.usedWebSearch,
    conversationId: convo.id,
  }
}

// ── Команда /ask в чате (видна обоим участникам) ──────────────
// Ответ ИИ публикуется отдельным системным сообщением в чат.

const ASK_SYSTEM = (transcript: string, tz: string) =>
  `Ты — Infy Pulse, помощник в общем чате мессенджера Infy. Двое участников вызвали тебя командой /ask, и оба видят твой ответ. ` +
  `Отвечай на русском, кратко и нейтрально. ${nowContext(tz)}\n\n` +
  `Твои возможности:\n` +
  `• Отвечать на вопросы по переписке (инструмент search_chat).\n` +
  `• Искать факты в интернете (веб-поиск).\n` +
  `• Создавать общие напоминания для обоих (инструмент create_reminder, forBoth=true).\n` +
  `• Помогать разрешить спор: если участники не могут договориться или спорят, рассуди по-честному, ` +
  `опираясь на факты и аргументы из переписки, предложи компромисс. Будь беспристрастен.\n\n` +
  `Недавняя переписка:\n${transcript || '(пусто)'}`

export interface AskResult {
  // id опубликованного сообщения-запроса (AI_QUERY); ответ придёт асинхронно по сокету.
  queryMessageId: string
}

const MESSAGE_INCLUDE = {
  sender: true,
  attachments: true,
  reactions: { include: { user: true } },
  replyTo: { include: { sender: true } },
} as const

// Создаёт сообщение в чате и публикует его всем участникам через realtime.
async function createAndPublishMessage(
  prisma: PrismaClient,
  redis: Redis,
  chatId: string,
  senderId: bigint,
  type: 'AI_QUERY' | 'AI',
  content: string,
) {
  const msg = await prisma.message.create({
    data: { id: ulid(), chatId, senderId, type, content },
    include: MESSAGE_INCLUDE,
  })
  const { serializeMessage } = await import('../chat/chat.service.js')
  await publishMessage(redis, 'chat:message', { event: 'message_new', data: serializeMessage(msg) })
  return msg
}

// Обновляет содержимое сообщения и публикует обновление (для замены «печатает…»
// на готовый ответ ИИ — фронт ловит message_updated и заменяет тот же пузырь).
async function updateAndPublishMessage(
  prisma: PrismaClient,
  redis: Redis,
  messageId: string,
  content: string,
) {
  const msg = await prisma.message.update({
    where: { id: messageId },
    data: { content },
    include: MESSAGE_INCLUDE,
  })
  const { serializeMessage } = await import('../chat/chat.service.js')
  await publishMessage(redis, 'chat:message', { event: 'message_updated', data: serializeMessage(msg) })
  return msg
}

// Фоновая генерация ответа /ask. Запускается «fire-and-forget» из askInChat,
// поэтому ловит все ошибки сама и публикует ответ (или сообщение об ошибке)
// как сообщение типа AI — оба участника увидят его по сокету.
async function runAskGeneration(
  prisma: PrismaClient,
  redis: Redis,
  chatId: string,
  userId: bigint,
  question: string,
  placeholderId: string,
): Promise<void> {
  try {
    const config = await requireConfig(prisma)
    const { transcript } = await buildTranscript(prisma, chatId, userId, 50)
    const tz = await getUserTimezone(prisma, userId)

    const ctx: ToolContext = { prisma, chatId, userId, timezone: tz, createdEvents: [] }
    const result = await runAgent({
      config,
      system: ASK_SYSTEM(transcript, tz),
      messages: [{ role: 'user', content: question.trim() }],
      tools: buildToolDefs(),
      handlers: buildHandlers(ctx),
      webSearch: config.webSearch,
    })

    const reply = result.text || 'Не удалось сформировать ответ.'
    await updateAndPublishMessage(prisma, redis, placeholderId, reply)

    // Созданные в ходе /ask общие напоминания — публикуем события календаря.
    for (const created of ctx.createdEvents) {
      const events = await listEvents(prisma, created.chatId, userId)
      const full = events.find(e => e.id === created.id)
      if (full) await publishMessage(redis, 'chat:calendar', { event: 'event_created', data: full })
    }
  } catch (err) {
    console.error('[ai] ask generation failed:', err)
    const text = err instanceof AppError && err.code === 'AI_DISABLED'
      ? 'AI-функции сейчас недоступны.'
      : 'Не удалось получить ответ. Попробуйте позже.'
    try {
      await updateAndPublishMessage(prisma, redis, placeholderId, text)
    } catch (e2) {
      console.error('[ai] failed to publish error message:', e2)
    }
  }
}

// Обрабатывает /ask: сразу публикует вопрос пользователя (AI_QUERY, видят оба),
// запускает генерацию ответа в фоне и возвращает управление. Ответ (AI) придёт
// асинхронно по сокету — поле ввода у отправителя не блокируется.
export async function askInChat(
  prisma: PrismaClient,
  redis: Redis,
  chatId: string,
  userId: bigint,
  question: string,
): Promise<AskResult> {
  await assertMember(prisma, chatId, userId)
  // Проверяем конфиг до публикации запроса, чтобы при выключенном ИИ вернуть
  // ошибку отправителю, а не «зависший» вопрос без ответа.
  await requireConfig(prisma)

  // 1) Публикуем сам вопрос как сообщение-запрос к ИИ (видят оба участника).
  const queryMsg = await createAndPublishMessage(prisma, redis, chatId, userId, 'AI_QUERY', question.trim())

  // 2) Сразу публикуем пустой ответ-плейсхолдер (оба видят «Infy Pulse печатает…»).
  const placeholder = await createAndPublishMessage(prisma, redis, chatId, userId, 'AI', '')

  // 3) Генерация ответа — в фоне (не блокируем HTTP и поле ввода). По готовности
  //    плейсхолдер заменяется готовым текстом через message_updated.
  void runAskGeneration(prisma, redis, chatId, userId, question, placeholder.id)

  return { queryMessageId: queryMsg.id }
}

// ── Лёгкие фичи без диалога: сводка и умные ответы ────────────

// Период сводки и соответствующая граница «с какого момента» брать сообщения.
export type SummaryPeriod = 'hour' | 'day' | 'week' | 'month' | 'year' | 'all'

function periodSince(period: SummaryPeriod): Date | null {
  if (period === 'all') return null
  const now = Date.now()
  const ms: Record<Exclude<SummaryPeriod, 'all'>, number> = {
    hour: 3600_000,
    day: 86_400_000,
    week: 7 * 86_400_000,
    month: 30 * 86_400_000,
    year: 365 * 86_400_000,
  }
  return new Date(now - ms[period])
}

// Параметры периода: либо пресет, либо произвольный диапазон from/to (ISO).
export interface SummaryRange {
  period?: SummaryPeriod
  from?: string | null
  to?: string | null
}

export async function summarizeChat(
  prisma: PrismaClient,
  chatId: string,
  userId: bigint,
  range: SummaryRange = {},
): Promise<{ summary: string; messageCount: number; period: SummaryPeriod | 'custom' }> {
  await assertMember(prisma, chatId, userId)
  const config = await requireConfig(prisma)

  // Произвольный диапазон имеет приоритет над пресетом.
  const fromDate = range.from ? new Date(range.from) : null
  const toDate = range.to ? new Date(range.to) : null
  const custom = Boolean(fromDate || toDate)
  const period: SummaryPeriod = range.period ?? 'all'

  const since = custom ? fromDate : periodSince(period)
  const until = custom ? toDate : null
  const filtered = custom || period !== 'all'
  // Для коротких окон сообщений мало; для широких периодов поднимаем потолок.
  const wide = custom || period === 'year' || period === 'all'
  const limit = wide ? 500 : 300
  const { transcript, count } = await buildTranscript(prisma, chatId, userId, limit, since, until)
  const resultPeriod = custom ? 'custom' as const : period
  if (count === 0) {
    const empty = filtered ? 'За выбранный период нет сообщений.' : 'В этом чате пока нет сообщений.'
    return { summary: empty, messageCount: 0, period: resultPeriod }
  }

  const result = await runAgent({
    config,
    system:
      'Ты — ассистент мессенджера Infy. Сжато перескажи переписку на русском в виде 3–6 коротких пунктов (маркер «•»). ' +
      'Выдели договорённости, вопросы без ответа и важные детали (даты, места, числа). Только пункты, без вступлений.',
    messages: [{ role: 'user', content: `Переписка:\n\n${transcript}` }],
    tools: [],
    handlers: {},
    webSearch: false,
  })
  return { summary: result.text || 'Не удалось составить сводку.', messageCount: count, period: resultPeriod }
}

export async function suggestReplies(
  prisma: PrismaClient,
  chatId: string,
  userId: bigint,
): Promise<{ replies: string[] }> {
  await assertMember(prisma, chatId, userId)
  const config = await requireConfig(prisma)
  const { transcript, count, myNickname } = await buildTranscript(prisma, chatId, userId, 40)
  if (count === 0) return { replies: [] }

  // Подсказки нужны, только когда последнее слово за собеседником —
  // отвечаем на ЕГО реплику. Если последним писал сам пользователь, отвечать не на что.
  const last = await prisma.message.findFirst({
    where: { chatId, deletedAt: null, type: { not: 'SYSTEM' } },
    orderBy: { id: 'desc' },
    include: { sender: { select: { id: true, nickname: true } } },
  })
  if (!last || last.sender.id === userId) return { replies: [] }
  const partnerName = last.sender.nickname
  const partnerText = last.content ?? `[${last.type.toLowerCase()}]`

  const result = await runAgent({
    config,
    system:
      `Ты помогаешь пользователю «${myNickname}» ответить в личном чате Infy на последнее сообщение собеседника «${partnerName}». ` +
      'Сгенерируй варианты ответа ОТ ЛИЦА пользователя, обращённые к собеседнику (не пересказ, не комментарий со стороны). ' +
      `Опирайся на контекст всего диалога и подражай манере письма самого «${myNickname}» — его длине фраз, тону, ` +
      'эмодзи и пунктуации, как видно из его прошлых реплик в переписке. ' +
      'Предложи РОВНО 3 варианта на русском, разных по смыслу/тону (например: согласие, уточняющий вопрос, встречное предложение), по 1–2 предложения. ' +
      'Верни ТОЛЬКО валидный JSON-массив из 3 строк, без markdown. Пример: ["Хорошо, давай!","А во сколько удобнее?","Можем перенести на завтра?"]',
    messages: [{
      role: 'user',
      content:
        `Переписка (последним написал собеседник):\n\n${transcript}\n\n` +
        `Последнее сообщение собеседника «${partnerName}»: «${partnerText}»\n\n` +
        `Предложи 3 варианта моего ответа на это сообщение в моей манере.`,
    }],
    tools: [],
    handlers: {},
    webSearch: false,
  })

  return { replies: parseReplies(result.text) }
}

// Извлекает 3 варианта ответа из текста модели. Основной путь — JSON-массив;
// запасные — на случай, когда модель обернула ответ в markdown или выдала
// варианты построчно/нумерованным списком (иначе кнопка «молчит» при промахе).
function parseReplies(text: string): string[] {
  const clean = (s: string) => s.replace(/^["'\s]+|["'\s]+$/g, '').trim()

  const match = text.match(/\[[\s\S]*\]/)
  if (match) {
    try {
      const parsed = JSON.parse(match[0])
      if (Array.isArray(parsed)) {
        const arr = parsed.filter((x): x is string => typeof x === 'string').map(clean).filter(Boolean)
        if (arr.length) return arr.slice(0, 3)
      }
    } catch { /* перейдём к построчному разбору */ }
  }

  // Запасной разбор: строки, в т.ч. с маркерами списка («1.», «-», «•»).
  const lines = text
    .split('\n')
    .map(l => clean(l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '')))
    .filter(l => l.length > 0 && !/^```/.test(l))
  return lines.slice(0, 3)
}
