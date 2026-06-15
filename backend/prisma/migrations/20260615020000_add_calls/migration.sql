-- CreateEnum
CREATE TYPE "CallMedia" AS ENUM ('AUDIO', 'VIDEO');

-- CreateEnum
CREATE TYPE "CallStatus" AS ENUM ('RINGING', 'ACTIVE', 'ENDED', 'MISSED', 'DECLINED', 'CANCELLED', 'FAILED');

-- CreateTable
CREATE TABLE "call_sessions" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "initiatorId" BIGINT NOT NULL,
    "media" "CallMedia" NOT NULL DEFAULT 'AUDIO',
    "status" "CallStatus" NOT NULL DEFAULT 'RINGING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "durationSec" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "call_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_participants" (
    "id" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "userId" BIGINT NOT NULL,
    "joinedAt" TIMESTAMP(3),
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "call_participants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "call_sessions_chatId_createdAt_idx" ON "call_sessions"("chatId", "createdAt");

-- CreateIndex
CREATE INDEX "call_sessions_initiatorId_idx" ON "call_sessions"("initiatorId");

-- CreateIndex
CREATE INDEX "call_participants_userId_idx" ON "call_participants"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "call_participants_callId_userId_key" ON "call_participants"("callId", "userId");

-- AddForeignKey
ALTER TABLE "call_sessions" ADD CONSTRAINT "call_sessions_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_sessions" ADD CONSTRAINT "call_sessions_initiatorId_fkey" FOREIGN KEY ("initiatorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_participants" ADD CONSTRAINT "call_participants_callId_fkey" FOREIGN KEY ("callId") REFERENCES "call_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_participants" ADD CONSTRAINT "call_participants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
