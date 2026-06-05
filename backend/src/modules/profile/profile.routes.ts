import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import path from 'path'
import { authenticate } from '../../middleware/authenticate.js'
import { Errors } from '../../lib/errors.js'
import { serializeUser } from '../auth/auth.service.js'
import { usernameSchema } from '../auth/auth.schema.js'
import { env } from '../../lib/env.js'

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
const MAX_AVATAR_BYTES = 5 * 1024 * 1024 // 5 MB

const updateProfileSchema = z.object({
  nickname: z.string().min(1).max(64).trim().optional(),
  username: usernameSchema.optional(),
  birthdate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
})

const profileRoutes: FastifyPluginAsync = async (app) => {
  // GET /profile/me
  app.get('/me', {
    preHandler: [authenticate],
    schema: {
      tags: ['Profile'],
      summary: 'Get own profile',
      security: [{ bearerAuth: [] }],
    },
  }, async (request) => {
    const userId = BigInt(request.user.sub)
    const user = await app.prisma.user.findUniqueOrThrow({ where: { id: userId } })
    return { data: serializeUser(user) }
  })

  // PATCH /profile/me
  app.patch('/me', {
    preHandler: [authenticate],
    schema: {
      tags: ['Profile'],
      summary: 'Update own profile',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          nickname: { type: 'string', minLength: 1, maxLength: 64 },
          username: { type: 'string', minLength: 3, maxLength: 32 },
          birthdate: { type: 'string', nullable: true },
        },
      },
    },
  }, async (request) => {
    const userId = BigInt(request.user.sub)
    const input = updateProfileSchema.parse(request.body)

    if (input.username) {
      const existing = await app.prisma.user.findFirst({
        where: { username: input.username, id: { not: userId } },
      })
      if (existing) throw Errors.USERNAME_TAKEN()
    }

    const user = await app.prisma.user.update({
      where: { id: userId },
      data: {
        ...(input.nickname !== undefined && { nickname: input.nickname }),
        ...(input.username !== undefined && { username: input.username }),
        ...(input.birthdate !== undefined && {
          birthdate: input.birthdate ? new Date(input.birthdate) : null,
        }),
      },
    })

    return { data: serializeUser(user) }
  })

  // POST /profile/me/avatar — multipart upload
  app.post('/me/avatar', {
    preHandler: [authenticate],
    schema: {
      tags: ['Profile'],
      summary: 'Upload avatar image',
      security: [{ bearerAuth: [] }],
      consumes: ['multipart/form-data'],
    },
  }, async (request, reply) => {
    const userId = BigInt(request.user.sub)

    const data = await request.file()
    if (!data) return reply.code(400).send({ error: { code: 'NO_FILE', message: 'No file uploaded' } })

    if (!ALLOWED_MIME.has(data.mimetype)) throw Errors.AVATAR_INVALID_TYPE()

    const chunks: Buffer[] = []
    let size = 0
    for await (const chunk of data.file) {
      size += chunk.length
      if (size > MAX_AVATAR_BYTES) throw Errors.AVATAR_TOO_LARGE()
      chunks.push(chunk)
    }

    const buffer = Buffer.concat(chunks)
    const ext = path.extname(data.filename) || `.${data.mimetype.split('/')[1]}`
    const objectKey = `${userId.toString()}/${Date.now()}${ext}`

    await app.minio.putObject(env.MINIO_BUCKET_AVATARS, objectKey, buffer, buffer.length, {
      'Content-Type': data.mimetype,
    })

    const avatarUrl = `${env.MINIO_PUBLIC_URL}/${env.MINIO_BUCKET_AVATARS}/${objectKey}`

    const user = await app.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl },
    })

    return { data: { avatarUrl: user.avatarUrl } }
  })

  // GET /users/:username — public profile
  app.get('/:username', {
    preHandler: [authenticate],
    schema: {
      tags: ['Profile'],
      summary: 'Get public profile by username',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: { username: { type: 'string' } },
      },
    },
  }, async (request) => {
    const { username } = request.params as { username: string }
    const user = await app.prisma.user.findUnique({ where: { username } })
    if (!user) throw Errors.USER_NOT_FOUND()

    return {
      data: {
        id: user.id.toString(),
        username: user.username,
        nickname: user.nickname,
        avatarUrl: user.avatarUrl,
        lastSeenAt: user.lastSeenAt,
      },
    }
  })
}

export default profileRoutes
