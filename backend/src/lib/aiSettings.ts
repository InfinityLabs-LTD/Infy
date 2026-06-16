import { PrismaClient } from '@prisma/client'
import { env } from './env.js'

// Провайдер модели ИИ. Хранится строкой в app_settings (не enum-поле модели),
// поэтому объявляем тип здесь, а не тянем из @prisma/client.
export type AiProvider = 'ANTHROPIC' | 'OPENAI'

// Ключи в таблице app_settings, относящиеся к ИИ-ассистенту.
const KEYS = {
  enabled: 'ai.enabled',
  provider: 'ai.provider',
  anthropicModel: 'ai.anthropic.model',
  anthropicKey: 'ai.anthropic.key',
  openaiModel: 'ai.openai.model',
  openaiKey: 'ai.openai.key',
  webSearch: 'ai.webSearch',
} as const

export interface AiConfig {
  enabled: boolean        // включён ли ассистент (общий тумблер)
  provider: AiProvider
  webSearch: boolean      // разрешён ли веб-поиск
  // Активные модель и ключ для выбранного провайдера
  model: string
  apiKey: string | null
}

// Публичное (безопасное) представление настроек для админки — без сырых ключей.
export interface AiSettingsPublic {
  enabled: boolean
  provider: AiProvider
  webSearch: boolean
  anthropic: { model: string; hasKey: boolean }
  openai: { model: string; hasKey: boolean }
}

async function readAll(prisma: PrismaClient): Promise<Map<string, string>> {
  const rows = await prisma.appSetting.findMany({
    where: { key: { in: Object.values(KEYS) } },
  })
  return new Map(rows.map(r => [r.key, r.value]))
}

function pick(map: Map<string, string>, key: string, fallback: string): string {
  const v = map.get(key)
  return v !== undefined && v !== '' ? v : fallback
}

// Полная конфигурация для выполнения запроса (включая активный ключ).
export async function getAiConfig(prisma: PrismaClient): Promise<AiConfig> {
  const map = await readAll(prisma)

  const provider = (pick(map, KEYS.provider, env.AI_PROVIDER) as AiProvider)
  const enabledRaw = map.get(KEYS.enabled)
  const webSearchRaw = map.get(KEYS.webSearch)

  const anthropicKey = pick(map, KEYS.anthropicKey, env.ANTHROPIC_API_KEY ?? '') || null
  const openaiKey = pick(map, KEYS.openaiKey, env.OPENAI_API_KEY ?? '') || null

  const model = provider === 'OPENAI'
    ? pick(map, KEYS.openaiModel, env.OPENAI_MODEL)
    : pick(map, KEYS.anthropicModel, env.ANTHROPIC_MODEL)
  const apiKey = provider === 'OPENAI' ? openaiKey : anthropicKey

  // По умолчанию ассистент включён, если для выбранного провайдера есть ключ.
  const enabled = enabledRaw !== undefined ? enabledRaw === 'true' : !!apiKey

  return {
    enabled,
    provider,
    webSearch: webSearchRaw !== undefined ? webSearchRaw === 'true' : true,
    model,
    apiKey,
  }
}

// Доступен ли ассистент прямо сейчас: включён И есть ключ для активного провайдера.
export async function aiAvailable(prisma: PrismaClient): Promise<boolean> {
  const c = await getAiConfig(prisma)
  return c.enabled && !!c.apiKey
}

// Безопасные настройки для админки.
export async function getAiSettingsPublic(prisma: PrismaClient): Promise<AiSettingsPublic> {
  const map = await readAll(prisma)
  const provider = (pick(map, KEYS.provider, env.AI_PROVIDER) as AiProvider)
  const enabledRaw = map.get(KEYS.enabled)
  const webSearchRaw = map.get(KEYS.webSearch)

  const anthropicKey = pick(map, KEYS.anthropicKey, env.ANTHROPIC_API_KEY ?? '')
  const openaiKey = pick(map, KEYS.openaiKey, env.OPENAI_API_KEY ?? '')

  const activeKey = provider === 'OPENAI' ? openaiKey : anthropicKey

  return {
    enabled: enabledRaw !== undefined ? enabledRaw === 'true' : !!activeKey,
    provider,
    webSearch: webSearchRaw !== undefined ? webSearchRaw === 'true' : true,
    anthropic: { model: pick(map, KEYS.anthropicModel, env.ANTHROPIC_MODEL), hasKey: !!anthropicKey },
    openai: { model: pick(map, KEYS.openaiModel, env.OPENAI_MODEL), hasKey: !!openaiKey },
  }
}

export interface AiSettingsUpdate {
  enabled?: boolean
  provider?: AiProvider
  webSearch?: boolean
  anthropicModel?: string
  anthropicKey?: string         // пустая строка очищает; undefined — не трогать
  openaiModel?: string
  openaiKey?: string
}

// Сохранить настройки из админки. Ключи, пришедшие undefined, не меняются.
export async function updateAiSettings(
  prisma: PrismaClient,
  patch: AiSettingsUpdate,
): Promise<AiSettingsPublic> {
  const writes: { key: string; value: string }[] = []
  if (patch.enabled !== undefined) writes.push({ key: KEYS.enabled, value: String(patch.enabled) })
  if (patch.provider !== undefined) writes.push({ key: KEYS.provider, value: patch.provider })
  if (patch.webSearch !== undefined) writes.push({ key: KEYS.webSearch, value: String(patch.webSearch) })
  if (patch.anthropicModel !== undefined) writes.push({ key: KEYS.anthropicModel, value: patch.anthropicModel.trim() })
  if (patch.openaiModel !== undefined) writes.push({ key: KEYS.openaiModel, value: patch.openaiModel.trim() })
  // Ключи: пустая строка = очистить; непустая = сохранить.
  if (patch.anthropicKey !== undefined) writes.push({ key: KEYS.anthropicKey, value: patch.anthropicKey.trim() })
  if (patch.openaiKey !== undefined) writes.push({ key: KEYS.openaiKey, value: patch.openaiKey.trim() })

  await prisma.$transaction(
    writes.map(w =>
      prisma.appSetting.upsert({
        where: { key: w.key },
        update: { value: w.value },
        create: { key: w.key, value: w.value },
      }),
    ),
  )

  return getAiSettingsPublic(prisma)
}
