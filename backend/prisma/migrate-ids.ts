/**
 * One-time migration: replace UUID IDs with ULID in chats, messages, attachments.
 * DeviceSession.id is intentionally skipped (embedded in JWTs, not in CDN URLs).
 *
 * Run on server:
 *   docker exec infy-core-1 node -e "require('./dist/prisma/migrate-ids.js').migrate()"
 * Or via tsx:
 *   docker exec infy-core-1 npx tsx prisma/migrate-ids.ts
 */

import { PrismaClient } from '@prisma/client'
import { monotonicFactory } from 'ulid'

export async function migrate() {
  const prisma = new PrismaClient()
  const ulid = monotonicFactory()

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

  try {
    // ── 1. Chats ──────────────────────────────────────────────────
    const chats = await prisma.$queryRaw<{ id: string; createdAt: Date }[]>`
      SELECT id, "createdAt" FROM chats
      WHERE id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      ORDER BY "createdAt" ASC
    `
    console.log(`Chats to migrate: ${chats.length}`)

    for (const chat of chats) {
      const newId = ulid(chat.createdAt.getTime())
      await prisma.$transaction(async (tx) => {
        // Disable FK trigger checks for the duration of this transaction
        await tx.$executeRaw`SET LOCAL session_replication_role = 'replica'`
        await tx.$executeRaw`UPDATE chats SET id = ${newId} WHERE id = ${chat.id}`
        await tx.$executeRaw`UPDATE chat_members SET "chatId" = ${newId} WHERE "chatId" = ${chat.id}`
        await tx.$executeRaw`UPDATE messages SET "chatId" = ${newId} WHERE "chatId" = ${chat.id}`
      })
      console.log(`  chat ${chat.id} → ${newId}`)
    }

    // ── 2. Messages ───────────────────────────────────────────────
    // Sort by createdAt so ULID monotonic counter preserves message order
    const messages = await prisma.$queryRaw<{ id: string; createdAt: Date }[]>`
      SELECT id, "createdAt" FROM messages
      WHERE id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      ORDER BY "createdAt" ASC, id ASC
    `
    console.log(`Messages to migrate: ${messages.length}`)

    for (const msg of messages) {
      const newId = ulid(msg.createdAt.getTime())
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SET LOCAL session_replication_role = 'replica'`
        await tx.$executeRaw`UPDATE messages SET id = ${newId} WHERE id = ${msg.id}`
        await tx.$executeRaw`UPDATE attachments SET "messageId" = ${newId} WHERE "messageId" = ${msg.id}`
      })
    }
    console.log(`  ${messages.length} messages migrated`)

    // ── 3. Attachments ────────────────────────────────────────────
    const attachments = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM attachments
      WHERE id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    `
    console.log(`Attachments to migrate: ${attachments.length}`)

    for (const att of attachments) {
      const newId = ulid()
      await prisma.$executeRaw`UPDATE attachments SET id = ${newId} WHERE id = ${att.id}`
    }
    console.log(`  ${attachments.length} attachments migrated`)

    console.log('Migration complete.')
  } finally {
    await prisma.$disconnect()
  }
}

migrate().catch((e) => { console.error(e); process.exit(1) })
