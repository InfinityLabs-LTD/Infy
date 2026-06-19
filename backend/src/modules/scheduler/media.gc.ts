import * as Minio from 'minio'
import { PrismaClient } from '@prisma/client'
import { env } from '../../lib/env.js'

// Объект в media-бакете считаем осиротевшим, если он старше этого окна и не
// привязан ни к одному Attachment. Окно даёт запас на сценарий «файл загружен,
// сообщение создаётся следующим запросом» (см. C-2/H-9 из аудита).
const ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000   // 24 часа
// За один прогон удаляем не больше — чтобы не нагружать MinIO/БД пачкой.
const GC_BATCH = 500

function listObjects(minio: Minio.Client, bucket: string): Promise<Array<{ name: string; lastModified: Date }>> {
  return new Promise((resolve, reject) => {
    const out: Array<{ name: string; lastModified: Date }> = []
    const stream = minio.listObjectsV2(bucket, '', true)
    stream.on('data', (obj) => {
      if (obj.name) out.push({ name: obj.name, lastModified: obj.lastModified ?? new Date(0) })
    })
    stream.on('end', () => resolve(out))
    stream.on('error', reject)
  })
}

/**
 * H-9: удаляет осиротевшие объекты media-бакета — файлы, загруженные в MinIO, но
 * так и не привязанные к сообщению (клиент закрыл вкладку/упал между upload и
 * POST /messages, либо outbox-задание истекло). Без GC такие объекты копятся
 * бесконечно. Avatars не трогаем (они привязаны к профилю, не к Attachment).
 */
export async function gcOrphanMedia(prisma: PrismaClient, minio: Minio.Client): Promise<number> {
  const bucket = env.MINIO_BUCKET_MEDIA
  const cutoff = Date.now() - ORPHAN_GRACE_MS

  const objects = await listObjects(minio, bucket)
  const candidates = objects
    .filter(o => o.lastModified.getTime() < cutoff)
    .slice(0, GC_BATCH)
  if (candidates.length === 0) return 0

  // Какие из кандидатов реально используются (storageKey ИЛИ thumbnailKey).
  const keys = candidates.map(c => c.name)
  const used = new Set<string>()
  const referenced = await prisma.attachment.findMany({
    where: { OR: [{ storageKey: { in: keys } }, { thumbnailKey: { in: keys } }] },
    select: { storageKey: true, thumbnailKey: true },
  })
  for (const a of referenced) {
    used.add(a.storageKey)
    if (a.thumbnailKey) used.add(a.thumbnailKey)
  }

  const orphans = keys.filter(k => !used.has(k))
  if (orphans.length === 0) return 0

  await minio.removeObjects(bucket, orphans)
  return orphans.length
}
