import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../../middleware/authenticate.js'
import { env } from '../../lib/env.js'

const subscribeBodySchema = z.object({
  endpoint: z.string().url(),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
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
    const userId = BigInt((request as unknown as { userId: string }).userId)
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
    const userId = BigInt((request as unknown as { userId: string }).userId)
    const body = z.object({ endpoint: z.string() }).parse(request.body)

    await app.prisma.pushSubscription.deleteMany({
      where: { endpoint: body.endpoint, userId },
    })

    return reply.code(204).send()
  })
}

export default pushRoutes
