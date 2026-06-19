import { PrismaClient } from '@prisma/client'

// Настройки расписания резервного копирования БД. Хранятся в app_settings.
// Расписание простое: периодичность (день/неделя/месяц) + время суток (HH:MM, UTC)
// + сколько последних копий хранить (ретеншн). Выполняется воркером scheduler.

const KEYS = {
  enabled: 'backup.schedule.enabled',
  frequency: 'backup.schedule.frequency',     // daily | weekly | monthly
  hour: 'backup.schedule.hour',               // 0..23 (UTC)
  minute: 'backup.schedule.minute',           // 0..59
  weekday: 'backup.schedule.weekday',         // 0..6 (0=вс), для weekly
  day: 'backup.schedule.day',                 // 1..28, для monthly
  retention: 'backup.schedule.retention',     // сколько последних копий хранить
  lastRunAt: 'backup.schedule.lastRunAt',     // ISO, служебное — отметка последнего авто-запуска
} as const

export type BackupFrequency = 'daily' | 'weekly' | 'monthly'

export interface BackupSchedule {
  enabled: boolean
  frequency: BackupFrequency
  hour: number
  minute: number
  weekday: number
  day: number
  retention: number
  lastRunAt: string | null
}

const DEFAULTS: BackupSchedule = {
  enabled: false,
  frequency: 'daily',
  hour: 3,
  minute: 0,
  weekday: 0,
  day: 1,
  retention: 14,
  lastRunAt: null,
}

async function readAll(prisma: PrismaClient): Promise<Map<string, string>> {
  const rows = await prisma.appSetting.findMany({
    where: { key: { in: Object.values(KEYS) } },
  })
  return new Map(rows.map(r => [r.key, r.value]))
}

function clampInt(raw: string | undefined, min: number, max: number, fallback: number): number {
  const n = Number(raw)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(n)))
}

export async function getBackupSchedule(prisma: PrismaClient): Promise<BackupSchedule> {
  const map = await readAll(prisma)
  const freqRaw = map.get(KEYS.frequency)
  const frequency: BackupFrequency =
    freqRaw === 'weekly' || freqRaw === 'monthly' ? freqRaw : 'daily'
  return {
    enabled: map.get(KEYS.enabled) === 'true',
    frequency,
    hour: clampInt(map.get(KEYS.hour), 0, 23, DEFAULTS.hour),
    minute: clampInt(map.get(KEYS.minute), 0, 59, DEFAULTS.minute),
    weekday: clampInt(map.get(KEYS.weekday), 0, 6, DEFAULTS.weekday),
    day: clampInt(map.get(KEYS.day), 1, 28, DEFAULTS.day),
    retention: clampInt(map.get(KEYS.retention), 1, 365, DEFAULTS.retention),
    lastRunAt: map.get(KEYS.lastRunAt) ?? null,
  }
}

export interface BackupScheduleUpdate {
  enabled?: boolean
  frequency?: BackupFrequency
  hour?: number
  minute?: number
  weekday?: number
  day?: number
  retention?: number
}

export async function updateBackupSchedule(
  prisma: PrismaClient,
  patch: BackupScheduleUpdate,
): Promise<BackupSchedule> {
  const writes: { key: string; value: string }[] = []
  if (patch.enabled !== undefined) writes.push({ key: KEYS.enabled, value: String(patch.enabled) })
  if (patch.frequency !== undefined) writes.push({ key: KEYS.frequency, value: patch.frequency })
  if (patch.hour !== undefined) writes.push({ key: KEYS.hour, value: String(clampInt(String(patch.hour), 0, 23, DEFAULTS.hour)) })
  if (patch.minute !== undefined) writes.push({ key: KEYS.minute, value: String(clampInt(String(patch.minute), 0, 59, DEFAULTS.minute)) })
  if (patch.weekday !== undefined) writes.push({ key: KEYS.weekday, value: String(clampInt(String(patch.weekday), 0, 6, DEFAULTS.weekday)) })
  if (patch.day !== undefined) writes.push({ key: KEYS.day, value: String(clampInt(String(patch.day), 1, 28, DEFAULTS.day)) })
  if (patch.retention !== undefined) writes.push({ key: KEYS.retention, value: String(clampInt(String(patch.retention), 1, 365, DEFAULTS.retention)) })

  if (writes.length > 0) {
    await prisma.$transaction(
      writes.map(w =>
        prisma.appSetting.upsert({
          where: { key: w.key },
          update: { value: w.value },
          create: { key: w.key, value: w.value },
        }),
      ),
    )
  }
  return getBackupSchedule(prisma)
}

// Отметить факт авто-запуска (служебное, чтобы не сработать дважды в одно окно).
export async function markBackupRun(prisma: PrismaClient, when: Date): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key: KEYS.lastRunAt },
    update: { value: when.toISOString() },
    create: { key: KEYS.lastRunAt, value: when.toISOString() },
  })
}

/**
 * Пора ли запускать авто-бэкап прямо сейчас. Сравнивает текущее UTC-время с
 * настроенным окном (день/неделя/месяц + HH:MM) и проверяет, что в этом окне
 * запуск ещё не делали (по lastRunAt). Допуск — TICK воркера (минута).
 */
export function isBackupDue(schedule: BackupSchedule, now: Date): boolean {
  if (!schedule.enabled) return false

  // В нужный ли мы час:минуту (с допуском в текущую минуту).
  if (now.getUTCHours() !== schedule.hour) return false
  if (now.getUTCMinutes() !== schedule.minute) return false

  // Совпадает ли период.
  if (schedule.frequency === 'weekly' && now.getUTCDay() !== schedule.weekday) return false
  if (schedule.frequency === 'monthly' && now.getUTCDate() !== schedule.day) return false

  // Не запускались ли уже в эту же минуту (защита от двойного тика/реплики).
  if (schedule.lastRunAt) {
    const last = new Date(schedule.lastRunAt)
    if (
      last.getUTCFullYear() === now.getUTCFullYear() &&
      last.getUTCMonth() === now.getUTCMonth() &&
      last.getUTCDate() === now.getUTCDate() &&
      last.getUTCHours() === now.getUTCHours() &&
      last.getUTCMinutes() === now.getUTCMinutes()
    ) {
      return false
    }
  }
  return true
}
