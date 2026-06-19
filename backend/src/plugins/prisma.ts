import fp from 'fastify-plugin'
import { FastifyPluginAsync } from 'fastify'
import { PrismaClient } from '@prisma/client'
import { createPrismaClient } from '../lib/prismaClient.js'

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient
  }
}

const prismaPlugin: FastifyPluginAsync = fp(async (app) => {
  const prisma = createPrismaClient({
    log: app.log.level === 'debug' ? ['query', 'info', 'warn', 'error'] : ['warn', 'error'],
  })

  await prisma.$connect()

  app.decorate('prisma', prisma)

  app.addHook('onClose', async () => {
    await prisma.$disconnect()
  })
})

export default prismaPlugin
