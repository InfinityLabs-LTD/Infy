import { readFileSync } from 'node:fs'
import admin from 'firebase-admin'
import type { PushPayload } from './webpush.js'
import { env } from './env.js'

// Состояние ленивой инициализации Firebase Admin SDK.
// null  — ещё не пытались инициализировать;
// объект — инициализировано (или явно выключено флагом enabled=false).
let state: { enabled: boolean; messaging: admin.messaging.Messaging | null } | null = null
let warnedDisabled = false

/**
 * Лениво инициализирует Firebase Admin SDK по service account из env.
 * Поддерживает два способа конфигурации:
 *   - FCM_SERVICE_ACCOUNT_JSON  — весь JSON service account строкой;
 *   - FCM_SERVICE_ACCOUNT_PATH  — путь к файлу service account.
 * Если ни одного нет — FCM выключен (нооп), один раз логируем warn.
 * Не бросает исключений: ошибки конфигурации не должны валить процесс.
 */
function getMessaging(): admin.messaging.Messaging | null {
  if (state) return state.messaging

  let raw: string | null = null
  if (env.FCM_SERVICE_ACCOUNT_JSON && env.FCM_SERVICE_ACCOUNT_JSON.trim() !== '') {
    raw = env.FCM_SERVICE_ACCOUNT_JSON
  } else if (env.FCM_SERVICE_ACCOUNT_PATH && env.FCM_SERVICE_ACCOUNT_PATH.trim() !== '') {
    try {
      raw = readFileSync(env.FCM_SERVICE_ACCOUNT_PATH, 'utf8')
    } catch (err) {
      console.error('[fcm] не удалось прочитать FCM_SERVICE_ACCOUNT_PATH:', err)
      state = { enabled: false, messaging: null }
      return null
    }
  }

  if (!raw) {
    if (!warnedDisabled) {
      console.warn('[fcm] FCM не настроен (нет FCM_SERVICE_ACCOUNT_JSON/PATH) — push на Android отключён')
      warnedDisabled = true
    }
    state = { enabled: false, messaging: null }
    return null
  }

  try {
    const serviceAccount = JSON.parse(raw) as admin.ServiceAccount
    // Переиспользуем уже созданное приложение (на случай повторной инициализации).
    const app = admin.apps.length > 0 && admin.apps[0]
      ? admin.apps[0]
      : admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
    const messaging = admin.messaging(app)
    state = { enabled: true, messaging }
    return messaging
  } catch (err) {
    console.error('[fcm] не удалось инициализировать Firebase Admin SDK:', err)
    state = { enabled: false, messaging: null }
    return null
  }
}

// Токены, которые FCM считает недействительными — их нужно удалить из БД.
const INVALID_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
])

/** Кладёт значение в data только если оно задано (FCM data принимает лишь строки). */
function putData(data: Record<string, string>, key: string, value: string | undefined): void {
  if (value !== undefined && value !== null && value !== '') data[key] = value
}

/**
 * Отправляет push на Android через FCM. Сообщение DATA-ONLY (без notification):
 * клиент всегда сам строит уведомление в InfyFirebaseMessagingService → AppNotifier,
 * даже когда приложение убито. Это важно, чтобы работали настройки пользователя
 * (звук/вибрация/баннеры выбирают канал) и подавление в открытом чате. Если слать
 * notification-блок, система при фоне/убитом процессе показала бы баннер сама,
 * минуя нашу логику каналов и настроек.
 * Возвращает список токенов, которые FCM пометил недействительными — вызывающий
 * код должен удалить их из БД. Если FCM не настроен — нооп (пустой список).
 */
export async function sendFcm(
  tokens: string[],
  payload: PushPayload,
): Promise<{ invalidTokens: string[] }> {
  const messaging = getMessaging()
  if (!messaging || tokens.length === 0) return { invalidTokens: [] }

  const data: Record<string, string> = {}
  putData(data, 'title', payload.title)
  putData(data, 'body', payload.body)
  putData(data, 'url', payload.url)
  putData(data, 'tag', payload.tag)
  // Явный тип пуша, чтобы Android строил уведомление и навигацию детерминированно,
  // не угадывая по тексту. Выводим из tag: 'call' → звонок, 'reminder:*' → напоминание,
  // иначе tag несёт chatId сообщения (см. socket.server.ts).
  const tag = payload.tag
  if (tag === 'call') {
    data.type = 'call'
  } else if (tag && tag.startsWith('reminder:')) {
    data.type = 'reminder'
  } else if (tag) {
    data.type = 'message'
    // Для сообщений tag === chatId — дублируем явно для однозначной навигации.
    data.chatId = tag
  }

  try {
    const res = await messaging.sendEachForMulticast({
      tokens,
      // Без notification-блока: data-only, чтобы сервис клиента вызывался даже
      // при убитом процессе и сам строил уведомление (каналы/настройки/навигация).
      data,
      android: { priority: 'high' },
    })

    const invalidTokens: string[] = []
    res.responses.forEach((r, i) => {
      if (!r.success && r.error && INVALID_TOKEN_CODES.has(r.error.code)) {
        invalidTokens.push(tokens[i])
      }
    })
    return { invalidTokens }
  } catch (err) {
    console.error('[fcm] ошибка отправки multicast:', err)
    return { invalidTokens: [] }
  }
}
