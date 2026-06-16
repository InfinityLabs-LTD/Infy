// Утилиты часовых поясов. Все моменты времени (eventAt, fireAt) хранятся как
// абсолютные UTC-инстанты — поэтому само срабатывание напоминаний одинаково
// для всех. Различается только ОТОБРАЖЕНИЕ: каждый пользователь видит время в
// своём поясе. Эти хелперы форматируют дату в конкретной IANA-зоне.

const DEFAULT_TZ = 'UTC'

// Проверка валидности IANA-зоны (через попытку отформатировать).
export function isValidTimezone(tz: string): boolean {
  if (!tz) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

// Нормализует пояс: валидный IANA или DEFAULT_TZ.
export function safeTimezone(tz?: string | null): string {
  return tz && isValidTimezone(tz) ? tz : DEFAULT_TZ
}

// Человекочитаемое время в поясе пользователя, напр. «17 июня, 19:00».
export function formatInTz(
  date: Date,
  tz: string | null | undefined,
  opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' },
): string {
  return date.toLocaleString('ru-RU', { timeZone: safeTimezone(tz), ...opts })
}

// Только время (ЧЧ:ММ) в поясе пользователя.
export function formatTimeInTz(date: Date, tz: string | null | undefined): string {
  return date.toLocaleTimeString('ru-RU', { timeZone: safeTimezone(tz), hour: '2-digit', minute: '2-digit' })
}

// Смещение зоны от UTC в минутах для заданного инстанта (DST-aware).
function tzOffsetMinutes(date: Date, tz: string): number {
  // Сравниваем «как это время выглядит в UTC» и «как в целевой зоне».
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const parts = dtf.formatToParts(date)
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value)
  const asUTC = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return (asUTC - date.getTime()) / 60_000
}

// Интерпретирует «наивную» дату-время (без оффсета, напр. "2026-06-20T18:30:00"
// или "2026-06-20 18:30") как локальную для зоны tz и возвращает корректный
// UTC-инстант. Если строка уже содержит оффсет/Z — берём как есть.
// Используется для дат, которые называет пользователь/модель: «завтра 19:00»
// в его поясе должно сохраниться как соответствующий момент UTC.
export function parseInTz(input: string, tz: string | null | undefined): Date | null {
  const s = input.trim()
  // Уже есть зона (Z или ±HH:MM) — стандартный разбор.
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(s)) {
    const d = new Date(s)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/)
  if (!m) {
    const d = new Date(s)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const [, y, mo, da, h, mi, se] = m
  const zone = safeTimezone(tz)
  // Предполагаем, что введённое время — это «стенные часы» в зоне zone.
  // Берём UTC из тех же чисел, затем корректируем на смещение зоны.
  const guess = Date.UTC(+y, +mo - 1, +da, +h, +mi, se ? +se : 0)
  const offset = tzOffsetMinutes(new Date(guess), zone)
  return new Date(guess - offset * 60_000)
}

// Короткая метка пояса для подписи, напр. «GMT+5». Используем, когда поясы
// участников различаются и нужно явно показать, по чьему времени напоминание.
export function tzShortLabel(date: Date, tz: string | null | undefined): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: safeTimezone(tz),
      timeZoneName: 'shortOffset',
    }).formatToParts(date)
    return parts.find(p => p.type === 'timeZoneName')?.value ?? safeTimezone(tz)
  } catch {
    return safeTimezone(tz)
  }
}
