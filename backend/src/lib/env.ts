import { z } from 'zod'

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  SERVICE_ROLE: z.enum(['core', 'realtime', 'media', 'scheduler']).default('core'),
  PORT: z.coerce.number().default(3001),
  LOG_LEVEL: z.string().default('info'),

  DATABASE_URL: z.string(),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),

  MINIO_ENDPOINT: z.string().default('localhost'),
  MINIO_PORT: z.coerce.number().default(9000),
  MINIO_USE_SSL: z.string().transform(v => v === 'true').default('false'),
  MINIO_ROOT_USER: z.string(),
  MINIO_ROOT_PASSWORD: z.string(),
  MINIO_BUCKET_AVATARS: z.string().default('avatars'),
  MINIO_BUCKET_MEDIA: z.string().default('media'),
  MINIO_PUBLIC_URL: z.string().default('http://localhost:9000'),

  DOCKER_PROXY_URL: z.string().default('http://socket-proxy:2375'),

  // Публичный URL фронтенда — для построения ссылок (например, смены пароля).
  // Берём первый из CORS_ORIGINS, если не задан явно.
  APP_PUBLIC_URL: z.string().default(''),

  // ── Почта (smtp.bz HTTP API) ───────────────────────────────
  // API-ключ из кабинета smtp.bz. Пусто = отправка писем отключена
  // (привязка почты/смена username будут недоступны).
  SMTP_BZ_API_KEY: z.string().default(''),
  // Адрес и имя отправителя (домен должен быть подтверждён в smtp.bz).
  MAIL_FROM: z.string().default('no-reply@infyme.ru'),
  MAIL_FROM_NAME: z.string().default('Infy'),

  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  TRUSTED_PROXY: z.string().default('127.0.0.1'),

  RATE_LIMIT_REGISTER_MAX: z.coerce.number().default(5),
  RATE_LIMIT_REGISTER_WINDOW_MS: z.coerce.number().default(3_600_000),
  RATE_LIMIT_LOGIN_MAX: z.coerce.number().default(10),
  RATE_LIMIT_LOGIN_WINDOW_MS: z.coerce.number().default(900_000),
  RATE_LIMIT_GLOBAL_MAX: z.coerce.number().default(100),
  RATE_LIMIT_GLOBAL_WINDOW_MS: z.coerce.number().default(60_000),

  VAPID_PUBLIC_KEY: z.string().min(1),
  VAPID_PRIVATE_KEY: z.string().min(1),
  VAPID_SUBJECT: z.string().default('mailto:admin@example.com'),

  // AI (Infy Pulse) — опционально: без ключа фича отключена, остальное работает.
  // Провайдер, модель и ключ можно переопределить из админки (таблица app_settings);
  // переменные окружения служат значениями по умолчанию / фолбэком.
  AI_PROVIDER: z.enum(['ANTHROPIC', 'OPENAI']).default('ANTHROPIC'),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-opus-4-8'),
  ANTHROPIC_BASE_URL: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-4o'),
  // Кастомный base URL для OpenAI-совместимых провайдеров (Artemox, OpenRouter, …).
  OPENAI_BASE_URL: z.string().optional(),

  // ── Звонки / WebRTC ICE ────────────────────────────────────
  // Публичные STUN-серверы (через запятую). Помогают узнать внешний адрес.
  STUN_URLS: z.string().default('stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302'),
  // URL(ы) собственного TURN (coturn). Пусто = TURN не выдаётся (только STUN).
  // Пример: turn:turn.example.com:3478,turns:turn.example.com:5349
  TURN_URLS: z.string().default(''),
  // Общий секрет coturn (static-auth-secret / use-auth-secret).
  // Бэкенд по нему генерирует time-limited credentials (REST API TURN).
  TURN_SECRET: z.string().default(''),
  // Срок жизни выданных TURN-credentials в секундах.
  TURN_TTL_SEC: z.coerce.number().default(3600),
})

const parsed = schema.safeParse(process.env)
if (!parsed.success) {
  console.error('Invalid environment variables:')
  console.error(parsed.error.flatten().fieldErrors)
  process.exit(1)
}

export const env = parsed.data
