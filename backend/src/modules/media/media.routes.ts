import { FastifyPluginAsync } from 'fastify'
import { authenticate } from '../../middleware/authenticate.js'
import { AppError } from '../../lib/errors.js'
import { verifyAccessToken } from '../../lib/jwt.js'
import { env } from '../../lib/env.js'
import { uploadMedia, detectFileType } from './media.service.js'

const MAX_UPLOAD_BYTES = 200 * 1024 * 1024

const mediaRoutes: FastifyPluginAsync = async (app) => {
  // POST /media/upload
  app.post('/upload', {
    preHandler: [authenticate],
    schema: {
      tags: ['Media'],
      summary: 'Upload a media file',
      security: [{ bearerAuth: [] }],
      consumes: ['multipart/form-data'],
    },
  }, async (request, reply) => {
    const data = await request.file({ limits: { fileSize: MAX_UPLOAD_BYTES } })
    if (!data) {
      return reply.code(400).send({ error: { code: 'NO_FILE', message: 'No file uploaded' } })
    }

    const hint = (request.headers['x-media-type'] as string | undefined)?.toLowerCase()
    let fileType
    try {
      fileType = detectFileType(data.mimetype, hint)
    } catch (err) {
      throw new AppError('MEDIA_UNSUPPORTED_TYPE', (err as Error).message, 400)
    }

    const chunks: Buffer[] = []
    let total = 0
    for await (const chunk of data.file) {
      total += chunk.length
      if (total > MAX_UPLOAD_BYTES) {
        throw new AppError('MEDIA_TOO_LARGE', 'File exceeds maximum allowed size', 413)
      }
      chunks.push(chunk)
    }
    const buffer = Buffer.concat(chunks)

    // Клиентская длительность (мс) — запасной вариант для аудио/видео,
    // когда ffprobe не может определить её из контейнера.
    const durHeader = parseInt((request.headers['x-media-duration'] as string | undefined) ?? '', 10)
    const clientDurationMs = Number.isFinite(durHeader) && durHeader > 0 ? durHeader : undefined

    let result
    try {
      result = await uploadMedia(app.minio, buffer, data.mimetype, fileType, request.user.sub, data.filename, clientDurationMs)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed'
      throw new AppError('MEDIA_UPLOAD_FAILED', msg, 500)
    }

    return reply.code(201).send({ data: result })
  })

  // GET /avatars/* — serve avatar files without auth (bucket is public)
  app.get('/avatars/*', {
    schema: {
      tags: ['Media'],
      summary: 'Serve avatar image (public)',
    },
  }, async (request, reply) => {
    const objectKey = (request.params as { '*': string })['*']
    const bucket = env.MINIO_BUCKET_AVATARS

    let stat: any  // eslint-disable-line @typescript-eslint/no-explicit-any
    try {
      stat = await app.minio.statObject(bucket, objectKey)
    } catch {
      return reply.code(404).send({ error: { code: 'MEDIA_NOT_FOUND', message: 'File not found' } })
    }

    const contentType = (stat.metaData?.['content-type'] as string | undefined) || 'image/jpeg'
    reply.header('Content-Type', contentType)
    reply.header('Content-Length', stat.size)
    reply.header('Cache-Control', 'public, max-age=86400')

    try {
      const stream = await app.minio.getObject(bucket, objectKey)
      return reply.send(stream)
    } catch {
      return reply.code(500).send({ error: { code: 'MEDIA_ERROR', message: 'Stream error' } })
    }
  })

  // GET /media/:encodedKey — stream file with range support
  // Auth: Authorization header OR ?token query param (needed for <audio>/<video> elements)
  app.get('/:encodedKey', {
    schema: {
      tags: ['Media'],
      summary: 'Stream media file (supports Range requests)',
      params: { type: 'object', properties: { encodedKey: { type: 'string' } } },
    },
  }, async (request, reply) => {
    const token =
      (request.headers.authorization as string | undefined)?.replace('Bearer ', '') ||
      (request.query as Record<string, string>).token

    if (!token) {
      return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Token required' } })
    }
    try {
      verifyAccessToken(token)
    } catch {
      return reply.code(401).send({ error: { code: 'AUTH_TOKEN_INVALID', message: 'Invalid token' } })
    }

    const { encodedKey } = request.params as { encodedKey: string }
    const key = Buffer.from(encodedKey, 'base64url').toString('utf8')
    const bucket = key.startsWith('avatars/') ? env.MINIO_BUCKET_AVATARS : env.MINIO_BUCKET_MEDIA

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let stat: any
    try {
      stat = await app.minio.statObject(bucket, key)
    } catch {
      return reply.code(404).send({ error: { code: 'MEDIA_NOT_FOUND', message: 'File not found' } })
    }

    const contentType = (stat.metaData?.['content-type'] as string | undefined) || 'application/octet-stream'
    const fileSize: number = stat.size

    reply.header('Accept-Ranges', 'bytes')
    reply.header('Cache-Control', 'private, max-age=3600')
    reply.header('Content-Type', contentType)

    const rangeHeader = request.headers['range'] as string | undefined
    if (rangeHeader) {
      const match = /bytes=(\d+)-(\d*)/.exec(rangeHeader)
      if (match) {
        const start = parseInt(match[1], 10)
        const end = match[2] ? parseInt(match[2], 10) : fileSize - 1
        const chunkSize = end - start + 1

        reply.code(206)
        reply.header('Content-Range', `bytes ${start}-${end}/${fileSize}`)
        reply.header('Content-Length', chunkSize)

        try {
          const stream = await app.minio.getPartialObject(bucket, key, start, chunkSize)
          return reply.send(stream)
        } catch {
          return reply.code(500).send({ error: { code: 'MEDIA_ERROR', message: 'Stream error' } })
        }
      }
    }

    reply.header('Content-Length', fileSize)
    try {
      const stream = await app.minio.getObject(bucket, key)
      return reply.send(stream)
    } catch {
      return reply.code(500).send({ error: { code: 'MEDIA_ERROR', message: 'Stream error' } })
    }
  })
}

export default mediaRoutes
