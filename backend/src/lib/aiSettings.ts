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
  anthropicBaseUrl: 'ai.anthropic.baseUrl',
  openaiModel: 'ai.openai.model',
  openaiKey: 'ai.openai.key',
  openaiBaseUrl: 'ai.openai.baseUrl',
  webSearch: 'ai.webSearch',
} as const

export interface AiConfig {
  enabled: boolean        // включён ли ассистент (общий тумблер)
  provider: AiProvider
  webSearch: boolean      // разрешён ли веб-поиск
  // Активные модель и ключ для выбранного провайдера
  model: string
  apiKey: string | null
  // Кастомный base URL (для сторонних OpenAI/Anthropic-совместимых API). null = дефолт SDK.
  baseUrl: string | null
}

// Публичное (безопасное) представление настроек для админки — без сырых ключей.
export interface AiSettingsPublic {
  enabled: boolean
  provider: AiProvider
  webSearch: boolean
  anthropic: { model: string; hasKey: boolean; baseUrl: string }
  openai: { model: string; hasKey: boolean; baseUrl: string }
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

// Приводим base URL к формату, которого ждёт SDK провайдера.
// Anthropic SDK сам добавляет «/v1/messages» → base должен быть БЕЗ хвостового /v1
// (иначе получится …/v1/v1/messages → 404). OpenAI SDK добавляет «/chat/completions»
// → base ДОЛЖЕН оканчиваться на /v1. Нормализуем оба случая, чтобы не зависеть
// от того, с /v1 или без него администратор ввёл URL.
function normalizeBaseUrl(provider: AiProvider, raw: string | null): string | null {
  if (!raw) return null
  let url = raw.trim().replace(/\/+$/, '') // убрать хвостовые слэши
  if (!url) return null
  if (provider === 'ANTHROPIC') {
    url = url.replace(/\/v1$/, '')
  } else {
    if (!/\/v\d+$/.test(url)) url = `${url}/v1`
  }
  return url
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

  const baseUrlRaw = (provider === 'OPENAI'
    ? pick(map, KEYS.openaiBaseUrl, env.OPENAI_BASE_URL ?? '')
    : pick(map, KEYS.anthropicBaseUrl, env.ANTHROPIC_BASE_URL ?? '')) || null
  const baseUrl = normalizeBaseUrl(provider, baseUrlRaw)

  // По умолчанию ассистент включён, если для выбранного провайдера есть ключ.
  const enabled = enabledRaw !== undefined ? enabledRaw === 'true' : !!apiKey

  return {
    enabled,
    provider,
    webSearch: webSearchRaw !== undefined ? webSearchRaw === 'true' : true,
    model,
    apiKey,
    baseUrl,
  }
}

// Доступен ли ассистент прямо сейчас: включён И есть ключ для активного провайдера.
export async function aiAvailable(prisma: PrismaClient): Promise<boolean> {
  const c = await getAiConfig(prisma)
  return c.enabled && !!c.apiKey
}

// Учётные данные для распознавания речи (Whisper) — это всегда OpenAI,
// независимо от активного чат-провайдера. Берём ключ/baseUrl OpenAI.
export interface SttConfig {
  apiKey: string | null
  baseUrl: string | null
  model: string
}
export async function getSttConfig(prisma: PrismaClient): Promise<SttConfig> {
  const map = await readAll(prisma)
  const apiKey = pick(map, KEYS.openaiKey, env.OPENAI_API_KEY ?? '') || null
  const baseUrlRaw = pick(map, KEYS.openaiBaseUrl, env.OPENAI_BASE_URL ?? '') || null
  return {
    apiKey,
    baseUrl: normalizeBaseUrl('OPENAI', baseUrlRaw),
    // Модель распознавания. whisper-1 — стандартная STT-модель OpenAI.
    model: 'whisper-1',
  }
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
    anthropic: {
      model: pick(map, KEYS.anthropicModel, env.ANTHROPIC_MODEL),
      hasKey: !!anthropicKey,
      baseUrl: pick(map, KEYS.anthropicBaseUrl, env.ANTHROPIC_BASE_URL ?? ''),
    },
    openai: {
      model: pick(map, KEYS.openaiModel, env.OPENAI_MODEL),
      hasKey: !!openaiKey,
      baseUrl: pick(map, KEYS.openaiBaseUrl, env.OPENAI_BASE_URL ?? ''),
    },
  }
}

export interface AiSettingsUpdate {
  enabled?: boolean
  provider?: AiProvider
  webSearch?: boolean
  anthropicModel?: string
  anthropicKey?: string         // пустая строка очищает; undefined — не трогать
  anthropicBaseUrl?: string     // пустая строка = дефолт SDK
  openaiModel?: string
  openaiKey?: string
  openaiBaseUrl?: string
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
  if (patch.anthropicBaseUrl !== undefined) writes.push({ key: KEYS.anthropicBaseUrl, value: patch.anthropicBaseUrl.trim() })
  if (patch.openaiBaseUrl !== undefined) writes.push({ key: KEYS.openaiBaseUrl, value: patch.openaiBaseUrl.trim() })
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
