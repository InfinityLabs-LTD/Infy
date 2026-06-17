import OpenAI, { toFile } from 'openai'
import type { SttConfig } from './aiSettings.js'

// Распознавание речи через OpenAI Whisper. Возвращает текст или бросает ошибку
// с понятным сообщением. Формат файла берём из имени (Whisper по нему определяет
// тип): .opus → отдаём как .ogg, кружок .mp4 — как есть.
export async function transcribeAudio(
  config: SttConfig,
  buffer: Buffer,
  fileName: string,
  mimeType: string,
): Promise<string> {
  if (!config.apiKey) {
    throw new Error('Распознавание речи недоступно: не задан ключ OpenAI')
  }

  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl ?? undefined,
  })

  // Whisper определяет формат по расширению имени файла — нормализуем .opus → .ogg.
  const safeName = fileName.replace(/\.opus$/i, '.ogg')

  const file = await toFile(buffer, safeName, { type: mimeType })

  const res: unknown = await client.audio.transcriptions.create({
    file,
    model: config.model,
    // Авто-определение языка; ответ — простой текст.
    response_format: 'text',
  })

  // При response_format: 'text' SDK возвращает строку; на всякий случай
  // поддерживаем и объект { text }.
  const text = typeof res === 'string'
    ? res
    : (res && typeof res === 'object' && 'text' in res ? String((res as { text: unknown }).text ?? '') : '')
  return text.trim()
}
