# Infy Messenger — Developer Guide

## Stack

| Layer | Technology |
|-------|-----------|
| Backend runtime | Node.js 20 + TypeScript |
| API framework | Fastify 4 |
| ORM | Prisma 5 |
| Real-time | Socket.IO 4 |
| Auth | JWT (access 15m + refresh 30d), argon2id |
| Validation | Zod |
| Database | PostgreSQL 16 |
| Cache / PubSub | Redis 7 |
| Object storage | MinIO (S3-compatible) |
| Frontend | React 18 + Vite + Tailwind CSS |
| Proxy | nginx + certbot (Let's Encrypt) |
| Infra | Docker Compose |

## Project Structure

```
/
├── backend/              # API server (modular monolith)
│   ├── src/
│   │   ├── modules/
│   │   │   ├── auth/     # register, login, refresh, logout
│   │   │   ├── profile/  # profile CRUD, avatar upload
│   │   │   ├── sessions/ # device session management
│   │   │   ├── chat/     # messaging (Phase 2)
│   │   │   └── media/    # file handling (Phase 3)
│   │   ├── plugins/      # fastify plugins (prisma, redis, jwt, rate-limit)
│   │   ├── middleware/   # auth guard, role guard
│   │   ├── lib/          # shared utilities
│   │   └── server.ts     # entry point
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/
│   ├── Dockerfile
│   └── package.json
├── frontend/             # React web client
│   ├── src/
│   │   ├── api/          # Axios client + typed endpoints
│   │   ├── components/   # shared UI components
│   │   ├── pages/        # route-level components
│   │   ├── hooks/        # custom React hooks
│   │   ├── store/        # Zustand state
│   │   └── main.tsx
│   ├── Dockerfile
│   └── package.json
├── mobile/               # Reserved for native apps
├── nginx/
│   ├── dev.conf          # localhost, no TLS
│   └── prod.conf         # domain + TLS
├── docker-compose.yml
├── .env.example
├── install.sh            # Interactive Ubuntu VPS deploy
├── SPEC.md               # Full feature specification
├── CLAUDE.md             # This file
└── README.md
```

## Commands

### Local Development

```bash
# Start all infrastructure (postgres, redis, minio, nginx)
docker compose up -d postgres redis minio nginx

# Backend dev server (hot reload)
cd backend && npm run dev

# Frontend dev server (hot reload)
cd frontend && npm run dev

# Run all with Docker
docker compose up -d
```

### Database

```bash
# Run migrations
cd backend && npx prisma migrate dev

# Generate Prisma client
cd backend && npx prisma generate

# Open Prisma Studio
cd backend && npx prisma studio

# Reset DB (dev only)
cd backend && npx prisma migrate reset
```

### Docker

```bash
# Build images
docker compose build

# Start all services
docker compose up -d

# View logs
docker compose logs -f [service]

# Stop all
docker compose down

# Stop + remove volumes (DESTRUCTIVE)
docker compose down -v
```

## Service Roles

The backend image runs in one of three roles, set by `SERVICE_ROLE` env var:

| Role | Port | Responsibility |
|------|------|---------------|
| `core` | 3001 | REST API: auth, profile, messages storage |
| `realtime` | 3002 | Socket.IO gateway, presence, pub/sub |
| `media` | 3003 | File upload, transcoding, MinIO integration |

## Conventions

### TypeScript

- Strict mode enabled
- No `any` — use `unknown` and narrow
- Zod schemas for all request/response validation
- Prisma types for DB models; never expose raw DB rows via API

### API Design

- REST: noun-based URLs, standard HTTP methods
- All responses: `{ data: T }` on success, `{ error: { code, message } }` on failure
- Pagination: cursor-based with `{ data: T[], nextCursor: string | null }`
- HTTP status codes: 200 OK, 201 Created, 204 No Content, 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found, 409 Conflict, 429 Too Many Requests, 500 Internal Server Error

### Auth Flow

```
Register → POST /auth/register → { accessToken, refreshToken, user }
Login    → POST /auth/login    → { accessToken, refreshToken, user }
Refresh  → POST /auth/refresh  (body: { refreshToken }) → { accessToken, refreshToken }
Logout   → POST /auth/logout   (bearer) → 204
```

Access token in `Authorization: Bearer <token>` header.
Refresh token in request body (not cookie) — for mobile client compatibility.

### Git

- Branch: `main` (production), `dev` (integration), `feature/*`
- Commit messages: imperative mood, `type: description` (feat, fix, chore, docs)
- No direct commits to `main`

### Error Codes

Custom error codes in responses for client-side i18n:

```
AUTH_USER_NOT_FOUND
AUTH_INVALID_PASSWORD
AUTH_USERNAME_TAKEN
AUTH_EMAIL_TAKEN
AUTH_TOKEN_EXPIRED
AUTH_TOKEN_INVALID
AUTH_SESSION_REVOKED
PROFILE_USERNAME_INVALID
RATE_LIMIT_EXCEEDED
```

## Ports (local dev)

| Service | Port |
|---------|------|
| nginx | 80 |
| core (backend) | 3001 |
| realtime | 3002 |
| media | 3003 |
| PostgreSQL | 5432 |
| Redis | 6379 |
| MinIO API | 9000 |
| MinIO Console | 9001 |
| Frontend (Vite) | 5173 |

## API Documentation

Swagger UI available at `http://localhost:3001/docs` when running core service.
OpenAPI JSON at `http://localhost:3001/docs/json`.
