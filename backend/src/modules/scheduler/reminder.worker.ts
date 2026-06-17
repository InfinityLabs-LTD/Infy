import { PrismaClient, ReminderTarget } from '@prisma/client'
import Redis from 'ioredis'
import { publishMessage } from '../../lib/pubsub.js'
import { sendPush } from '../../lib/webpush.js'
import { getPreset } from '../calendar/calendar.presets.js'
import { formatTimeInTz } from '../../lib/timezone.js'

const TICK_MS = 60_000        // проверяем раз в минуту
const BATCH = 200             // максимум напоминаний за тик

/**
 * Определяет id адресатов напоминания внутри DIRECT-чата.
 * creatorId — автор события; otherId — второй участник (может отсутствовать).
 */
function resolveTargets(
  target: ReminderTarget,
  creatorId: bigint,
  otherId: bigint | null,
): bigint[] {
  switch (target) {
    case 'SELF':    return [creatorId]
    case 'PARTNER': return otherId ? [otherId] : []
    case 'BOTH':    return otherId ? [creatorId, otherId] : [creatorId]
  }
}

async function deliverOne(
  prisma: PrismaClient,
  redis: Redis,
  reminderId: string,
): Promise<void> {
  const reminder = await prisma.eventReminder.findUnique({
    where: { id: reminderId },
    include: {
      event: {
        include: {
          category: true,
          createdBy: { select: { id: true, nickname: true, avatarUrl: true } },
          chat: { include: { members: { select: { userId: true } } } },
        },
      },
    },
  })

  // Уже доставлено другим тиком или удалено — пропускаем.
  if (!reminder || reminder.sentAt) return

  const event = reminder.event
  const creatorId = event.createdBy.id
  const otherId = event.chat.members.map(m => m.userId).find(id => id !== creatorId) ?? null

  const targetIds = resolveTargets(reminder.target, creatorId, otherId)

  // Уважаем общий тумблер чата: исключаем тех, кто отключил напоминания.
  const settings = await prisma.chatCalendarSetting.findMany({
    where: { chatId: event.chatId, userId: { in: targetIds } },
  })
  const disabled = new Set(
    settings.filter(s => !s.remindersEnabled).map(s => s.userId.toString()),
  )
  const recipients = targetIds.filter(id => !disabled.has(id.toString()))

  // Помечаем как отправленное и записываем доставки атомарно,
  // даже если получателей не осталось — чтобы не выбирать снова.
  await prisma.$transaction([
    prisma.eventReminder.update({
      where: { id: reminder.id },
      data: { sentAt: new Date() },
    }),
    ...recipients.map(uid =>
      prisma.reminderDelivery.upsert({
        where: { reminderId_userId: { reminderId: reminder.id, userId: uid } },
        update: {},
        create: { reminderId: reminder.id, userId: uid },
      }),
    ),
  ])

  if (recipients.length === 0) return

  const categoryName = event.category?.name
    ?? (event.presetKey ? getPreset(event.presetKey)?.name : undefined)
    ?? 'Напоминание'

  const payload = {
    reminderId: reminder.id,
    eventId: event.id,
    chatId: event.chatId,
    title: event.title,
    notes: event.notes,
    eventAt: event.eventAt,
    allDay: event.allDay,
    offsetMin: reminder.offsetMin,
    categoryName,
    from: { id: creatorId.toString(), nickname: event.createdBy.nickname },
  }

  // Realtime-событие для онлайн-клиентов.
  await publishMessage(redis, 'calendar:reminder', {
    userIds: recipients.map(id => id.toString()),
    data: payload,
  })

  // Push для тех, у кого notify включён на этом напоминании.
  if (reminder.notify) {
    const subs = await prisma.pushSubscription.findMany({
      where: { userId: { in: recipients } },
    })
    // Время показываем каждому получателю в ЕГО часовом поясе (момент один и тот же).
    const tzByUser = new Map<string, string | null>()
    if (!event.allDay) {
      const users = await prisma.user.findMany({
        where: { id: { in: recipients } },
        select: { id: true, timezone: true },
      })
      for (const u of users) tzByUser.set(u.id.toString(), u.timezone)
    }
    const eventAt = new Date(event.eventAt)
    const results = await Promise.allSettled(
      subs.map(sub => {
        const when = event.allDay
          ? 'сегодня'
          : formatTimeInTz(eventAt, tzByUser.get(sub.userId.toString()))
        return sendPush(sub, {
          title: `📅 ${event.title}`,
          body: `${categoryName} · ${when}${event.notes ? ` — ${event.notes}` : ''}`,
          icon: event.createdBy.avatarUrl ?? '/logo.png',
          tag: `reminder:${reminder.id}`,
          url: '/',
        })
      }),
    )
    const deadEndpoints = subs
      .filter((_, i) => results[i].status === 'fulfilled' && (results[i] as PromiseFulfilledResult<boolean>).value === false)
      .map(sub => sub.endpoint)
    if (deadEndpoints.length > 0) {
      await prisma.pushSubscription.deleteMany({ where: { endpoint: { in: deadEndpoints } } })
    }
  }
}

async function tick(prisma: PrismaClient, redis: Redis): Promise<void> {
  const due = await prisma.eventReminder.findMany({
    where: { sentAt: null, fireAt: { lte: new Date() } },
    select: { id: true },
    orderBy: { fireAt: 'asc' },
    take: BATCH,
  })

  for (const { id } of due) {
    try {
      await deliverOne(prisma, redis, id)
    } catch (err) {
      console.error(`[scheduler] failed to deliver reminder ${id}:`, err)
    }
  }

  if (due.length > 0) {
    console.log(`[scheduler] processed ${due.length} reminder(s)`)
  }
}

export async function startScheduler(redisUrl: string): Promise<void> {
  const prisma = new PrismaClient()
  await prisma.$connect()
  const redis = new Redis(redisUrl)

  console.log('[scheduler] reminder worker started')

  let running = false
  const run = async () => {
    if (running) return            // не накладываем тики друг на друга
    running = true
    try {
      await tick(prisma, redis)
    } catch (err) {
      console.error('[scheduler] tick error:', err)
    } finally {
      running = false
    }
  }

  // Первый прогон сразу при старте, далее по интервалу.
  await run()
  const timer = setInterval(run, TICK_MS)

  process.on('SIGTERM', async () => {
    clearInterval(timer)
    redis.disconnect()
    await prisma.$disconnect()
    process.exit(0)
  })
}
