import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import multipart from '@fastify/multipart'
import rateLimit from '@fastify/rate-limit'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import http from 'http'

import { env } from './lib/env.js'
import { AppError, isFastifyError } from './lib/errors.js'

import prismaPlugin from './plugins/prisma.js'
import redisPlugin from './plugins/redis.js'
import minioPlugin from './plugins/minio.js'

import authRoutes from './modules/auth/auth.routes.js'
import sessionsRoutes from './modules/sessions/sessions.routes.js'
import profileRoutes from './modules/profile/profile.routes.js'
import chatRoutes from './modules/chat/chat.routes.js'
import calendarRoutes from './modules/calendar/calendar.routes.js'
import mediaRoutes from './modules/media/media.routes.js'
import adminUsersRoutes from './modules/admin/admin.users.routes.js'
import adminContainersRoutes from './modules/admin/admin.containers.routes.js'
import adminStatsRoutes from './modules/admin/admin.stats.routes.js'
import adminModerationRoutes from './modules/admin/admin.moderation.routes.js'
import aiRoutes from './modules/ai/ai.routes.js'
import pushRoutes from './modules/push/push.routes.js'
import { createSocketServer } from './modules/realtime/socket.server.js'

async function buildCoreServer() {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      ...(env.NODE_ENV === 'development' && {
        transport: { target: 'pino-pretty', options: { colorize: true } },
      }),
    },
    trustProxy: env.TRUSTED_PROXY,
  })

  await app.register(cors, {
    origin: env.CORS_ORIGINS.split(',').map(s => s.trim()),
    credentials: true,
  })

  await app.register(helmet, { contentSecurityPolicy: false })

  await app.register(multipart, {
    limits: { fileSize: 200 * 1024 * 1024 },  // media service enforces per-type limits
  })

  await app.register(swagger, {
    openapi: {
      info: { title: 'Infy API', version: '1.0.0', description: 'Infy Messenger API' },
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
      tags: [
        { name: 'Auth', description: 'Authentication' },
        { name: 'Sessions', description: 'Device session management' },
        { name: 'Profile', description: 'User profiles' },
        { name: 'Chat', description: 'Chats and messages' },
        { name: 'Calendar', description: 'Shared chat calendar and reminders' },
        { name: 'Media', description: 'File upload and serving' },
        { name: 'Admin', description: 'Admin panel (role=ADMIN only)' },
      ],
    },
  })

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list', deepLinking: true },
  })

  await app.register(prismaPlugin)
  await app.register(redisPlugin)
  await app.register(minioPlugin)

  await app.register(rateLimit, {
    global: true,
    max: env.RATE_LIMIT_GLOBAL_MAX,
    timeWindow: env.RATE_LIMIT_GLOBAL_WINDOW_MS,
    redis: app.redis,
    keyGenerator: (request) => request.ip,
    errorResponseBuilder: () => ({
      error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests, please try again later' },
    }),
  })

  app.setErrorHandler((err, _request, reply) => {
    if (err instanceof AppError) {
      return reply.code(err.statusCode).send({ error: { code: err.code, message: err.message } })
    }
    if (err.validation) {
      return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: err.message } })
    }
    if (isFastifyError(err) && err.statusCode === 429) {
      return reply.code(429).send({ error: { code: 'RATE_LIMIT_EXCEEDED', message: err.message } })
    }
    app.log.error(err)
    return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } })
  })

  app.get('/health', { schema: { tags: ['Health'] } }, async () => ({
    status: 'ok',
    role: env.SERVICE_ROLE,
    uptime: process.uptime(),
  }))

  await app.register(authRoutes, { prefix: '/auth' })
  await app.register(sessionsRoutes, { prefix: '/sessions' })
  await app.register(profileRoutes, { prefix: '/profile' })
  await app.register(chatRoutes, { prefix: '/chats' })
  await app.register(calendarRoutes, { prefix: '/calendar' })
  await app.register(mediaRoutes, { prefix: '/media' })
  await app.register(adminUsersRoutes, { prefix: '/admin/users' })
  await app.register(adminContainersRoutes, { prefix: '/admin/containers' })
  await app.register(adminStatsRoutes, { prefix: '/admin/stats' })
  await app.register(adminModerationRoutes, { prefix: '/admin/moderation' })
  await app.register(aiRoutes, { prefix: '/ai' })
  await app.register(pushRoutes, { prefix: '/push' })

  return app
}

async function startRealtime() {
  // Minimal HTTP server for Socket.IO (no REST routes)
  const { PrismaClient } = await import('@prisma/client')
  const prisma = new PrismaClient()
  await prisma.$connect()

  const httpServer = http.createServer((_req, res) => {
    if (_req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ status: 'ok', role: 'realtime', uptime: process.uptime() }))
    } else {
      res.writeHead(404)
      res.end()
    }
  })

  createSocketServer(httpServer, env.REDIS_URL, prisma)

  httpServer.listen(env.PORT, '0.0.0.0', () => {
    console.log(`[realtime] Socket.IO listening on :${env.PORT}`)
  })

  process.on('SIGTERM', async () => {
    await prisma.$disconnect()
    httpServer.close()
    process.exit(0)
  })
}

async function main() {
  if (env.SERVICE_ROLE === 'realtime') {
    await startRealtime()
    return
  }

  if (env.SERVICE_ROLE === 'scheduler') {
    const { startScheduler } = await import('./modules/scheduler/reminder.worker.js')
    await startScheduler(env.REDIS_URL)
    return
  }

  const app = await buildCoreServer()
  await app.ready()
  await app.listen({ port: env.PORT, host: '0.0.0.0' })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

export { buildCoreServer }
