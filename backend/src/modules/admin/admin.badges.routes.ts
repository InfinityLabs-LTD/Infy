import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { authenticate, requireAdmin } from '../../middleware/authenticate.js'

// Каталог бейджей профиля — полностью кастомный, ведётся администратором.
// Цвет хранится как RGB-триплет "R,G,B" (его UI подставляет в rgba()).

const slugSchema = z.string().trim().min(2).max(40).regex(/^[a-z0-9_-]+$/, 'slug: a-z, 0-9, _ или -')
const colorSchema = z.string().trim().regex(/^\d{1,3},\d{1,3},\d{1,3}$/, 'color: формат "R,G,B"')

const createBadgeSchema = z.object({
  slug: slugSchema,
  label: z.string().trim().min(1).max(40),
  color: colorSchema,
  icon: z.string().trim().min(1).max(8),
  description: z.string().trim().max(200).optional().nullable(),
})

const updateBadgeSchema = createBadgeSchema.partial().omit({ slug: true })

function serializeBadge(b: {
  id: string; slug: string; label: string; color: string; icon: string
  description: string | null; createdAt: Date
}) {
  return { id: b.id, slug: b.slug, label: b.label, color: b.color, icon: b.icon, description: b.description, createdAt: b.createdAt }
}

const adminBadgesRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', authenticate)
  app.addHook('preHandler', requireAdmin)

  // GET /admin/badges — каталог всех бейджей.
  app.get('/', {
    schema: { tags: ['Admin'], summary: 'List badge catalog (admin)', security: [{ bearerAuth: [] }] },
  }, async () => {
    const badges = await app.prisma.badge.findMany({ orderBy: { createdAt: 'asc' } })
    return { data: badges.map(serializeBadge) }
  })

  // POST /admin/badges — создать новый бейдж.
  app.post('/', {
    schema: {
      tags: ['Admin'], summary: 'Create a badge (admin)', security: [{ bearerAuth: [] }],
      body: {
        type: 'object', required: ['slug', 'label', 'color', 'icon'],
        properties: {
          slug: { type: 'string' }, label: { type: 'string' },
          color: { type: 'string' }, icon: { type: 'string' },
          description: { type: 'string', nullable: true },
        },
      },
    },
  }, async (request, reply) => {
    const input = createBadgeSchema.parse(request.body)
    const exists = await app.prisma.badge.findUnique({ where: { slug: input.slug } })
    if (exists) return reply.code(409).send({ error: { code: 'BADGE_SLUG_TAKEN', message: 'Бейдж с таким slug уже существует' } })

    const badge = await app.prisma.badge.create({
      data: { slug: input.slug, label: input.label, color: input.color, icon: input.icon, description: input.description ?? null },
    })
    return reply.code(201).send({ data: serializeBadge(badge) })
  })

  // PATCH /admin/badges/:id — изменить бейдж.
  app.patch('/:id', {
    schema: {
      tags: ['Admin'], summary: 'Update a badge (admin)', security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          label: { type: 'string' }, color: { type: 'string' },
          icon: { type: 'string' }, description: { type: 'string', nullable: true },
        },
      },
    },
  }, async (request) => {
    const { id } = request.params as { id: string }
    const input = updateBadgeSchema.parse(request.body)
    const badge = await app.prisma.badge.update({
      where: { id },
      data: {
        ...(input.label !== undefined && { label: input.label }),
        ...(input.color !== undefined && { color: input.color }),
        ...(input.icon !== undefined && { icon: input.icon }),
        ...(input.description !== undefined && { description: input.description ?? null }),
      },
    })
    return { data: serializeBadge(badge) }
  })

  // DELETE /admin/badges/:id — удалить бейдж (снимется у всех — каскад).
  app.delete('/:id', {
    schema: { tags: ['Admin'], summary: 'Delete a badge (admin)', security: [{ bearerAuth: [] }] },
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    await app.prisma.badge.delete({ where: { id } })
    return reply.code(204).send()
  })
}

export default adminBadgesRoutes
