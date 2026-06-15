# Infy Messenger — Полная спецификация

Документ описывает архитектуру, модель данных, API и принципы безопасности
проекта в его текущем состоянии. Терминология и эндпоинты соответствуют коду.

---

## Обзор архитектуры

### Роли сервисов (единый кодстек, несколько runtime-ролей)

Роль выбирается переменной окружения `SERVICE_ROLE`.

```
┌─────────────────────────────────────────────────────────────┐
│                          nginx                                │
│  app.DOMAIN   → статика фронтенда / Vite dev-proxy            │
│  api.DOMAIN   → core     (REST API,    порт 3001)             │
│  ws.DOMAIN    → realtime (Socket.IO,   порт 3002)             │
│  media.DOMAIN → media    (файлы,       порт 3003)             │
└────────┬───────────┬──────────────┬───────────────┬──────────┘
         │           │              │               │
    ┌────▼────┐ ┌────▼──────┐ ┌─────▼─────┐    ┌────▼──────┐
    │  core   │ │ realtime  │ │   media   │    │ scheduler │
    │ REST    │ │ Socket.IO │ │ upload/   │    │ воркер    │
    │ auth    │ │ presence  │ │ transcode │    │ напомина- │
    │ profile │ │ сигналинг │ │           │    │ ний       │
    │ messages│ │ звонков   │ │           │    │           │
    └────┬────┘ └────┬──────┘ └─────┬─────┘    └────┬──────┘
         │           │              │               │
    ┌────▼───────────▼──────────────▼───────────────▼────┐
    │                  PostgreSQL 16                       │
    └──────────────────────────────────────────────────────┘
         │           │
    ┌────▼───────────▼──────────────────────────────────────┐
    │        Redis 7 (адаптер + присутствие + rate-limit)    │
    └──────────────────────────────────────────────────────┘
         │                              │
    ┌────▼──────────┐          ┌────────▼────────┐
    │     MinIO     │          │     coturn      │
    │ (S3-совмест.) │          │  TURN / STUN    │
    └───────────────┘          └─────────────────┘
```

### Межсервисное взаимодействие

- **core ↔ realtime**: каналы Redis pub/sub (`chat:message`, `chat:calendar`, `calendar:reminder`)
- **realtime (звонки)**: состояние звонка в Redis (`call:state:*`, `call:user:*`),
  общее для всех realtime-инстансов через `@socket.io/redis-adapter`
- **media → minio**: прямая загрузка/скачивание через S3 SDK
- **все → postgres**: общий клиент Prisma (отдельные пулы соединений на роль)
- **все → redis**: общий клиент Redis (адаптер сокетов, присутствие, rate-limit)

---

## Модель данных

Ниже — основные сущности. Полное и каноничное определение — в
[`backend/prisma/schema.prisma`](backend/prisma/schema.prisma).

### Пользователи и доступ

- **User** — `id` (BigInt, внутренний), `username` (уникальный, внешний идентификатор),
  `nickname`, `birthdate`, `avatarUrl`, `coverUrl`, `bio`, `passwordHash` (argon2id),
  `email`, `role` (`USER` | `ADMIN`), `createdAt`, `lastSeenAt`.
- **DeviceSession** — устройство/сессия: `refreshTokenHash` (уникальный), `deviceName`,
  `userAgent`, `ip`, `revokedAt`. Ротация refresh-токена при каждом `/auth/refresh`.
- **EmailVerificationToken** — только схема; флоу подтверждения email пока не включён.
- **Sanction** (Infy Shield) — модерация: `type` (`WARN` | `MUTE` | `BAN`), `reason`,
  `expiresAt`, `revokedAt`, кто выдал (`issuedById`).

### Чаты и сообщения

- **Chat** — `type` (`DIRECT` | `GROUP`), `createdAt`.
- **ChatMember** — членство: `lastReadMessageId`, `lastReadAt` (для непрочитанных и галочек).
- **Message** — `id` (ULID, упорядочен по времени), `chatId`, `senderId`, `content`,
  `type` (`TEXT` | `IMAGE` | `VIDEO` | `AUDIO` | `CIRCLE_VIDEO` | `SYSTEM`),
  `editedAt`, `deletedAt` (мягкое удаление), `pinnedAt`, `replyToId`.
- **Attachment** — вложение: `storageKey` (MinIO), `mimeType`, `sizeBytes`, `width`,
  `height`, `durationMs`, `thumbnailKey`, `waveform` (для аудио).
- **MessageReaction** — реакции: `(messageId, userId, emoji)` уникальны.

### Календарь

- **CalendarCategory** — пользовательская категория событий в чате (`name`, `color`).
- **CalendarEvent** — событие: `title`, `notes`, `eventAt`, `allDay`,
  категория = пресет (`presetKey`) либо пользовательская (`categoryId`).
- **EventReminder** — напоминание: `offsetMin`, `target` (`SELF` | `PARTNER` | `BOTH`),
  `notify`, `fireAt` (для выборки воркером), `sentAt`.
- **ReminderDelivery** — факт доставки (дедупликация и история).
- **ChatCalendarSetting** — тумблер получения напоминаний из календаря чата.

### Звонки

- **CallSession** — звонок: `chatId`, `initiatorId`, `media` (`AUDIO` | `VIDEO`),
  `status` (`RINGING` | `ACTIVE` | `ENDED` | `MISSED` | `DECLINED` | `CANCELLED` | `FAILED`),
  `createdAt`, `answeredAt`, `endedAt`, `durationSec`.
- **CallParticipant** — участник звонка: `joinedAt`, `leftAt`. Вынесен отдельно —
  схема готова к групповым звонкам (не два FK, а массив участников).

### Push

- **PushSubscription** — подписка web-push: `endpoint` (уникальный), `p256dh`, `auth`.

---

## API-эндпоинты

Все ответы: `{ data: T }` при успехе, `{ error: { code, message } }` при ошибке.
Пагинация — курсорная: `{ data: T[], nextCursor: string | null }`.
Авторизация — заголовок `Authorization: Bearer <accessToken>`.

### Авторизация — `/auth`
| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/auth/register` | Регистрация |
| POST | `/auth/login` | Вход (возвращает access + refresh) |
| POST | `/auth/refresh` | Ротация refresh-токена |
| POST | `/auth/logout` | Отзыв текущей сессии |

### Профиль — `/profile`
| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/profile/me` | Свой профиль |
| PATCH | `/profile/me` | Обновить профиль |
| POST | `/profile/me/avatar` | Загрузить аватар |
| POST | `/profile/me/cover` | Загрузить обложку |
| GET | `/profile/:username` | Публичный профиль |

### Сессии устройств — `/sessions`
| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/sessions` | Список устройств |
| DELETE | `/sessions/:id` | Отозвать конкретную сессию |
| POST | `/sessions/logout-all` | Выйти на всех устройствах |

### Чаты и сообщения — `/chats`
| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/chats` | Список чатов |
| POST | `/chats` | Создать/получить личный чат |
| GET | `/chats/partner/:partnerId` | Чат с пользователем |
| GET | `/chats/:id/messages` | История сообщений (курсор) |
| POST | `/chats/:id/messages` | Отправить сообщение |
| GET | `/chats/:id/media` | Медиа-вложения чата |
| PATCH | `/chats/messages/:id` | Редактировать сообщение |
| DELETE | `/chats/messages/:id` | Удалить (мягко) |
| POST | `/chats/messages/:id/react` | Реакция |
| POST | `/chats/messages/:id/pin` | Закрепить/открепить |
| GET | `/chats/:id/pinned` | Закреплённое сообщение |

### Календарь — `/calendar`
| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/calendar/:chatId/events` | События чата |
| POST | `/calendar/:chatId/events` | Создать событие |
| PUT | `/calendar/events/:eventId` | Изменить событие |
| DELETE | `/calendar/events/:eventId` | Удалить событие |
| GET | `/calendar/:chatId/categories` | Категории |
| POST | `/calendar/:chatId/categories` | Создать категорию |
| DELETE | `/calendar/categories/:categoryId` | Удалить категорию |
| GET | `/calendar/:chatId/settings` | Настройки напоминаний |
| PATCH | `/calendar/:chatId/settings` | Обновить настройки |

### Звонки — `/calls`
| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/calls/ice` | ICE-серверы (STUN + time-limited TURN) |
| GET | `/calls/history` | История звонков (курсор) |

Сигналинг звонков идёт по Socket.IO — см. [docs/CALLS.md](docs/CALLS.md).

### Медиа — `/media`
| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/media/upload` | Загрузка файла |
| GET | `/media/avatars/*` | Раздача аватаров |
| GET | `/media/:encodedKey` | Раздача/редирект на presigned-URL |

### Infy Pulse (ИИ) — `/ai`
| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/ai/status` | Включён ли ИИ (есть ли ключ) |
| POST | `/ai/chats/:chatId/summary` | Сводка диалога |
| POST | `/ai/chats/:chatId/replies` | Варианты ответа |

### Push — `/push`
| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/push/vapid-public-key` | Публичный VAPID-ключ |
| POST | `/push/subscribe` | Сохранить подписку |
| DELETE | `/push/subscribe` | Удалить подписку |

### Админка — `/admin/*` (только `role = ADMIN`)
| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/admin/users` | Список пользователей |
| GET | `/admin/users/:id` | Пользователь |
| PATCH | `/admin/users/:id` | Изменить пользователя |
| GET | `/admin/users/:id/messages` | История сообщений пользователя |
| GET | `/admin/moderation/sanctions` | Список санкций |
| POST | `/admin/moderation/sanctions` | Выдать санкцию |
| DELETE | `/admin/moderation/sanctions/:id` | Снять санкцию |
| GET | `/admin/stats` | Сводная статистика |
| GET | `/admin/stats/analytics` | Аналитика |
| GET | `/admin/containers` | Список контейнеров |
| POST | `/admin/containers/:id/restart` | Перезапуск контейнера |
| GET | `/admin/containers/:id/logs` | Логи контейнера |

### Health
| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/health` | Проверка состояния сервиса |

---

## События Socket.IO

### Чат и присутствие

Клиент → сервер: `join_chat`, `send_message`, `mark_read`, `typing_start`,
`typing_stop`, `ping`.

Сервер → клиент: `message_new`, `message_edited`, `message_updated`,
`message_deleted`, `messages_read`, `typing`, `user_online`, `user_offline`,
`online_users`, `reminder_due`, `pong`.

### Звонки

Клиент → сервер: `call:invite`, `call:accept`, `call:decline`, `call:cancel`,
`call:hangup`, `call:failed`, `call:signal`, `call:media-state`.

Сервер → клиент: `call:incoming`, `call:ringing`, `call:accepted`, `call:signal`,
`call:media-state`, `call:ended`, `call:taken-elsewhere`, `call:peer-busy`.

Полный протокол и поток установки — в [docs/CALLS.md](docs/CALLS.md).

---

## Стратегия JWT

- **Access-токен**: короткоживущий (15 мин), HS256, payload `{ sub, username, role, sessionId }`.
- **Refresh-токен**: долгоживущий (30 дней), хранится в виде хэша в `DeviceSession.refreshTokenHash`.
- При refresh: проверка хэша → новая пара → обновление хэша (ротация) → возврат токенов.
- При выходе: проставляется `revokedAt` у `DeviceSession`.
- Refresh-токен передаётся в теле запроса (не в cookie) — для совместимости с мобильными клиентами.

---

## Rate-limiting

```
POST /auth/register  → 5 запросов / 1 час / IP
POST /auth/login     → 10 запросов / 15 мин / IP
глобально (API)      → 100 запросов / 1 мин / IP
```

Все пороги настраиваются через переменные окружения (`RATE_LIMIT_*`).
Реализация — `@fastify/rate-limit` с хранилищем в Redis. Реальный IP берётся из
`X-Forwarded-For` / `X-Real-IP` (nginx; `trustProxy` включён только для известного IP).

---

## Безопасность

- **Пароли**: argon2id.
- **Токены**: access не хранится на сервере; refresh — в виде хэша.
- **Звонки**: медиа шифруется DTLS/SRTP (часть WebRTC); сервер видит только
  зашифрованный трафик при relay через TURN. TURN-credentials временные (HMAC),
  запрещён relay в приватные/loopback-сети.
- **Загрузка файлов**: проверка MIME, лимиты размера, хранение в MinIO (не на ФС).
- **Доступ к Docker (админка)**: через docker-socket-proxy со строгим allowlist,
  без прямого монтирования docker.sock в бэкенд.
- **SQL-инъекции**: параметризованные запросы Prisma.
- **XSS**: React экранирует по умолчанию; CSP-заголовки через nginx.
- **CORS**: явный allowlist.
- **TLS**: Let's Encrypt через certbot, автопродление.
- **Модерация (Infy Shield)**: предупреждения, временные муты, баны.

---

## Переменные окружения

Полный список со значениями по умолчанию и описанием — в
[`.env.example`](.env.example).

Ключевые группы:
- `DATABASE_URL` — строка подключения Postgres
- `REDIS_URL` — строка подключения Redis
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` — ключи подписи
- `MINIO_*` — подключение и доступы MinIO
- `RATE_LIMIT_*` — пороги rate-limit
- `VAPID_*` — ключи web-push
- `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` — ИИ (Infy Pulse), опционально
- `STUN_URLS`, `TURN_URLS`, `TURN_SECRET`, `TURN_TTL_SEC`, `TURN_REALM`, `TURN_EXTERNAL_IP` — звонки
- `SERVICE_ROLE` — `core` | `realtime` | `media` | `scheduler`
