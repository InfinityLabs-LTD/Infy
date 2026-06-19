import { PrismaClient, Prisma } from '@prisma/client'
import { env } from './env.js'

/**
 * Возвращает DATABASE_URL с гарантированным параметром connection_limit.
 * H-7: без явного лимита Prisma открывает num_cpus*2+1 соединений на процесс.
 * При нескольких репликах core/realtime/scheduler суммарный пул легко превышает
 * Postgres max_connections (дефолт 100). Фиксируем предел на процесс из env,
 * не затирая значение, уже заданное в строке подключения.
 */
export function databaseUrlWithPool(): string {
  const url = env.DATABASE_URL
  if (/[?&]connection_limit=/.test(url)) return url
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}connection_limit=${env.DB_CONNECTION_LIMIT}`
}

/** Единая фабрика PrismaClient с настроенным пулом соединений. */
export function createPrismaClient(options?: Prisma.PrismaClientOptions): PrismaClient {
  return new PrismaClient({
    ...options,
    datasources: { db: { url: databaseUrlWithPool() } },
  })
}
