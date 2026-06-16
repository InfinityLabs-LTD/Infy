import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../../middleware/authenticate.js'
import { getActiveSanctions } from '../../lib/sanctions.js'
import * as ReportService from './reports.service.js'

const REPORT_CATEGORIES = [
  'SPAM', 'HARASSMENT', 'HATE', 'VIOLENCE', 'SEXUAL', 'SCAM', 'ILLEGAL', 'OTHER',
] as const

const reportsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', authenticate)

  // POST /reports — пожаловаться на пользователя
  app.post('/', {
    schema: {
      tags: ['Reports'],
      summary: 'File a report against a user',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['targetId', 'category', 'description'],
        properties: {
          targetId:     { type: 'string' },
          category:     { type: 'string', enum: REPORT_CATEGORIES as unknown as string[] },
          description:  { type: 'string', minLength: 1, maxLength: 1000 },
          chatId:       { type: 'string' },
          messageId:    { type: 'string' },
          evidenceKeys: { type: 'array', items: { type: 'string' }, maxItems: 5 },
        },
      },
    },
  }, async (request, reply) => {
    const body = z.object({
      targetId:     z.string(),
      category:     z.enum(REPORT_CATEGORIES),
      description:  z.string().min(1).max(1000),
      chatId:       z.string().optional(),
      messageId:    z.string().optional(),
      evidenceKeys: z.array(z.string()).max(5).optional(),
    }).parse(request.body)

    const reporterId = BigInt(request.user.sub)
    const report = await ReportService.createReport(app.prisma, reporterId, {
      targetId: BigInt(body.targetId),
      category: body.category,
      description: body.description,
      chatId: body.chatId,
      messageId: body.messageId,
      evidenceKeys: body.evidenceKeys,
    })

    return reply.code(201).send({ data: report })
  })

  // GET /reports/my-sanctions — активные санкции текущего пользователя
  // (чтобы клиент мог показать предупреждение/мут самому пользователю).
  app.get('/my-sanctions', {
    schema: {
      tags: ['Reports'],
      summary: 'List active sanctions on the current user',
      security: [{ bearerAuth: [] }],
    },
  }, async (request) => {
    const userId = BigInt(request.user.sub)
    const sanctions = await getActiveSanctions(app.prisma, userId)
    return { data: { sanctions } }
  })
}

export default reportsRoutes
