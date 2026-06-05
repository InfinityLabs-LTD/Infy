# Infy Messenger — Full Specification

## Architecture Overview

### Service Roles (single codebase, three runtime roles)

```
┌─────────────────────────────────────────────────────────────┐
│                        nginx                                │
│  app.DOMAIN → frontend static / Vite dev proxy             │
│  api.DOMAIN → core (REST API, port 3001)                   │
│  ws.DOMAIN  → realtime (Socket.IO, port 3002)              │
│  media.DOMAIN → media service (port 3003)                  │
└────────┬────────────┬──────────────┬───────────────────────┘
         │            │              │
    ┌────▼────┐  ┌────▼──────┐  ┌───▼──────┐
    │  core   │  │ realtime  │  │  media   │
    │ REST API│  │ Socket.IO │  │ upload/  │
    │ auth    │  │ gateway   │  │ transcode│
    │ profile │  │ presence  │  │          │
    │ messages│  │ pub/sub   │  │          │
    └────┬────┘  └────┬──────┘  └───┬──────┘
         │            │              │
    ┌────▼────────────▼──────────────▼──────┐
    │            PostgreSQL 16              │
    └───────────────────────────────────────┘
         │            │
    ┌────▼────────────▼──────────────────────┐
    │     Redis (adapter + presence + RL)    │
    └────────────────────────────────────────┘
         │
    ┌────▼──────────┐
    │    MinIO      │
    │ (S3-compat)   │
    └───────────────┘
```

### Inter-service Communication

- **core ↔ realtime**: Redis pub/sub channels (`chat:message`, `user:presence`, `typing:status`)
- **core ↔ media**: REST internal API calls (media registers upload URL, core saves metadata)
- **all → postgres**: shared Prisma client (separate connection pools per role)
- **all → redis**: shared Redis client (separate DB indexes: 0=sessions, 1=presence, 2=rate-limit)
- **media → minio**: S3 SDK direct upload/download

---

## Data Model

### User

```sql
CREATE TABLE "User" (
  id             BIGINT GENERATED ALWAYS AS IDENTITY (START WITH 1) PRIMARY KEY,
  username       VARCHAR(32) UNIQUE NOT NULL,  -- lowercase, a-z0-9_
  nickname       VARCHAR(64) NOT NULL,
  birthdate      DATE,
  avatar_url     TEXT,
  password_hash  TEXT NOT NULL,
  email          VARCHAR(255) UNIQUE,          -- nullable
  email_verified_at TIMESTAMPTZ,              -- nullable
  role           TEXT NOT NULL DEFAULT 'USER', -- USER | ADMIN
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

External-facing identifier: `username`. Internal joins use `id`.

### DeviceSession

```sql
CREATE TABLE "DeviceSession" (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             BIGINT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  refresh_token_hash  TEXT NOT NULL UNIQUE,
  device_name         VARCHAR(255),
  user_agent          TEXT,
  ip                  INET,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at          TIMESTAMPTZ          -- NULL = active
);
CREATE INDEX ON "DeviceSession"(user_id);
CREATE INDEX ON "DeviceSession"(refresh_token_hash);
```

Refresh token rotation: on each `/auth/refresh` call, old hash is replaced, `last_active_at` updated.

### EmailVerificationToken (schema only — email flow not yet implemented)

```sql
CREATE TABLE "EmailVerificationToken" (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     BIGINT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ          -- NULL = unused
);
CREATE INDEX ON "EmailVerificationToken"(user_id);
```

Future: when email verification is enabled, add policy gate in auth middleware checking `emailVerifiedAt IS NOT NULL`.

### Chat (Phase 2)

```sql
CREATE TABLE "Chat" (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type        TEXT NOT NULL,  -- DIRECT | GROUP
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE "ChatMember" (
  chat_id   UUID NOT NULL REFERENCES "Chat"(id) ON DELETE CASCADE,
  user_id   BIGINT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chat_id, user_id)
);
```

### Message (Phase 2)

```sql
CREATE TABLE "Message" (
  id          UUID PRIMARY KEY,              -- UUID v7 (time-ordered)
  chat_id     UUID NOT NULL REFERENCES "Chat"(id),
  sender_id   BIGINT NOT NULL REFERENCES "User"(id),
  content     TEXT,
  type        TEXT NOT NULL DEFAULT 'TEXT',  -- TEXT | IMAGE | VIDEO | AUDIO | CIRCLE_VIDEO
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  edited_at   TIMESTAMPTZ,
  deleted_at  TIMESTAMPTZ
);
CREATE INDEX ON "Message"(chat_id, id);     -- range scans for history pagination
```

UUID v7 chosen for: time-ordered (good B-tree locality), globally unique, no sequence contention across partitions.

### Attachment (Phase 3)

```sql
CREATE TABLE "Attachment" (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id  UUID NOT NULL REFERENCES "Message"(id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL,    -- MinIO object key
  mime_type   TEXT NOT NULL,
  size_bytes  BIGINT,
  width       INT,
  height      INT,
  duration_ms INT,              -- for audio/video
  thumbnail_key TEXT            -- MinIO key for generated thumbnail
);
```

---

## API Endpoints

### Phase 1 — Auth & Profile

#### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/register` | Register new user |
| POST | `/auth/login` | Login, returns access+refresh tokens |
| POST | `/auth/refresh` | Rotate refresh token |
| POST | `/auth/logout` | Revoke current session |

#### Device Sessions
| Method | Path | Description |
|--------|------|-------------|
| GET | `/sessions` | List user's device sessions |
| DELETE | `/sessions/:id` | Revoke specific session |
| POST | `/sessions/logout-all` | Revoke all sessions (body: `{exceptCurrent?: boolean}`) |

#### Profile
| Method | Path | Description |
|--------|------|-------------|
| GET | `/profile/me` | Get own profile |
| PATCH | `/profile/me` | Update profile (nickname, username, birthdate) |
| POST | `/profile/me/avatar` | Upload avatar (multipart) |
| GET | `/users/:username` | Get public profile by username |

#### Health
| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Service health check |

### Phase 2 — Messaging

| Method | Path | Description |
|--------|------|-------------|
| GET | `/chats` | List user's chats |
| POST | `/chats` | Create direct chat |
| GET | `/chats/:id/messages` | Paginated message history |
| POST | `/chats/:id/messages` | Send message (text) |
| PATCH | `/messages/:id` | Edit message |
| DELETE | `/messages/:id` | Soft-delete message |

#### Socket.IO Events (Phase 2)
| Event (client→server) | Description |
|------------------------|-------------|
| `join_chat` | Subscribe to chat room |
| `send_message` | Send message via WS |
| `typing_start` | Start typing indicator |
| `typing_stop` | Stop typing indicator |

| Event (server→client) | Description |
|------------------------|-------------|
| `message_new` | New message in subscribed chat |
| `message_edited` | Message was edited |
| `message_deleted` | Message soft-deleted |
| `typing` | User typing status |
| `user_online` | User came online |
| `user_offline` | User went offline |

### Phase 3 — Media

| Method | Path | Description |
|--------|------|-------------|
| POST | `/media/upload` | Upload file, returns presigned URL + attachment id |
| GET | `/media/:key` | Serve/redirect to MinIO presigned download URL |

### Phase 4 — Admin

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/users` | List all users (paginated) |
| PATCH | `/admin/users/:id` | Edit user (role, ban, etc.) |
| GET | `/admin/users/:id/messages` | View user's message history |
| GET | `/admin/containers` | List containers (via docker-socket-proxy) |
| POST | `/admin/containers/:id/restart` | Restart container |
| GET | `/admin/containers/:id/logs` | Stream container logs |

---

## Rate Limiting Strategy

```
POST /auth/register  → 5 req / 1 hour / IP
POST /auth/login     → 10 req / 15 min / IP (exponential backoff on 429)
global API           → 100 req / 1 min / IP
```

All thresholds configurable via env vars. Uses `@fastify/rate-limit` with Redis store.
Real IP extracted from `X-Forwarded-For` / `X-Real-IP` (nginx sets these; `trustProxy` enabled only for known proxy IP).

---

## JWT Strategy

- **Access token**: short-lived (15 min), signed HS256, payload: `{sub: userId, username, role}`
- **Refresh token**: long-lived (30 days), opaque random bytes, stored hashed (SHA-256) in `DeviceSession.refreshTokenHash`
- On refresh: validate hash → generate new pair → update hash (rotation) → return new tokens
- On logout: set `revokedAt` on `DeviceSession`
- Middleware checks `revokedAt` IS NULL (token not revoked) before accepting access token

---

## Phase Roadmap

### Phase 1 — Auth, Profile, Sessions ✅ (current)
- Register / login / refresh / logout
- Device sessions management
- Profile CRUD + avatar upload to MinIO
- Rate limiting on sensitive endpoints
- Frontend: register, login, profile, edit profile, my devices screens

### Phase 2 — Real-time Chat (1-on-1)
- Socket.IO messaging with history in Postgres
- Message.id = UUID v7
- Typing indicators, online/offline presence (Redis)
- Frontend: chat list, chat window, message bubbles

### Phase 3 — Media
- Photo/video upload and display
- Voice messages (MediaRecorder API)
- Circle video (short round video clips)
- Transcoding pipeline in media service
- Frontend: media preview, voice player, circle video player

### Phase 4 — Admin Panel
- User management (role=ADMIN only)
- Message history viewer
- Container management via docker-socket-proxy (Tecnativa)
  - Allowlist: list, status, logs, restart only
  - No direct docker.sock mount in backend
- Log viewer (read-only, via socket-proxy or Dozzle)

---

## Security Considerations

- Passwords: argon2id hashing
- Tokens: access tokens never stored server-side; refresh tokens stored as SHA-256 hash
- Rate limiting: Redis-backed, IP-based, per-route
- File uploads: MIME validation, size limits, stored in MinIO (not filesystem)
- Admin docker access: docker-socket-proxy with strict allowlist, no raw socket exposure
- SQL injection: Prisma parameterized queries
- XSS: React escapes by default; CSP headers via nginx
- CORS: explicit allowlist (app.DOMAIN only)
- TLS: Let's Encrypt via certbot, auto-renewal

---

## Environment Variables

See `.env.example` for full list with defaults and documentation.

Key groups:
- `DATABASE_URL` — Postgres connection string
- `REDIS_URL` — Redis connection string
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` — signing keys
- `MINIO_*` — MinIO connection and credentials
- `RATE_LIMIT_*` — rate limit thresholds
- `SERVICE_ROLE` — `core` | `realtime` | `media` (controls which modules start)
