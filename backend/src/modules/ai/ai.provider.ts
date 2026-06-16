import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { AiConfig, AiProvider } from '../../lib/aiSettings.js'

// ── Нейтральные типы инструментов ─────────────────────────────
// Описание инструмента, которое транслируется в формат Anthropic или OpenAI.
export interface ToolDef {
  name: string
  description: string
  // JSON-Schema объекта параметров
  parameters: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
}

// Вызов инструмента, который попросила модель.
export interface ToolCall {
  id: string
  name: string
  input: Record<string, unknown>
}

// Обработчик инструмента: получает аргументы, возвращает строковый результат
// (то, что увидит модель), плюс опциональные структурированные данные для нас.
export type ToolHandler = (input: Record<string, unknown>) => Promise<{
  // Текст, возвращаемый модели как результат вызова.
  result: string
}>

export interface RunAgentOptions {
  config: AiConfig
  system: string
  // История диалога (без system). role 'user' | 'assistant'.
  messages: { role: 'user' | 'assistant'; content: string }[]
  tools: ToolDef[]
  handlers: Record<string, ToolHandler>
  // Включить встроенный веб-поиск провайдера.
  webSearch: boolean
  maxIterations?: number
}

export interface RunAgentResult {
  text: string
  // Имена инструментов, которые реально вызвала модель (для метаданных/UI).
  toolsUsed: string[]
  // Использовался ли веб-поиск.
  usedWebSearch: boolean
}

// Главная точка входа: запустить агентский цикл у выбранного провайдера.
export async function runAgent(opts: RunAgentOptions): Promise<RunAgentResult> {
  if (opts.config.provider === 'OPENAI') return runOpenAI(opts)
  return runAnthropic(opts)
}

// ── Anthropic ─────────────────────────────────────────────────

async function runAnthropic(opts: RunAgentOptions): Promise<RunAgentResult> {
  const client = new Anthropic({
    apiKey: opts.config.apiKey ?? undefined,
    baseURL: opts.config.baseUrl ?? undefined,
  })

  const tools: Anthropic.Tool[] = opts.tools.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters as Anthropic.Tool['input_schema'],
  }))

  // Встроенный веб-поиск Anthropic — серверный инструмент. Тип серверного
  // инструмента может отличаться по версиям SDK — передаём нетипизированно.
  const serverTools: unknown[] = opts.webSearch
    ? [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }]
    : []

  const messages: Anthropic.MessageParam[] = opts.messages.map(m => ({
    role: m.role,
    content: m.content,
  }))

  const toolsUsed = new Set<string>()
  let usedWebSearch = false
  const maxIter = opts.maxIterations ?? 6

  for (let i = 0; i < maxIter; i++) {
    const response = await client.messages.create({
      model: opts.config.model,
      max_tokens: 2048,
      system: opts.system,
      messages,
      tools: [...tools, ...serverTools] as Anthropic.Tool[],
    })

    // Собираем ответ ассистента в историю целиком (включая tool_use).
    messages.push({ role: 'assistant', content: response.content })

    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    )
    if (response.content.some(b => b.type === 'server_tool_use')) usedWebSearch = true

    // pause_turn: серверный инструмент (web_search) не закончил — продолжаем.
    if (response.stop_reason === 'pause_turn') {
      continue
    }

    if (toolUses.length === 0 || response.stop_reason === 'end_turn') {
      const text = extractAnthropicText(response)
      if (text || toolUses.length === 0) {
        return { text, toolsUsed: [...toolsUsed], usedWebSearch }
      }
    }

    // Выполняем клиентские инструменты и возвращаем результаты.
    const results: Anthropic.ToolResultBlockParam[] = []
    for (const tu of toolUses) {
      toolsUsed.add(tu.name)
      const handler = opts.handlers[tu.name]
      let result = `Инструмент ${tu.name} недоступен.`
      if (handler) {
        try {
          const out = await handler((tu.input ?? {}) as Record<string, unknown>)
          result = out.result
        } catch (e) {
          result = `Ошибка инструмента: ${e instanceof Error ? e.message : 'неизвестно'}`
        }
      }
      results.push({ type: 'tool_result', tool_use_id: tu.id, content: result })
    }
    if (results.length === 0) {
      return { text: extractAnthropicText(response), toolsUsed: [...toolsUsed], usedWebSearch }
    }
    messages.push({ role: 'user', content: results })
  }

  return { text: 'Не удалось завершить ответ за отведённое число шагов.', toolsUsed: [...toolsUsed], usedWebSearch }
}

function extractAnthropicText(response: Anthropic.Message): string {
  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('\n')
    .trim()
}

// ── OpenAI ────────────────────────────────────────────────────

async function runOpenAI(opts: RunAgentOptions): Promise<RunAgentResult> {
  const client = new OpenAI({
    apiKey: opts.config.apiKey ?? undefined,
    baseURL: opts.config.baseUrl ?? undefined,
  })

  const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = opts.tools.map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters as Record<string, unknown>,
    },
  }))

  // Веб-поиск OpenAI: модель -search-preview сама ищет в вебе. Реализуем как
  // отдельный инструмент web_search, который делает вложенный вызов search-модели.
  if (opts.webSearch) {
    tools.push({
      type: 'function',
      function: {
        name: 'web_search',
        description: 'Найти актуальную информацию в интернете по запросу. Используй для свежих фактов, цен, новостей, дат.',
        parameters: {
          type: 'object',
          properties: { query: { type: 'string', description: 'Поисковый запрос' } },
          required: ['query'],
        },
      },
    })
  }

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: opts.system },
    ...opts.messages.map(m => ({ role: m.role, content: m.content }) as OpenAI.Chat.Completions.ChatCompletionMessageParam),
  ]

  const toolsUsed = new Set<string>()
  let usedWebSearch = false
  const maxIter = opts.maxIterations ?? 6

  for (let i = 0; i < maxIter; i++) {
    const response = await client.chat.completions.create({
      model: opts.config.model,
      max_tokens: 2048,
      messages,
      tools: tools.length ? tools : undefined,
    })

    const choice = response.choices[0]
    const msg = choice?.message
    if (!msg) return { text: '', toolsUsed: [...toolsUsed], usedWebSearch }

    messages.push(msg)

    const calls = msg.tool_calls ?? []
    if (calls.length === 0) {
      return { text: (msg.content ?? '').trim(), toolsUsed: [...toolsUsed], usedWebSearch }
    }

    for (const call of calls) {
      if (call.type !== 'function') continue
      const name = call.function.name
      toolsUsed.add(name)
      let input: Record<string, unknown> = {}
      try { input = JSON.parse(call.function.arguments || '{}') } catch { /* ignore */ }

      let result = `Инструмент ${name} недоступен.`
      if (name === 'web_search') {
        usedWebSearch = true
        result = await openaiWebSearch(client, String(input.query ?? ''), opts.config)
      } else {
        const handler = opts.handlers[name]
        if (handler) {
          try {
            const out = await handler(input)
            result = out.result
          } catch (e) {
            result = `Ошибка инструмента: ${e instanceof Error ? e.message : 'неизвестно'}`
          }
        }
      }
      messages.push({ role: 'tool', tool_call_id: call.id, content: result })
    }
  }

  return { text: 'Не удалось завершить ответ за отведённое число шагов.', toolsUsed: [...toolsUsed], usedWebSearch }
}

// Вложенный веб-поиск через search-preview модель OpenAI.
async function openaiWebSearch(client: OpenAI, query: string, config: AiConfig): Promise<string> {
  if (!query.trim()) return 'Пустой поисковый запрос.'
  try {
    // gpt-4o-search-preview сам выполняет веб-поиск. На сторонних (custom baseUrl)
    // провайдерах этой модели может не быть — используем активную модель.
    // web_search_options может отсутствовать в типах SDK — передаём нетипизированно.
    const params = {
      model: config.baseUrl ? config.model : 'gpt-4o-search-preview',
      web_search_options: {},
      messages: [
        { role: 'system', content: 'Кратко ответь на запрос фактами из интернета, на русском. Указывай источники, если уместно.' },
        { role: 'user', content: query },
      ],
    }
    const r = await client.chat.completions.create(
      params as unknown as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
    )
    return r.choices[0]?.message?.content?.trim() || 'Ничего не найдено.'
  } catch (e) {
    return `Веб-поиск недоступен: ${e instanceof Error ? e.message : 'ошибка'}`
  }
}

export const PROVIDER_LABELS: Record<AiProvider, string> = {
  ANTHROPIC: 'Anthropic (Claude)',
  OPENAI: 'OpenAI (ChatGPT)',
}
