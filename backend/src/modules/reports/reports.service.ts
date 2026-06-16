import { PrismaClient, ReportCategory, ReportStatus, Prisma } from '@prisma/client'
import { AppError } from '../../lib/errors.js'

const MAX_EVIDENCE = 5

export interface CreateReportInput {
  targetId: bigint
  category: ReportCategory
  description: string
  chatId?: string
  messageId?: string
  evidenceKeys?: string[]
}

const reportUserSelect = {
  id: true, username: true, nickname: true, avatarUrl: true,
} as const

const reportInclude = {
  reporter:   { select: reportUserSelect },
  target:     { select: reportUserSelect },
  reviewedBy: { select: reportUserSelect },
} satisfies Prisma.ReportInclude

export async function createReport(
  prisma: PrismaClient,
  reporterId: bigint,
  input: CreateReportInput,
) {
  if (input.targetId === reporterId) {
    throw new AppError('REPORT_SELF', 'Нельзя пожаловаться на себя', 400)
  }

  const target = await prisma.user.findUnique({ where: { id: input.targetId }, select: { id: true } })
  if (!target) throw new AppError('AUTH_USER_NOT_FOUND', 'Пользователь не найден', 404)

  const evidenceKeys = (input.evidenceKeys ?? []).slice(0, MAX_EVIDENCE)

  // Если указано сообщение — убеждаемся, что оно существует и принадлежит цели/чату.
  if (input.messageId) {
    const msg = await prisma.message.findUnique({
      where: { id: input.messageId },
      select: { id: true, chatId: true },
    })
    if (!msg) throw new AppError('MESSAGE_NOT_FOUND', 'Сообщение не найдено', 404)
    input.chatId = input.chatId ?? msg.chatId
  }

  const report = await prisma.report.create({
    data: {
      reporterId,
      targetId: input.targetId,
      category: input.category,
      description: input.description,
      chatId: input.chatId ?? null,
      messageId: input.messageId ?? null,
      evidenceKeys,
    },
    include: reportInclude,
  })

  return serializeReport(report)
}

export async function listReports(
  prisma: PrismaClient,
  status: ReportStatus | 'all',
) {
  const where = status === 'all' ? {} : { status }
  const [reports, pending, reviewing] = await Promise.all([
    prisma.report.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: reportInclude,
    }),
    prisma.report.count({ where: { status: 'PENDING' } }),
    prisma.report.count({ where: { status: 'REVIEWING' } }),
  ])
  return {
    reports: reports.map(serializeReport),
    counts: { pending, reviewing },
  }
}

export async function updateReportStatus(
  prisma: PrismaClient,
  reportId: string,
  reviewerId: bigint,
  status: ReportStatus,
  resolution?: string,
) {
  const report = await prisma.report.update({
    where: { id: reportId },
    data: {
      status,
      resolution: resolution ?? null,
      reviewedById: status === 'PENDING' ? null : reviewerId,
      reviewedAt: status === 'PENDING' ? null : new Date(),
    },
    include: reportInclude,
  })
  return serializeReport(report)
}

type ReportRow = Prisma.ReportGetPayload<{ include: typeof reportInclude }>

export function serializeReport(r: ReportRow) {
  const u = (x: { id: bigint; username: string; nickname: string; avatarUrl: string | null } | null) =>
    x ? { ...x, id: x.id.toString() } : null
  return {
    id: r.id,
    category: r.category,
    description: r.description,
    chatId: r.chatId,
    messageId: r.messageId,
    evidenceKeys: r.evidenceKeys,
    status: r.status,
    createdAt: r.createdAt,
    reviewedAt: r.reviewedAt,
    resolution: r.resolution,
    reporter: u(r.reporter),
    target: u(r.target),
    reviewedBy: u(r.reviewedBy),
  }
}
