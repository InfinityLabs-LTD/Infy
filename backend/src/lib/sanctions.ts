import { PrismaClient, SanctionType } from '@prisma/client'

// Активная санкция данного типа: не снята вручную и (бессрочна или ещё не истекла).
export interface ActiveSanction {
  id: string
  type: SanctionType
  reason: string
  createdAt: Date
  expiresAt: Date | null
}

// Возвращает самую релевантную активную санкцию указанного типа (с наибольшим
// сроком действия) либо null. Бессрочная считается «дольше» любой срочной.
export async function getActiveSanction(
  prisma: PrismaClient,
  userId: bigint,
  type: SanctionType,
): Promise<ActiveSanction | null> {
  const now = new Date()
  const rows = await prisma.sanction.findMany({
    where: {
      userId,
      type,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: { id: true, type: true, reason: true, createdAt: true, expiresAt: true },
    orderBy: { createdAt: 'desc' },
  })
  if (rows.length === 0) return null
  // Бессрочная (expiresAt = null) приоритетнее; иначе — с самым поздним сроком.
  rows.sort((a, b) => {
    if (a.expiresAt === null) return -1
    if (b.expiresAt === null) return 1
    return b.expiresAt.getTime() - a.expiresAt.getTime()
  })
  return rows[0]
}

// Все активные санкции пользователя (для отображения самому пользователю).
export async function getActiveSanctions(
  prisma: PrismaClient,
  userId: bigint,
): Promise<ActiveSanction[]> {
  const now = new Date()
  return prisma.sanction.findMany({
    where: {
      userId,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: { id: true, type: true, reason: true, createdAt: true, expiresAt: true },
    orderBy: { createdAt: 'desc' },
  })
}

export function isBanned(s: ActiveSanction | null): boolean {
  return s !== null && s.type === 'BAN'
}
