-- CreateEnum
CREATE TYPE "ReminderTarget" AS ENUM ('SELF', 'PARTNER', 'BOTH');

-- CreateTable
CREATE TABLE "calendar_categories" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "name" VARCHAR(40) NOT NULL,
    "color" VARCHAR(9) NOT NULL,
    "createdById" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calendar_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_events" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "createdById" BIGINT NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "notes" VARCHAR(1000),
    "eventAt" TIMESTAMP(3) NOT NULL,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "presetKey" VARCHAR(32),
    "categoryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_reminders" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "offsetMin" INTEGER NOT NULL DEFAULT 0,
    "target" "ReminderTarget" NOT NULL DEFAULT 'BOTH',
    "notify" BOOLEAN NOT NULL DEFAULT true,
    "fireAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "event_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminder_deliveries" (
    "id" TEXT NOT NULL,
    "reminderId" TEXT NOT NULL,
    "userId" BIGINT NOT NULL,
    "deliveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reminder_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_calendar_settings" (
    "chatId" TEXT NOT NULL,
    "userId" BIGINT NOT NULL,
    "remindersEnabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "chat_calendar_settings_pkey" PRIMARY KEY ("chatId", "userId")
);

-- CreateIndex
CREATE INDEX "calendar_categories_chatId_idx" ON "calendar_categories"("chatId");

-- CreateIndex
CREATE INDEX "calendar_events_chatId_eventAt_idx" ON "calendar_events"("chatId", "eventAt");

-- CreateIndex
CREATE INDEX "event_reminders_sentAt_fireAt_idx" ON "event_reminders"("sentAt", "fireAt");

-- CreateIndex
CREATE INDEX "event_reminders_eventId_idx" ON "event_reminders"("eventId");

-- CreateIndex
CREATE INDEX "reminder_deliveries_userId_idx" ON "reminder_deliveries"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "reminder_deliveries_reminderId_userId_key" ON "reminder_deliveries"("reminderId", "userId");

-- CreateIndex
CREATE INDEX "chat_calendar_settings_userId_idx" ON "chat_calendar_settings"("userId");

-- AddForeignKey
ALTER TABLE "calendar_categories" ADD CONSTRAINT "calendar_categories_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_categories" ADD CONSTRAINT "calendar_categories_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "calendar_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_reminders" ADD CONSTRAINT "event_reminders_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "calendar_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminder_deliveries" ADD CONSTRAINT "reminder_deliveries_reminderId_fkey" FOREIGN KEY ("reminderId") REFERENCES "event_reminders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminder_deliveries" ADD CONSTRAINT "reminder_deliveries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_calendar_settings" ADD CONSTRAINT "chat_calendar_settings_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;
