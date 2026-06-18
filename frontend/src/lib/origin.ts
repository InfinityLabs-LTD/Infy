// Рантайм-резолв адреса origin (API + WebSocket).
//
// Приложение раздаётся с двух доменов:
//   • infinity-cloud.ru      — origin напрямую, всё работает как обычно (относительные пути).
//   • cdn.infinity-cloud.ru  — статика через CDN. CDN пропускает только GET/HEAD/OPTIONS,
//     поэтому API (POST/PUT/…) и WebSocket нельзя гонять через него — их направляем
//     напрямую на origin-домен, минуя CDN.
//
// Определяем по hostname в рантайме, чтобы один и тот же билд работал на обоих доменах.

// Домен origin, на который уходят API/WS-запросы, когда страница открыта через CDN.
const ORIGIN_HOST = 'https://infinity-cloud.ru'

// true, если текущая страница открыта через CDN-домен (cdn.*).
function isCdnHost(): boolean {
  if (typeof window === 'undefined') return false
  return window.location.hostname.startsWith('cdn.')
}

// Базовый origin для абсолютных запросов к API/WS.
// На CDN-домене — основной домен; иначе — текущий origin (пустая строка = относительные пути).
export function originBase(): string {
  return isCdnHost() ? ORIGIN_HOST : ''
}

// Базовый URL для REST API.
// На CDN-домене абсолютный (https://infinity-cloud.ru/api), иначе — из env (по умолчанию /api).
export function apiBaseUrl(): string {
  if (isCdnHost()) return `${ORIGIN_HOST}/api`
  return import.meta.env.VITE_API_URL ?? '/api'
}

// URL для Socket.IO. Пустая строка → подключение к текущему origin.
export function socketUrl(): string {
  return originBase()
}
