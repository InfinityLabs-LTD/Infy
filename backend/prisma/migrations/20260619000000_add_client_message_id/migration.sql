-- Идемпотентность отправки сообщений: клиент передаёт clientMessageId,
-- сервер дедуплицирует повторы по (chatId, clientMessageId).
ALTER TABLE "messages" ADD COLUMN "clientMessageId" TEXT;

-- В Postgres NULL-значения считаются различными, поэтому несколько сообщений
-- без ключа (системные / старые клиенты) не конфликтуют.
CREATE UNIQUE INDEX "messages_chatId_clientMessageId_key" ON "messages"("chatId", "clientMessageId");
