import { env } from './env.js'

// Отправка писем через HTTP API smtp.bz.
// Документация: https://docs.smtp.bz/#/api
// Эндпоинт: POST https://api.smtp.bz/v1/smtp/send
// Авторизация: заголовок Authorization с сырым API-ключом (без префикса).

const SEND_URL = 'https://api.smtp.bz/v1/smtp/send'

export interface SendMailInput {
  to: string
  toName?: string
  subject: string
  html: string
  text?: string
}

// Включена ли отправка писем (задан ли API-ключ).
export function mailEnabled(): boolean {
  return env.SMTP_BZ_API_KEY.length > 0
}

/**
 * Отправляет письмо через smtp.bz. Бросает ошибку при неуспехе.
 * Вызывающий код должен предварительно проверять mailEnabled().
 */
export async function sendMail(input: SendMailInput): Promise<void> {
  if (!mailEnabled()) {
    throw new Error('SMTP_BZ_API_KEY is not configured — email sending is disabled')
  }

  const body = {
    name: env.MAIL_FROM_NAME,
    from: env.MAIL_FROM,
    to: input.to,
    ...(input.toName && { to_name: input.toName }),
    subject: input.subject,
    html: input.html,
    ...(input.text && { text: input.text }),
  }

  // Таймаут, чтобы запрос не висел вечно, если API недоступен.
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)

  let res: Response
  try {
    res = await fetch(SEND_URL, {
      method: 'POST',
      headers: {
        'Authorization': env.SMTP_BZ_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`smtp.bz responded ${res.status}: ${detail.slice(0, 500)}`)
  }
}

// Письмо с кодом подтверждения почты.
export async function sendVerificationCode(to: string, code: string): Promise<void> {
  const subject = `Код подтверждения Infy: ${code}`
  const html = `<!doctype html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;background:#0B1020;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#E5E7EB;padding:32px">
  <div style="max-width:440px;margin:0 auto;background:#11162a;border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:32px;text-align:center">
    <h1 style="margin:0 0 8px;font-size:20px;color:#fff">Подтверждение почты</h1>
    <p style="margin:0 0 24px;font-size:14px;color:#9CA3AF">Введите этот код в приложении Infy, чтобы привязать почту:</p>
    <div style="font-size:34px;font-weight:700;letter-spacing:8px;color:#C084FC;background:rgba(168,85,247,0.12);border-radius:12px;padding:16px 0">${code}</div>
    <p style="margin:24px 0 0;font-size:12px;color:#6B7280">Код действует 15 минут. Если вы не запрашивали привязку почты — просто проигнорируйте это письмо.</p>
  </div>
</body></html>`
  const text = `Код подтверждения Infy: ${code}\nВведите его в приложении, чтобы привязать почту. Код действует 15 минут.`
  await sendMail({ to, subject, html, text })
}
