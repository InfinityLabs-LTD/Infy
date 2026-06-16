import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { authenticate, requireAdmin } from '../../middleware/authenticate.js'
import * as ReportService from '../reports/reports.service.js'

const REPORT_STATUSES = ['PENDING', 'REVIEWING', 'RESOLVED', 'DISMISSED'] as const

const adminReportsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', authenticate)
  app.addHook('preHandler', requireAdmin)

  // GET /admin/moderation/reports?status=PENDING|REVIEWING|RESOLVED|DISMISSED|all
  app.get('/', {
    schema: {
      tags: ['Admin'],
      summary: 'List user reports (admin)',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: [...REPORT_STATUSES, 'all'], default: 'PENDING' },
        },
      },
    },
  }, async (request) => {
    const { status = 'PENDING' } = request.query as { status?: (typeof REPORT_STATUSES)[number] | 'all' }
    const result = await ReportService.listReports(app.prisma, status)
    return { data: result }
  })

  // PATCH /admin/moderation/reports/:id — изменить статус / резолюцию
  app.patch('/:id', {
    schema: {
      tags: ['Admin'],
      summary: 'Update a report status (admin)',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['status'],
        properties: {
          status:     { type: 'string', enum: REPORT_STATUSES as unknown as string[] },
          resolution: { type: 'string', maxLength: 500 },
        },
      },
    },
  }, async (request) => {
    const { id } = request.params as { id: string }
    const body = z.object({
      status:     z.enum(REPORT_STATUSES),
      resolution: z.string().max(500).optional(),
    }).parse(request.body)

    const reviewerId = BigInt(request.user.sub)
    const report = await ReportService.updateReportStatus(app.prisma, id, reviewerId, body.status, body.resolution)
    return { data: report }
  })
}

export default adminReportsRoutes
