import { PrismaClient, ReminderTarget } from '@prisma/client'
import Redis from 'ioredis'
import * as Minio from 'minio'
import { createPrismaClient } from '../../lib/prismaClient.js'
import { env } from '../../lib/env.js'
import { gcOrphanMedia } from './media.gc.js'
import { publishMessage } from '../../lib/pubsub.js'
import { sendPush } from '../../lib/webpush.js'
import { getPreset } from '../calendar/calendar.presets.js'
import { formatTimeInTz } from '../../lib/timezone.js'
import { getBackupSchedule, isBackupDue, markBackupRun } from '../../lib/backupSettings.js'
import { createBackup, applyRetention } from '../../lib/backup.js'

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
  // Атомарный захват: помечаем sentAt ПЕРЕД доставкой, условие sentAt=null.
  // Если затронуто 0 строк — напоминание уже забрал другой тик/реплика, выходим.
  // Это распределённый лок без отдельной инфраструктуры: две реплики scheduler
  // не задвоят push/realtime, т.к. claim выигрывает ровно одна.
  const claim = await prisma.eventReminder.updateMany({
    where: { id: reminderId, sentAt: null },
    data: { sentAt: new Date() },
  })
  if (claim.count === 0) return

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

  // Удалено между claim и чтением — нечего доставлять.
  if (!reminder) return

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

  // sentAt уже проставлен в claim выше. Здесь только фиксируем индивидуальные
  // доставки (идемпотентно через upsert).
  if (recipients.length > 0) {
    await prisma.$transaction(
      recipients.map(uid =>
        prisma.reminderDelivery.upsert({
          where: { reminderId_userId: { reminderId: reminder.id, userId: uid } },
          update: {},
          create: { reminderId: reminder.id, userId: uid },
        }),
      ),
    )
  }

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
    // Часовой пояс + настройки уведомлений каждого получателя.
    const users = await prisma.user.findMany({
      where: { id: { in: recipients } },
      select: { id: true, timezone: true, notifyPopup: true, notifySound: true, notifyVibrate: true },
    })
    const tzByUser = new Map<string, string | null>()
    const prefsByUser = new Map(users.map(u => [u.id.toString(), u]))
    for (const u of users) tzByUser.set(u.id.toString(), u.timezone)
    // Получатели с отключёнными баннерами в рассылку не попадают.
    const allowed = recipients.filter(id => prefsByUser.get(id.toString())?.notifyPopup !== false)
    const subs = allowed.length === 0 ? [] : await prisma.pushSubscription.findMany({
      where: { userId: { in: allowed } },
    })
    const eventAt = new Date(event.eventAt)
    const results = await Promise.allSettled(
      subs.map(sub => {
        const pref = prefsByUser.get(sub.userId.toString())
        const when = event.allDay
          ? 'сегодня'
          : formatTimeInTz(eventAt, tzByUser.get(sub.userId.toString()))
        return sendPush(sub, {
          title: `📅 ${event.title}`,
          body: `${categoryName} · ${when}${event.notes ? ` — ${event.notes}` : ''}`,
          icon: event.createdBy.avatarUrl ?? '/logo.png',
          tag: `reminder:${reminder.id}`,
          url: '/',
          sound: pref?.notifySound !== false,
          vibrate: pref?.notifyVibrate !== false,
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

// Звонок, провисевший в RINGING дольше этого, считаем «зависшим» (потерян таймер
// дозвона при реконнекте/рестарте инстанса) и закрываем как пропущенный.
const STUCK_RINGING_MS = 90_000
// ACTIVE-звонок без активности дольше этого — оборванный (оба клиента пропали без
// hangup); закрываем как завершённый, освобождая участников.
const STUCK_ACTIVE_MS = 6 * 60 * 60 * 1000   // 6 часов

/**
 * Подчищает «зависшие» звонки в БД, которые остались незавершёнными из-за потери
 * in-memory таймера дозвона или обрыва обоих клиентов. Без этого участники
 * остаются BUSY (call:user в Redis истечёт по TTL, но запись в БД висит вечно).
 */
async function cleanupStuckCalls(prisma: PrismaClient): Promise<void> {
  const now = Date.now()
  const ringingCutoff = new Date(now - STUCK_RINGING_MS)
  const activeCutoff = new Date(now - STUCK_ACTIVE_MS)

  const ringing = await prisma.callSession.updateMany({
    where: { status: 'RINGING', createdAt: { lt: ringingCutoff } },
    data: { status: 'MISSED', endedAt: new Date() },
  })
  const active = await prisma.callSession.updateMany({
    where: { status: 'ACTIVE', answeredAt: { lt: activeCutoff } },
    data: { status: 'ENDED', endedAt: new Date() },
  })

  if (ringing.count > 0 || active.count > 0) {
    // Освобождаем участников осиротевших звонков.
    await prisma.callParticipant.updateMany({
      where: { leftAt: null, call: { status: { in: ['MISSED', 'ENDED', 'DECLINED', 'CANCELLED', 'FAILED'] } } },
      data: { leftAt: new Date() },
    })
    console.log(`[scheduler] cleaned stuck calls: ringing=${ringing.count} active=${active.count}`)
  }
}

/**
 * Проверяет, не пора ли по расписанию сделать авто-бэкап БД, и при необходимости
 * выполняет его + применяет ретеншн. Защита от двойного запуска — атомарный
 * claim через markBackupRun (две реплики не задвоят: lastRunAt сверяется по минуте).
 */
async function backupTick(prisma: PrismaClient, minio: Minio.Client): Promise<void> {
  const schedule = await getBackupSchedule(prisma)
  const now = new Date()
  if (!isBackupDue(schedule, now)) return

  // Claim окна: помечаем запуск ДО самого бэкапа, чтобы вторая реплика увидела
  // занятую минуту через isBackupDue и не запустилась.
  await markBackupRun(prisma, now)

  try {
    const info = await createBackup(minio, 'scheduled')
    console.log(`[scheduler] auto-backup created: ${info.name} (${info.size} bytes)`)
    const removed = await applyRetention(minio, schedule.retention)
    if (removed > 0) console.log(`[scheduler] retention removed ${removed} old backup(s)`)
  } catch (err) {
    console.error('[scheduler] auto-backup failed:', err)
  }
}

async function tick(prisma: PrismaClient, redis: Redis, minio: Minio.Client): Promise<void> {
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

  try {
    await cleanupStuckCalls(prisma)
  } catch (err) {
    console.error('[scheduler] stuck-call cleanup error:', err)
  }

  try {
    await backupTick(prisma, minio)
  } catch (err) {
    console.error('[scheduler] backup tick error:', err)
  }
}

// Раз в час подчищаем осиротевшие медиа-объекты в MinIO (H-9).
const GC_INTERVAL_MS = 60 * 60 * 1000

export async function startScheduler(redisUrl: string): Promise<void> {
  const prisma = createPrismaClient()
  await prisma.$connect()
  const redis = new Redis(redisUrl)

  const minio = new Minio.Client({
    endPoint: env.MINIO_ENDPOINT,
    port: env.MINIO_PORT,
    useSSL: env.MINIO_USE_SSL,
    accessKey: env.MINIO_ROOT_USER,
    secretKey: env.MINIO_ROOT_PASSWORD,
  })

  console.log('[scheduler] reminder worker started')

  let running = false
  const run = async () => {
    if (running) return            // не накладываем тики друг на друга
    running = true
    try {
      await tick(prisma, redis, minio)
    } catch (err) {
      console.error('[scheduler] tick error:', err)
    } finally {
      running = false
    }
  }

  let gcRunning = false
  const runGc = async () => {
    if (gcRunning) return
    gcRunning = true
    try {
      const removed = await gcOrphanMedia(prisma, minio)
      if (removed > 0) console.log(`[scheduler] media GC removed ${removed} orphan object(s)`)
    } catch (err) {
      console.error('[scheduler] media GC error:', err)
    } finally {
      gcRunning = false
    }
  }

  // Первый прогон сразу при старте, далее по интервалу.
  await run()
  const timer = setInterval(run, TICK_MS)
  const gcTimer = setInterval(runGc, GC_INTERVAL_MS)

  process.on('SIGTERM', async () => {
    clearInterval(timer)
    clearInterval(gcTimer)
    redis.disconnect()
    await prisma.$disconnect()
    process.exit(0)
  })
}
