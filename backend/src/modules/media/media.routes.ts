import { FastifyPluginAsync } from 'fastify'
import { authenticate } from '../../middleware/authenticate.js'
import { AppError } from '../../lib/errors.js'
import { uploadMedia, getPresignedUrl, detectFileType } from './media.service.js'

const MAX_UPLOAD_BYTES = 200 * 1024 * 1024 // 200 MB outer limit; service enforces per-type

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

    let result
    try {
      result = await uploadMedia(
        app.minio,
        buffer,
        data.mimetype,
        fileType,
        request.user.sub,
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed'
      throw new AppError('MEDIA_UPLOAD_FAILED', msg, 500)
    }

    return reply.code(201).send({ data: result })
  })

  // GET /media/:key — redirect to presigned MinIO URL
  // :key is base64url encoded to allow slashes
  app.get('/:encodedKey', {
    preHandler: [authenticate],
    schema: {
      tags: ['Media'],
      summary: 'Get presigned download URL for a media file',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: { encodedKey: { type: 'string' } },
      },
    },
  }, async (request, reply) => {
    const { encodedKey } = request.params as { encodedKey: string }
    const key = Buffer.from(encodedKey, 'base64url').toString('utf8')
    const url = await getPresignedUrl(app.minio, key)
    return reply.redirect(302, url)
  })
}

export default mediaRoutes
