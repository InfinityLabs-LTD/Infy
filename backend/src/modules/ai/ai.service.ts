import Anthropic from '@anthropic-ai/sdk'
import { PrismaClient } from '@prisma/client'
import { env } from '../../lib/env.js'
import { AppError } from '../../lib/errors.js'

// Ленивая инициализация клиента — только если задан ключ.
let client: Anthropic | null = null
function getClient(): Anthropic {
  if (!env.ANTHROPIC_API_KEY) {
    throw new AppError('AI_DISABLED', 'AI-функции не настроены на сервере', 503)
  }
  if (!client) client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
  return client
}

export function aiEnabled(): boolean {
  return !!env.ANTHROPIC_API_KEY
}

// Достаём последние сообщения чата (с проверкой членства) в текстовый транскрипт.
async function buildTranscript(
  prisma: PrismaClient,
  chatId: string,
  userId: bigint,
  limit: number,
): Promise<{ transcript: string; count: number; myNickname: string }> {
  const member = await prisma.chatMember.findUnique({
    where: { chatId_userId: { chatId, userId } },
  })
  if (!member) throw new AppError('CHAT_NOT_MEMBER', 'Вы не участник этого чата', 403)

  const rows = await prisma.message.findMany({
    where: { chatId, deletedAt: null },
    include: { sender: { select: { id: true, nickname: true } } },
    orderBy: { id: 'desc' },
    take: limit,
  })
  rows.reverse()

  const me = await prisma.user.findUnique({ where: { id: userId }, select: { nickname: true } })
  const myNickname = me?.nickname ?? 'Вы'

  const lines = rows.map(m => {
    const who = m.sender.id === userId ? myNickname : m.sender.nickname
    const text = m.content
      ? m.content
      : `[${m.type.toLowerCase()}]`
    return `${who}: ${text}`
  })

  return { transcript: lines.join('\n'), count: rows.length, myNickname }
}

// Сводка диалога: сжать последние сообщения в несколько пунктов.
export async function summarizeChat(
  prisma: PrismaClient,
  chatId: string,
  userId: bigint,
): Promise<{ summary: string; messageCount: number }> {
  const { transcript, count } = await buildTranscript(prisma, chatId, userId, 200)

  if (count === 0) {
    return { summary: 'В этом чате пока нет сообщений.', messageCount: 0 }
  }

  const response = await getClient().messages.create({
    model: env.ANTHROPIC_MODEL,
    max_tokens: 1024,
    system:
      'Ты — ассистент мессенджера Infy. Сжато перескажи переписку на русском языке в виде 3–6 коротких пунктов (маркированный список с «•»). ' +
      'Выдели договорённости, вопросы без ответа и важные детали (даты, места, числа). Без вступлений и заключений — только пункты.',
    messages: [
      { role: 'user', content: `Переписка:\n\n${transcript}` },
    ],
  })

  const summary = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('\n')
    .trim()

  return { summary: summary || 'Не удалось составить сводку.', messageCount: count }
}

// Умные ответы: 3 коротких варианта реплики от лица пользователя.
export async function suggestReplies(
  prisma: PrismaClient,
  chatId: string,
  userId: bigint,
): Promise<{ replies: string[] }> {
  const { transcript, count, myNickname } = await buildTranscript(prisma, chatId, userId, 40)

  if (count === 0) return { replies: [] }

  const response = await getClient().messages.create({
    model: env.ANTHROPIC_MODEL,
    max_tokens: 512,
    system:
      `Ты помогаешь пользователю «${myNickname}» ответить в чате мессенджера Infy. ` +
      'Предложи ровно 3 коротких варианта ответа на русском от его лица — естественных, разных по тону, по 1–2 предложения. ' +
      'Верни ТОЛЬКО валидный JSON-массив из 3 строк, без markdown и пояснений. Пример: ["Хорошо!","Давай обсудим","Не уверен, расскажи подробнее"]',
    messages: [
      { role: 'user', content: `Переписка (последние сообщения):\n\n${transcript}\n\nПредложи 3 варианта моего ответа.` },
    ],
  })

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('')
    .trim()

  // Извлекаем JSON-массив (модель может обернуть в текст)
  let replies: string[] = []
  try {
    const match = text.match(/\[[\s\S]*\]/)
    if (match) {
      const parsed = JSON.parse(match[0])
      if (Array.isArray(parsed)) {
        replies = parsed.filter((x): x is string => typeof x === 'string').slice(0, 3)
      }
    }
  } catch {
    replies = []
  }

  return { replies }
}
