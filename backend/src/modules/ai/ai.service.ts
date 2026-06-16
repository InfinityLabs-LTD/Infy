import { PrismaClient, AiRole, Prisma } from '@prisma/client'
import Redis from 'ioredis'
import { ulid } from 'ulid'
import { AppError } from '../../lib/errors.js'
import { getAiConfig, AiConfig } from '../../lib/aiSettings.js'
import { runAgent } from './ai.provider.js'
import { buildToolDefs, buildHandlers, ToolContext } from './ai.tools.js'
import { publishMessage } from '../../lib/pubsub.js'
import { listEvents } from '../calendar/calendar.service.js'

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
): Promise<{ transcript: string; count: number; myNickname: string }> {
  const rows = await prisma.message.findMany({
    where: { chatId, deletedAt: null, type: { not: 'SYSTEM' } },
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
function nowContext(): string {
  const now = new Date()
  return `Текущие дата и время: ${now.toLocaleString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })} (ISO: ${now.toISOString()}).`
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
      const when = new Date(full.eventAt).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
      const sysMsg = await prisma.message.create({
        data: {
          id: ulid(),
          chatId: created.chatId,
          senderId: ctx.userId,
          type: 'SYSTEM',
          content: `🤖 Infy AI запланировал: «${full.title}» — ${when}. Напоминание придёт обоим.`,
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

const PRIVATE_SYSTEM = (myNickname: string, transcript: string) =>
  `Ты — Infy AI, умный помощник внутри мессенджера Infy. Ты помогаешь пользователю «${myNickname}» в контексте его личного чата с собеседником. ` +
  `Отвечай на русском, дружелюбно и по делу. ${nowContext()}\n\n` +
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

  const ctx: ToolContext = { prisma, chatId, userId, createdEvents: [] }
  const result = await runAgent({
    config,
    system: PRIVATE_SYSTEM(myNickname, transcript),
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

const ASK_SYSTEM = (transcript: string) =>
  `Ты — Infy AI, помощник в общем чате мессенджера Infy. Двое участников вызвали тебя командой /ask, и оба видят твой ответ. ` +
  `Отвечай на русском, кратко и нейтрально. ${nowContext()}\n\n` +
  `Твои возможности:\n` +
  `• Отвечать на вопросы по переписке (инструмент search_chat).\n` +
  `• Искать факты в интернете (веб-поиск).\n` +
  `• Создавать общие напоминания для обоих (инструмент create_reminder, forBoth=true).\n` +
  `• Помогать разрешить спор: если участники не могут договориться или спорят, рассуди по-честному, ` +
  `опираясь на факты и аргументы из переписки, предложи компромисс. Будь беспристрастен.\n\n` +
  `Недавняя переписка:\n${transcript || '(пусто)'}`

export interface AskResult {
  reply: string
  toolsUsed: string[]
  usedWebSearch: boolean
}

// Обрабатывает /ask: прогоняет агента и публикует ответ как системное сообщение
// в чат (видно обоим). Возвращает текст для отправителя.
export async function askInChat(
  prisma: PrismaClient,
  redis: Redis,
  chatId: string,
  userId: bigint,
  question: string,
): Promise<AskResult> {
  await assertMember(prisma, chatId, userId)
  const config = await requireConfig(prisma)

  const { transcript, myNickname } = await buildTranscript(prisma, chatId, userId, 50)

  const ctx: ToolContext = { prisma, chatId, userId, createdEvents: [] }
  const result = await runAgent({
    config,
    system: ASK_SYSTEM(transcript),
    messages: [{ role: 'user', content: question.trim() }],
    tools: buildToolDefs(),
    handlers: buildHandlers(ctx),
    webSearch: config.webSearch,
  })

  // Публикуем ответ ИИ как системное сообщение в чат (видно обоим участникам).
  const reply = result.text || 'Не удалось сформировать ответ.'
  const aiMsg = await prisma.message.create({
    data: {
      id: ulid(),
      chatId,
      senderId: userId,
      type: 'SYSTEM',
      content: `🤖 Infy AI (по запросу ${myNickname}):\n${reply}`,
    },
    include: {
      sender: true,
      attachments: true,
      reactions: { include: { user: true } },
      replyTo: { include: { sender: true } },
    },
  })
  const { serializeMessage } = await import('../chat/chat.service.js')
  await publishMessage(redis, 'chat:message', { event: 'message_new', data: serializeMessage(aiMsg) })

  // Если в ходе /ask создались общие напоминания — публикуем события (без дубля сис.сообщения).
  for (const created of ctx.createdEvents) {
    const events = await listEvents(prisma, created.chatId, userId)
    const full = events.find(e => e.id === created.id)
    if (full) await publishMessage(redis, 'chat:calendar', { event: 'event_created', data: full })
  }

  return { reply, toolsUsed: result.toolsUsed, usedWebSearch: result.usedWebSearch }
}

// ── Лёгкие фичи без диалога: сводка и умные ответы ────────────

export async function summarizeChat(
  prisma: PrismaClient,
  chatId: string,
  userId: bigint,
): Promise<{ summary: string; messageCount: number }> {
  await assertMember(prisma, chatId, userId)
  const config = await requireConfig(prisma)
  const { transcript, count } = await buildTranscript(prisma, chatId, userId, 200)
  if (count === 0) return { summary: 'В этом чате пока нет сообщений.', messageCount: 0 }

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
  return { summary: result.text || 'Не удалось составить сводку.', messageCount: count }
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

  const result = await runAgent({
    config,
    system:
      `Ты помогаешь пользователю «${myNickname}» ответить в чате Infy. ` +
      'Предложи РОВНО 3 коротких варианта ответа на русском от его лица — естественных, разных по тону, по 1–2 предложения. ' +
      'Верни ТОЛЬКО валидный JSON-массив из 3 строк, без markdown. Пример: ["Хорошо!","Давай обсудим","Расскажи подробнее"]',
    messages: [{ role: 'user', content: `Переписка:\n\n${transcript}\n\nПредложи 3 варианта моего ответа.` }],
    tools: [],
    handlers: {},
    webSearch: false,
  })

  let replies: string[] = []
  try {
    const match = result.text.match(/\[[\s\S]*\]/)
    if (match) {
      const parsed = JSON.parse(match[0])
      if (Array.isArray(parsed)) replies = parsed.filter((x): x is string => typeof x === 'string').slice(0, 3)
    }
  } catch { /* ignore */ }
  return { replies }
}
