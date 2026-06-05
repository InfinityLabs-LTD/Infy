import { FastifyPluginAsync } from 'fastify'
import { authenticate, requireAdmin } from '../../middleware/authenticate.js'
import { listContainers, restartContainer, streamLogs } from '../../lib/docker.js'
import { AppError } from '../../lib/errors.js'

const adminContainersRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', authenticate)
  app.addHook('preHandler', requireAdmin)

  // GET /admin/containers
  app.get('/', {
    schema: {
      tags: ['Admin'],
      summary: 'List Docker containers (via socket-proxy)',
      security: [{ bearerAuth: [] }],
    },
  }, async () => {
    try {
      const containers = await listContainers()
      return { data: containers }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Docker unavailable'
      throw new AppError('DOCKER_UNAVAILABLE', msg, 503)
    }
  })

  // POST /admin/containers/:id/restart
  app.post('/:id/restart', {
    schema: {
      tags: ['Admin'],
      summary: 'Restart a container (via socket-proxy)',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: { id: { type: 'string' } },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      await restartContainer(id)
      return reply.code(204).send()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Restart failed'
      throw new AppError('DOCKER_ERROR', msg, 502)
    }
  })

  // GET /admin/containers/:id/logs — SSE stream
  app.get('/:id/logs', {
    schema: {
      tags: ['Admin'],
      summary: 'Stream container logs (SSE)',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: { id: { type: 'string' } },
      },
      querystring: {
        type: 'object',
        properties: {
          tail: { type: 'integer', minimum: 1, maximum: 5000, default: 200 },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { tail = 200 } = request.query as { tail?: number }

    reply.raw.writeHead(200, {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
      'X-Accel-Buffering': 'no',   // disable nginx buffering for SSE
    })

    // Keep-alive ping every 15s
    const keepAlive = setInterval(() => {
      reply.raw.write(': ping\n\n')
    }, 15_000)

    try {
      for await (const line of streamLogs(id, tail)) {
        if (reply.raw.destroyed) break
        reply.raw.write(`data: ${JSON.stringify(line)}\n\n`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Log stream error'
      reply.raw.write(`event: error\ndata: ${JSON.stringify(msg)}\n\n`)
    } finally {
      clearInterval(keepAlive)
      reply.raw.end()
    }
  })
}

export default adminContainersRoutes
