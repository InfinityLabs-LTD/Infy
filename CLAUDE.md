# Infy Messenger — Руководство разработчика

## Технологический стек

| Слой | Технология |
|------|-----------|
| Среда бэкенда | Node.js 20 + TypeScript |
| API-фреймворк | Fastify 4 |
| ORM | Prisma 5 |
| Реальное время | Socket.IO 4 |
| Звонки | WebRTC (mesh P2P), STUN/TURN (coturn), DTLS/SRTP |
| Авторизация | JWT (access 15 мин + refresh 30 дней), argon2id |
| Валидация | Zod |
| База данных | PostgreSQL 16 |
| Кэш / PubSub | Redis 7 |
| Хранилище файлов | MinIO (S3-совместимое) |
| ИИ | Claude (Anthropic SDK) |
| Фронтенд | React 18 + Vite + Tailwind CSS + Zustand + Framer Motion |
| Прокси | nginx + certbot (Let's Encrypt) |
| Инфраструктура | Docker Compose |

## Структура проекта

```
/
├── backend/              # API-сервер (модульный монолит)
│   ├── src/
│   │   ├── modules/
│   │   │   ├── auth/      # регистрация, вход, refresh, выход
│   │   │   ├── profile/   # профиль (CRUD), аватар, обложка
│   │   │   ├── sessions/  # управление сессиями устройств
│   │   │   ├── chat/      # сообщения, реакции, закрепление
│   │   │   ├── calendar/  # события и напоминания в чате
│   │   │   ├── calls/     # звонки: сервис, роуты, сигналинг
│   │   │   ├── media/     # файлы, транскодинг
│   │   │   ├── ai/        # Infy Pulse (сводка, варианты ответа)
│   │   │   ├── push/      # web-push (VAPID)
│   │   │   ├── admin/     # пользователи, модерация, статистика, контейнеры
│   │   │   ├── realtime/  # Socket.IO-шлюз + сигналинг звонков
│   │   │   └── scheduler/ # воркер доставки напоминаний
│   │   ├── plugins/      # fastify-плагины (prisma, redis, minio, rate-limit)
│   │   ├── middleware/   # auth-guard, role-guard
│   │   ├── lib/          # общие утилиты (jwt, turn, presence, webpush, …)
│   │   └── server.ts     # точка входа
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/
│   ├── Dockerfile
│   └── package.json
├── frontend/             # React web-клиент
│   ├── src/
│   │   ├── api/          # axios-клиент + типизированные эндпоинты
│   │   ├── components/   # UI-компоненты (chat, call, ui, auth, …)
│   │   ├── pages/        # страницы-маршруты
│   │   ├── hooks/        # кастомные хуки
│   │   ├── store/        # состояние (Zustand)
│   │   ├── lib/          # socket, webrtc, callController, …
│   │   └── main.tsx
│   ├── Dockerfile
│   └── package.json
├── mobile/               # зарезервировано под нативные приложения
├── nginx/
│   ├── dev.conf          # localhost, без TLS
│   └── prod.conf         # домен + TLS
├── coturn/
│   └── turnserver.conf   # конфиг TURN-сервера
├── docs/
│   └── CALLS.md          # система звонков
├── docker-compose.yml
├── .env.example
├── install.sh            # интерактивный деплой на Ubuntu VPS
├── SPEC.md               # полная спецификация
├── CLAUDE.md             # этот файл
└── README.md
```

## Команды

### Локальная разработка

```bash
# Запустить всю инфраструктуру (postgres, redis, minio, nginx)
docker compose up -d postgres redis minio nginx

# (опционально) TURN-сервер для звонков за NAT
docker compose up -d coturn

# Бэкенд (hot reload)
cd backend && npm run dev

# Фронтенд (hot reload)
cd frontend && npm run dev

# Всё через Docker
docker compose up -d
```

### База данных

```bash
# Применить миграции
cd backend && npx prisma migrate dev

# Сгенерировать Prisma-клиент
cd backend && npx prisma generate

# Открыть Prisma Studio
cd backend && npx prisma studio

# Сбросить БД (только для разработки)
cd backend && npx prisma migrate reset
```

### Docker

```bash
# Сборка образов
docker compose build

# Запуск всех сервисов
docker compose up -d

# Логи
docker compose logs -f [сервис]

# Остановка
docker compose down

# Остановка + удаление томов (РАЗРУШИТЕЛЬНО)
docker compose down -v
```

## Роли сервисов

Образ бэкенда работает в одной из ролей, задаваемой переменной `SERVICE_ROLE`:

| Роль | Порт | Ответственность |
|------|------|-----------------|
| `core` | 3001 | REST API: авторизация, профиль, сообщения, медиа-метаданные, календарь, ИИ, админка |
| `realtime` | 3002 | Socket.IO-шлюз, присутствие, pub/sub, **сигналинг звонков** |
| `media` | 3003 | Загрузка файлов, транскодинг, интеграция с MinIO |
| `scheduler` | — | Фоновый воркер: доставка напоминаний календаря (push + realtime) |

## Соглашения

### TypeScript

- Включён strict mode
- Никакого `any` — использовать `unknown` и сужать тип
- Zod-схемы для валидации запросов/ответов
- Типы Prisma для моделей БД; никогда не отдавать сырые строки БД через API

### Дизайн API

- REST: URL по существительным, стандартные HTTP-методы
- Все ответы: `{ data: T }` при успехе, `{ error: { code, message } }` при ошибке
- Пагинация: курсорная — `{ data: T[], nextCursor: string | null }`
- HTTP-коды: 200 OK, 201 Created, 204 No Content, 400 Bad Request, 401 Unauthorized,
  403 Forbidden, 404 Not Found, 409 Conflict, 429 Too Many Requests, 500 Internal Server Error

### Поток авторизации

```
Регистрация → POST /auth/register → { accessToken, refreshToken, user }
Вход         → POST /auth/login    → { accessToken, refreshToken, user }
Refresh      → POST /auth/refresh  (body: { refreshToken }) → { accessToken, refreshToken }
Выход        → POST /auth/logout   (bearer) → 204
```

Access-токен в заголовке `Authorization: Bearer <token>`.
Refresh-токен в теле запроса (не в cookie) — для совместимости с мобильными клиентами.

### Git

- Ветки: `main` (продакшен), `dev` (интеграция), `feature/*`
- Сообщения коммитов: повелительное наклонение, `тип: описание`
  (feat, fix, chore, docs), **на русском языке**
- Коммит создаётся **до** деплоя

### Коды ошибок

Кастомные коды для клиентской i18n:

```
AUTH_USER_NOT_FOUND
AUTH_INVALID_PASSWORD
AUTH_USERNAME_TAKEN
AUTH_EMAIL_TAKEN
AUTH_TOKEN_EXPIRED
AUTH_TOKEN_INVALID
AUTH_SESSION_REVOKED
PROFILE_USERNAME_INVALID
CHAT_NOT_MEMBER
MESSAGE_NOT_FOUND
REACTION_LIMIT
CALL_ALREADY_ACTIVE
CALL_GROUP_UNSUPPORTED
MOD_ACCOUNT_BANNED
MOD_ACCOUNT_MUTED
MOD_SELF_SANCTION
REPORT_SELF
RATE_LIMIT_EXCEEDED
AI_DISABLED
TRANSCRIBE_DISABLED
TRANSCRIBE_UNSUPPORTED
TRANSCRIBE_FAILED
BACKUP_FAILED
BACKUP_NOT_FOUND
BACKUP_NO_FILE
BACKUP_BAD_FILE
BACKUP_TOO_LARGE
BACKUP_UPLOAD_FAILED
BACKUP_RESTORE_FAILED
BACKUP_CONFIRM_REQUIRED
```

## Порты (локальная разработка)

| Сервис | Порт |
|--------|------|
| nginx | 80 |
| core (бэкенд) | 3001 |
| realtime | 3002 |
| media | 3003 |
| PostgreSQL | 5432 |
| Redis | 6379 |
| MinIO API | 9000 |
| Консоль MinIO | 9001 |
| Фронтенд (Vite) | 5173 |
| coturn (TURN/STUN) | 3478, 5349, 49152–65535/udp |

## Документация API

Swagger UI: `http://localhost:3001/docs` (при запущенном core).
OpenAPI JSON: `http://localhost:3001/docs/json`.

Система звонков (протокол сигналинга, безопасность, план масштабирования):
[docs/CALLS.md](docs/CALLS.md).
