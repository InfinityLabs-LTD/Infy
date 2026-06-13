import { FastifyPluginAsync } from 'fastify'
import { authenticate, requireAdmin } from '../../middleware/authenticate.js'

const ONLINE_WINDOW_MS = 2 * 60_000
const DAY_MS = 86_400_000

function startOfDay(d: Date): Date {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  return r
}

const adminStatsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', authenticate)
  app.addHook('preHandler', requireAdmin)

  // GET /admin/stats/analytics — расширенная аналитика (Analytics Hub)
  //
  // Ограничение данных: модель не хранит историю активности (User.lastSeenAt —
  // одна перезаписываемая точка). Поэтому DAU/MAU считаются по Message.createdAt
  // (уникальные отправители за день/период) — это реальный «активный
  // пользователь» с историей. Retention-когорты: неделя регистрации (createdAt)
  // × факт отправки сообщения в неделю N после регистрации.
  app.get('/analytics', {
    schema: {
      tags: ['Admin'],
      summary: 'Analytics hub (admin)',
      security: [{ bearerAuth: [] }],
    },
  }, async () => {
    const now = new Date()
    const since30 = startOfDay(new Date(now.getTime() - 29 * DAY_MS))

    // DAU за 30 дней: уникальные отправители сообщений по дням + регистрации по дням
    const [dauRows, regRows, mau30, dau1, cohortRows] = await Promise.all([
      app.prisma.$queryRaw<{ day: Date; count: number }[]>`
        SELECT date_trunc('day', "createdAt") AS day,
               CAST(COUNT(DISTINCT "senderId") AS INTEGER) AS count
        FROM messages
        WHERE "deletedAt" IS NULL AND "createdAt" >= ${since30}
        GROUP BY day ORDER BY day ASC
      `,
      app.prisma.$queryRaw<{ day: Date; count: number }[]>`
        SELECT date_trunc('day', "createdAt") AS day,
               CAST(COUNT(*) AS INTEGER) AS count
        FROM users
        WHERE "createdAt" >= ${since30}
        GROUP BY day ORDER BY day ASC
      `,
      // MAU: уникальные отправители за 30 дней
      app.prisma.$queryRaw<{ count: number }[]>`
        SELECT CAST(COUNT(DISTINCT "senderId") AS INTEGER) AS count
        FROM messages
        WHERE "deletedAt" IS NULL AND "createdAt" >= ${since30}
      `,
      // DAU сегодня: уникальные отправители за последние сутки
      app.prisma.$queryRaw<{ count: number }[]>`
        SELECT CAST(COUNT(DISTINCT "senderId") AS INTEGER) AS count
        FROM messages
        WHERE "deletedAt" IS NULL AND "createdAt" >= ${new Date(now.getTime() - DAY_MS)}
      `,
      // Retention: для каждой когорты (неделя регистрации за 6 недель) —
      // в какие недели после регистрации пользователи слали сообщения.
      app.prisma.$queryRaw<{ cohort: Date; weekoffset: number; users: number; cohortsize: number }[]>`
        WITH cohorts AS (
          SELECT id, date_trunc('week', "createdAt") AS cohort
          FROM users
          WHERE "createdAt" >= ${startOfDay(new Date(now.getTime() - 42 * DAY_MS))}
        ),
        sizes AS (
          SELECT cohort, CAST(COUNT(*) AS INTEGER) AS cohortsize
          FROM cohorts GROUP BY cohort
        ),
        activity AS (
          SELECT DISTINCT c.cohort,
                 CAST(FLOOR(EXTRACT(EPOCH FROM (date_trunc('week', m."createdAt") - c.cohort)) / 604800) AS INTEGER) AS weekoffset,
                 c.id
          FROM cohorts c
          JOIN messages m ON m."senderId" = c.id AND m."deletedAt" IS NULL
        )
        SELECT a.cohort, a.weekoffset,
               CAST(COUNT(DISTINCT a.id) AS INTEGER) AS users,
               s.cohortsize
        FROM activity a
        JOIN sizes s ON s.cohort = a.cohort
        WHERE a.weekoffset >= 0 AND a.weekoffset <= 5
        GROUP BY a.cohort, a.weekoffset, s.cohortsize
        ORDER BY a.cohort ASC, a.weekoffset ASC
      `,
    ])

    // Карта day→count для дозаполнения нулями
    const dauMap = new Map(dauRows.map(r => [r.day.toISOString().slice(0, 10), r.count]))
    const regMap = new Map(regRows.map(r => [r.day.toISOString().slice(0, 10), r.count]))
    const byDay30: { date: string; dau: number; registrations: number }[] = []
    for (let i = 29; i >= 0; i--) {
      const key = startOfDay(new Date(now.getTime() - i * DAY_MS)).toISOString().slice(0, 10)
      byDay30.push({ date: key, dau: dauMap.get(key) ?? 0, registrations: regMap.get(key) ?? 0 })
    }

    // Сборка retention-когорт: cohort → [{ weekOffset, rate } ...]
    const cohortMap = new Map<string, { size: number; weeks: Map<number, number> }>()
    for (const r of cohortRows) {
      const key = r.cohort.toISOString().slice(0, 10)
      if (!cohortMap.has(key)) cohortMap.set(key, { size: r.cohortsize, weeks: new Map() })
      cohortMap.get(key)!.weeks.set(r.weekoffset, r.users)
    }
    const cohorts = [...cohortMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, data]) => ({
        week,
        size: data.size,
        retention: Array.from({ length: 6 }, (_, w) => {
          const active = data.weeks.get(w) ?? 0
          return data.size > 0 ? Math.round((active / data.size) * 100) : 0
        }),
      }))

    return {
      data: {
        dauToday: dau1[0]?.count ?? 0,
        mau30: mau30[0]?.count ?? 0,
        byDay: byDay30,
        cohorts,
      },
    }
  })

  // GET /admin/stats — агрегаты для Dashboard
  app.get('/', {
    schema: {
      tags: ['Admin'],
      summary: 'Dashboard stats (admin)',
      security: [{ bearerAuth: [] }],
    },
  }, async () => {
    const now = new Date()
    const onlineSince = new Date(now.getTime() - ONLINE_WINDOW_MS)
    const dayAgo = new Date(now.getTime() - DAY_MS)
    const weekAgo = new Date(now.getTime() - 7 * DAY_MS)

    // Границы последних 7 календарных дней (включая сегодня)
    const days: { from: Date; to: Date }[] = []
    for (let i = 6; i >= 0; i--) {
      const from = startOfDay(new Date(now.getTime() - i * DAY_MS))
      days.push({ from, to: new Date(from.getTime() + DAY_MS) })
    }

    const [
      totalUsers, onlineNow, newUsers7d,
      totalMessages, messages24h,
      totalChats, activeSessions,
      messagesByDay, usersByDay,
    ] = await Promise.all([
      app.prisma.user.count(),
      app.prisma.user.count({ where: { lastSeenAt: { gte: onlineSince } } }),
      app.prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
      app.prisma.message.count({ where: { deletedAt: null } }),
      app.prisma.message.count({ where: { deletedAt: null, createdAt: { gte: dayAgo } } }),
      app.prisma.chat.count(),
      app.prisma.deviceSession.count({ where: { revokedAt: null } }),
      Promise.all(days.map(d =>
        app.prisma.message.count({ where: { deletedAt: null, createdAt: { gte: d.from, lt: d.to } } }),
      )),
      Promise.all(days.map(d =>
        app.prisma.user.count({ where: { createdAt: { gte: d.from, lt: d.to } } }),
      )),
    ])

    return {
      data: {
        totalUsers,
        onlineNow,
        newUsers7d,
        totalMessages,
        messages24h,
        totalChats,
        activeSessions,
        byDay: days.map((d, i) => ({
          date: d.from.toISOString().slice(0, 10),
          messages: messagesByDay[i],
          users: usersByDay[i],
        })),
      },
    }
  })
}

export default adminStatsRoutes
