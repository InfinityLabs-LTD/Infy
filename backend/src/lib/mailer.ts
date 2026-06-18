import nodemailer from 'nodemailer'
import { PrismaClient } from '@prisma/client'
import { getMailConfig, mailAvailable, MailConfig } from './mailSettings.js'

// Отправка писем по SMTP (nodemailer). Конфигурация берётся из app_settings
// (раздел «Почта» в админке) с фолбэком на переменные окружения — см. mailSettings.ts.
// Параметры SMTP выдаёт провайдер (напр. smtp.bz: host/port/login/password).

export interface SendMailInput {
  to: string
  toName?: string
  subject: string
  html: string
  text?: string
}

function buildTransport(cfg: MailConfig) {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure, // true для 465, false для 587/25 (STARTTLS)
    auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
  })
}

function fromHeader(cfg: MailConfig): string {
  return cfg.fromName ? `"${cfg.fromName}" <${cfg.from}>` : cfg.from
}

// Включена ли отправка писем (по текущей конфигурации).
export async function mailEnabled(prisma: PrismaClient): Promise<boolean> {
  return mailAvailable(prisma)
}

// Реэкспорт для использования в других модулях без прямого импорта mailSettings.
export { mailAvailable }

/**
 * Отправляет письмо по SMTP. Бросает ошибку при неуспехе.
 * Вызывающий код должен предварительно проверять mailEnabled().
 */
export async function sendMail(prisma: PrismaClient, input: SendMailInput): Promise<void> {
  const cfg = await getMailConfig(prisma)
  if (!cfg.host) {
    throw new Error('SMTP host is not configured — email sending is disabled')
  }

  const transport = buildTransport(cfg)
  await transport.sendMail({
    from: fromHeader(cfg),
    to: input.toName ? `"${input.toName}" <${input.to}>` : input.to,
    subject: input.subject,
    html: input.html,
    ...(input.text && { text: input.text }),
  })
}

// Проверочное письмо из админки — подтверждает, что SMTP настроен верно.
export async function sendTestEmail(prisma: PrismaClient, to: string): Promise<void> {
  const subject = 'Infy — проверка отправки почты'
  const html = `<!doctype html><html><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111;padding:24px">
  <h2 style="margin:0 0 8px">Почта настроена ✅</h2>
  <p style="margin:0;color:#555">Это тестовое письмо от Infy. Если вы его получили — SMTP работает.</p>
</body></html>`
  await sendMail(prisma, { to, subject, html, text: 'Тестовое письмо от Infy. SMTP работает.' })
}

// Письмо со ссылкой для сброса пароля.
export async function sendPasswordResetEmail(prisma: PrismaClient, to: string, resetUrl: string): Promise<void> {
  const subject = 'Infy — сброс пароля'
  const html = `<!doctype html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;background:#0B1020;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#E5E7EB;padding:32px">
  <div style="max-width:440px;margin:0 auto;background:#11162a;border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:32px;text-align:center">
    <h1 style="margin:0 0 8px;font-size:20px;color:#fff">Сброс пароля</h1>
    <p style="margin:0 0 24px;font-size:14px;color:#9CA3AF">
      Вы запросили сброс пароля для аккаунта Infy. Нажмите кнопку ниже:
    </p>
    <a href="${resetUrl}"
       style="display:inline-block;background:linear-gradient(135deg,#7C3AED,#A855F7);color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:14px 32px;border-radius:12px">
      Сбросить пароль
    </a>
    <p style="margin:24px 0 0;font-size:12px;color:#6B7280">
      Ссылка действует 24 часа. Если вы не запрашивали сброс пароля — просто проигнорируйте это письмо.
    </p>
  </div>
</body></html>`
  const text = `Сброс пароля Infy\nПерейдите по ссылке, чтобы задать новый пароль:\n${resetUrl}\nСсылка действует 24 часа.`
  await sendMail(prisma, { to, subject, html, text })
}

// Письмо с кодом подтверждения почты.
export async function sendVerificationCode(prisma: PrismaClient, to: string, code: string): Promise<void> {
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
  await sendMail(prisma, { to, subject, html, text })
}
