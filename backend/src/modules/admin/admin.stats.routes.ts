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
