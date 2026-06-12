import { PrismaClient, ReminderTarget, Prisma } from '@prisma/client'
import { AppError } from '../../lib/errors.js'
import { CATEGORY_PRESETS, isValidPresetKey } from './calendar.presets.js'

// ── Типы входных данных ──────────────────────────────────────

export interface ReminderInput {
  offsetMin: number              // за сколько минут до eventAt
  target: ReminderTarget         // SELF | PARTNER | BOTH
  notify: boolean                // слать ли push/уведомление
}

export interface EventInput {
  title: string
  notes?: string | null
  eventAt: string                // ISO
  allDay?: boolean
  presetKey?: string | null
  categoryId?: string | null
  reminders: ReminderInput[]
}

// ── Хелперы доступа ──────────────────────────────────────────

async function assertMember(prisma: PrismaClient, chatId: string, userId: bigint): Promise<void> {
  const member = await prisma.chatMember.findUnique({
    where: { chatId_userId: { chatId, userId } },
  })
  if (!member) throw new AppError('CHAT_NOT_MEMBER', 'You are not a member of this chat', 403)
}

function computeFireAt(eventAt: Date, offsetMin: number): Date {
  return new Date(eventAt.getTime() - offsetMin * 60_000)
}

function validateReminders(reminders: ReminderInput[]): void {
  if (reminders.length > 5) {
    throw new AppError('CALENDAR_TOO_MANY_REMINDERS', 'Maximum 5 reminders per event', 400)
  }
  for (const r of reminders) {
    if (r.offsetMin < 0 || r.offsetMin > 60 * 24 * 365) {
      throw new AppError('CALENDAR_INVALID_OFFSET', 'Reminder offset out of range', 400)
    }
  }
}

/**
 * Проверяет согласованность категории: либо валидный пресет, либо существующая
 * пользовательская категория этого чата, либо ничего.
 */
async function resolveCategory(
  prisma: PrismaClient,
  chatId: string,
  presetKey?: string | null,
  categoryId?: string | null,
): Promise<{ presetKey: string | null; categoryId: string | null }> {
  if (presetKey && categoryId) {
    throw new AppError('CALENDAR_CATEGORY_CONFLICT', 'Provide either presetKey or categoryId, not both', 400)
  }
  if (presetKey) {
    if (!isValidPresetKey(presetKey)) {
      throw new AppError('CALENDAR_INVALID_PRESET', 'Unknown category preset', 400)
    }
    return { presetKey, categoryId: null }
  }
  if (categoryId) {
    const cat = await prisma.calendarCategory.findUnique({ where: { id: categoryId } })
    if (!cat || cat.chatId !== chatId) {
      throw new AppError('CALENDAR_CATEGORY_NOT_FOUND', 'Category not found in this chat', 404)
    }
    return { presetKey: null, categoryId }
  }
  return { presetKey: null, categoryId: null }
}

const eventInclude = {
  category: true,
  createdBy: { select: { id: true, username: true, nickname: true, avatarUrl: true } },
  reminders: { orderBy: { offsetMin: 'asc' as const } },
} satisfies Prisma.CalendarEventInclude

// ── События ──────────────────────────────────────────────────

export async function listEvents(
  prisma: PrismaClient,
  chatId: string,
  userId: bigint,
  from?: string,
  to?: string,
) {
  await assertMember(prisma, chatId, userId)

  const events = await prisma.calendarEvent.findMany({
    where: {
      chatId,
      ...(from || to
        ? { eventAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
        : {}),
    },
    include: eventInclude,
    orderBy: { eventAt: 'asc' },
  })

  return events.map(serializeEvent)
}

export async function createEvent(
  prisma: PrismaClient,
  chatId: string,
  userId: bigint,
  input: EventInput,
) {
  await assertMember(prisma, chatId, userId)
  validateReminders(input.reminders)

  const eventAt = new Date(input.eventAt)
  if (Number.isNaN(eventAt.getTime())) {
    throw new AppError('CALENDAR_INVALID_DATE', 'Invalid eventAt', 400)
  }

  const { presetKey, categoryId } = await resolveCategory(prisma, chatId, input.presetKey, input.categoryId)

  const event = await prisma.calendarEvent.create({
    data: {
      chatId,
      createdById: userId,
      title: input.title.trim(),
      notes: input.notes?.trim() || null,
      eventAt,
      allDay: input.allDay ?? false,
      presetKey,
      categoryId,
      reminders: {
        create: input.reminders.map(r => ({
          offsetMin: r.offsetMin,
          target: r.target,
          notify: r.notify,
          fireAt: computeFireAt(eventAt, r.offsetMin),
        })),
      },
    },
    include: eventInclude,
  })

  return serializeEvent(event)
}

export async function updateEvent(
  prisma: PrismaClient,
  eventId: string,
  userId: bigint,
  input: EventInput,
) {
  const existing = await prisma.calendarEvent.findUnique({ where: { id: eventId } })
  if (!existing) throw new AppError('CALENDAR_EVENT_NOT_FOUND', 'Event not found', 404)
  await assertMember(prisma, existing.chatId, userId)
  validateReminders(input.reminders)

  const eventAt = new Date(input.eventAt)
  if (Number.isNaN(eventAt.getTime())) {
    throw new AppError('CALENDAR_INVALID_DATE', 'Invalid eventAt', 400)
  }

  const { presetKey, categoryId } = await resolveCategory(prisma, existing.chatId, input.presetKey, input.categoryId)

  // Реминдеры пересоздаём целиком — проще и согласованнее, чем диффить.
  const event = await prisma.$transaction(async (tx) => {
    await tx.eventReminder.deleteMany({ where: { eventId } })
    return tx.calendarEvent.update({
      where: { id: eventId },
      data: {
        title: input.title.trim(),
        notes: input.notes?.trim() || null,
        eventAt,
        allDay: input.allDay ?? false,
        presetKey,
        categoryId,
        reminders: {
          create: input.reminders.map(r => ({
            offsetMin: r.offsetMin,
            target: r.target,
            notify: r.notify,
            fireAt: computeFireAt(eventAt, r.offsetMin),
          })),
        },
      },
      include: eventInclude,
    })
  })

  return serializeEvent(event)
}

export async function deleteEvent(
  prisma: PrismaClient,
  eventId: string,
  userId: bigint,
) {
  const existing = await prisma.calendarEvent.findUnique({ where: { id: eventId } })
  if (!existing) throw new AppError('CALENDAR_EVENT_NOT_FOUND', 'Event not found', 404)
  await assertMember(prisma, existing.chatId, userId)

  await prisma.calendarEvent.delete({ where: { id: eventId } })
  return { id: eventId, chatId: existing.chatId }
}

// ── Категории ────────────────────────────────────────────────

export async function listCategories(
  prisma: PrismaClient,
  chatId: string,
  userId: bigint,
) {
  await assertMember(prisma, chatId, userId)
  const custom = await prisma.calendarCategory.findMany({
    where: { chatId },
    orderBy: { createdAt: 'asc' },
  })
  return {
    presets: CATEGORY_PRESETS,
    custom: custom.map(c => ({
      id: c.id,
      name: c.name,
      color: c.color,
      createdById: c.createdById.toString(),
      createdAt: c.createdAt,
    })),
  }
}

export async function createCategory(
  prisma: PrismaClient,
  chatId: string,
  userId: bigint,
  name: string,
  color: string,
) {
  await assertMember(prisma, chatId, userId)
  const cat = await prisma.calendarCategory.create({
    data: { chatId, name: name.trim(), color, createdById: userId },
  })
  return {
    id: cat.id,
    name: cat.name,
    color: cat.color,
    createdById: cat.createdById.toString(),
    createdAt: cat.createdAt,
  }
}

export async function deleteCategory(
  prisma: PrismaClient,
  categoryId: string,
  userId: bigint,
) {
  const cat = await prisma.calendarCategory.findUnique({ where: { id: categoryId } })
  if (!cat) throw new AppError('CALENDAR_CATEGORY_NOT_FOUND', 'Category not found', 404)
  await assertMember(prisma, cat.chatId, userId)
  // События, ссылавшиеся на категорию, получат categoryId = null (onDelete: SetNull).
  await prisma.calendarCategory.delete({ where: { id: categoryId } })
  return { id: categoryId, chatId: cat.chatId }
}

// ── Настройки (общий тумблер) ────────────────────────────────

export async function getSettings(
  prisma: PrismaClient,
  chatId: string,
  userId: bigint,
) {
  await assertMember(prisma, chatId, userId)
  const setting = await prisma.chatCalendarSetting.findUnique({
    where: { chatId_userId: { chatId, userId } },
  })
  // По умолчанию напоминания включены.
  return { remindersEnabled: setting?.remindersEnabled ?? true }
}

export async function updateSettings(
  prisma: PrismaClient,
  chatId: string,
  userId: bigint,
  remindersEnabled: boolean,
) {
  await assertMember(prisma, chatId, userId)
  await prisma.chatCalendarSetting.upsert({
    where: { chatId_userId: { chatId, userId } },
    update: { remindersEnabled },
    create: { chatId, userId, remindersEnabled },
  })
  return { remindersEnabled }
}

// ── Сериализатор ─────────────────────────────────────────────

type EventRow = Prisma.CalendarEventGetPayload<{ include: typeof eventInclude }>

export function serializeEvent(e: EventRow) {
  return {
    id: e.id,
    chatId: e.chatId,
    title: e.title,
    notes: e.notes,
    eventAt: e.eventAt,
    allDay: e.allDay,
    presetKey: e.presetKey,
    categoryId: e.categoryId,
    category: e.category
      ? { id: e.category.id, name: e.category.name, color: e.category.color }
      : null,
    createdBy: {
      id: e.createdBy.id.toString(),
      username: e.createdBy.username,
      nickname: e.createdBy.nickname,
      avatarUrl: e.createdBy.avatarUrl,
    },
    reminders: e.reminders.map(r => ({
      id: r.id,
      offsetMin: r.offsetMin,
      target: r.target,
      notify: r.notify,
      fireAt: r.fireAt,
      sentAt: r.sentAt,
    })),
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  }
}
