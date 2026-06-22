import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../../middleware/authenticate.js'
import { env } from '../../lib/env.js'

const subscribeBodySchema = z.object({
  endpoint: z.string().url(),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
})

const deviceTokenBodySchema = z.object({
  token: z.string().min(1),
  platform: z.string().min(1).max(32).optional(),
})

const pushRoutes: FastifyPluginAsync = async (app) => {
  app.get('/vapid-public-key', {
    schema: { tags: ['Push'], summary: 'Get VAPID public key' },
  }, async () => ({
    data: { publicKey: env.VAPID_PUBLIC_KEY },
  }))

  app.post('/subscribe', {
    schema: { tags: ['Push'], summary: 'Save push subscription' },
    preHandler: [authenticate],
  }, async (request, reply) => {
    const userId = BigInt(request.user.sub)
    const body = subscribeBodySchema.parse(request.body)

    await app.prisma.pushSubscription.upsert({
      where: { endpoint: body.endpoint },
      update: { p256dh: body.p256dh, auth: body.auth, userId },
      create: { userId, endpoint: body.endpoint, p256dh: body.p256dh, auth: body.auth },
    })

    return reply.code(201).send({ data: { ok: true } })
  })

  app.delete('/subscribe', {
    schema: { tags: ['Push'], summary: 'Remove push subscription' },
    preHandler: [authenticate],
  }, async (request, reply) => {
    const userId = BigInt(request.user.sub)
    const body = z.object({ endpoint: z.string() }).parse(request.body)

    await app.prisma.pushSubscription.deleteMany({
      where: { endpoint: body.endpoint, userId },
    })

    return reply.code(204).send()
  })

  // ── FCM device tokens (Android) ──────────────────────────────
  // Web остаётся на web-push (/subscribe); сюда регистрируются нативные
  // устройства с FCM registration token.
  app.post('/device-token', {
    schema: { tags: ['Push'], summary: 'Register FCM device token' },
    preHandler: [authenticate],
  }, async (request, reply) => {
    const userId = BigInt(request.user.sub)
    const body = deviceTokenBodySchema.parse(request.body)
    const platform = body.platform ?? 'android'

    await app.prisma.deviceToken.upsert({
      where: { token: body.token },
      update: { userId, platform },
      create: { userId, token: body.token, platform },
    })

    return reply.code(201).send({ data: { ok: true } })
  })

  app.delete('/device-token', {
    schema: { tags: ['Push'], summary: 'Remove FCM device token' },
    preHandler: [authenticate],
  }, async (request, reply) => {
    const userId = BigInt(request.user.sub)
    const body = z.object({ token: z.string().min(1) }).parse(request.body)

    await app.prisma.deviceToken.deleteMany({
      where: { token: body.token, userId },
    })

    return reply.code(204).send()
  })
}

export default pushRoutes
