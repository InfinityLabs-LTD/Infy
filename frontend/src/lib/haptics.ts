// Тактильный отклик (вибрация) с безопасным feature-detect.
//
// Vibration API поддерживается в основном Android-браузерами; iOS Safari его
// игнорирует. Вызовы из отложенных таймеров (setTimeout) Chrome может блокировать,
// если они не привязаны к пользовательскому жесту — поэтому стараемся вызывать
// vibrate внутри обработчиков указателя.
export function vibrate(pattern: number | number[] = 12): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern)
    }
  } catch {
    /* устройство/браузер не поддерживает — молча игнорируем */
  }
}
