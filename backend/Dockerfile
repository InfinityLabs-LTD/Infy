FROM node:20-alpine AS base
WORKDIR /app
# ffmpeg для транскодинга медиа
RUN apk add --no-cache openssl ffmpeg

# ── Dependencies ──────────────────────────────────────────────
FROM base AS deps
COPY package*.json ./
RUN npm install --omit=dev

# ── Build ─────────────────────────────────────────────────────
FROM base AS builder
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run generate
RUN npm run build

# ── Runtime ───────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY package.json ./

EXPOSE 3001 3002 3003
CMD ["node", "dist/server.js"]
