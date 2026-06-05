# Infy Messenger

Fast, secure, mobile-first messenger. API-first architecture: REST + WebSocket backend, React web client, with native iOS/Android planned.

## Quick start (local dev)

### Prerequisites

- Docker Desktop (or Docker Engine + Compose plugin)
- Node.js 20+ (for running backend/frontend outside Docker)

### 1. Clone and configure

```bash
git clone <repo>
cd infy
cp .env.example .env
# Edit .env — set strong secrets for production, defaults work for dev
```

### 2. Start with Docker Compose

```bash
docker compose up -d
```

Services started:
| Service | URL |
|---------|-----|
| Frontend | http://localhost (nginx) |
| API docs (Swagger) | http://localhost:3001/docs |
| Core API | http://localhost:3001 |
| Realtime | http://localhost:3002 |
| Media | http://localhost:3003 |
| MinIO console | http://localhost:9001 |

### 3. Run migrations

```bash
docker compose exec core npx prisma migrate deploy
```

### 4. Develop without Docker (faster iteration)

Start infrastructure only:
```bash
docker compose up -d postgres redis minio nginx
```

Backend:
```bash
cd backend
npm install
cp ../.env .env        # or set env vars
npm run migrate:dev    # first run only
npm run dev            # hot-reload at :3001
```

Frontend:
```bash
cd frontend
npm install
npm run dev            # Vite at :5173
```

Vite proxies `/api/*` → `localhost:3001` automatically.

## Production deployment (Ubuntu VPS)

### Prerequisites on server
- Ubuntu 22.04 or 24.04
- DNS A records pointing to server IP:
  - `app.yourdomain.com`
  - `api.yourdomain.com`
  - `ws.yourdomain.com`
  - `media.yourdomain.com`

### Deploy

```bash
git clone <repo> /opt/infy
cd /opt/infy
sudo bash install.sh
```

The script will:
1. Install Docker Engine
2. Ask for domain, Let's Encrypt email, admin password
3. Check DNS records
4. Configure firewall (ufw)
5. Generate secrets → `.env`
6. Start all containers
7. Issue TLS certs via certbot
8. Run Prisma migrations
9. Create first ADMIN account

## Project structure

```
/backend        — Fastify API server (modular monolith)
/frontend       — React 18 + Vite + Tailwind web client
/mobile         — Reserved for native apps
/nginx          — nginx configs (dev + prod)
docker-compose.yml
.env.example
install.sh      — VPS deployment script
SPEC.md         — Full feature specification
CLAUDE.md       — Developer guide and conventions
```

## API

Swagger UI: `http://localhost:3001/docs`

Key endpoints (Phase 1):

```
POST   /auth/register          Register
POST   /auth/login             Login
POST   /auth/refresh           Rotate refresh token
POST   /auth/logout            Logout

GET    /profile/me             My profile
PATCH  /profile/me             Update profile
POST   /profile/me/avatar      Upload avatar
GET    /profile/:username      Public profile

GET    /sessions               List active devices
DELETE /sessions/:id           Revoke session
POST   /sessions/logout-all    Logout all devices
```

## Environment variables

See [.env.example](.env.example) for full documentation.

## Architecture

See [SPEC.md](SPEC.md) for the full specification including:
- Service roles (core / realtime / media)
- Data model
- All API endpoints (phases 1–4)
- Security considerations
- Rate limiting strategy

## Tech stack

| | |
|--|--|
| Backend | Node.js 20 + TypeScript + Fastify 4 |
| ORM | Prisma 5 (PostgreSQL 16) |
| Auth | JWT (access 15m + refresh 30d) + argon2id |
| Real-time | Socket.IO 4 + Redis adapter |
| Storage | MinIO (S3-compatible) |
| Frontend | React 18 + Vite + Tailwind CSS |
| Proxy | nginx + certbot (Let's Encrypt) |
| Infra | Docker Compose |
