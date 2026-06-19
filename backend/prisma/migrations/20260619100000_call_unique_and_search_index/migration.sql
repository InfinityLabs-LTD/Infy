-- H-2: не более одного НЕзавершённого звонка на чат (двойная защита к busy-локу
-- в Redis от гонки двух одновременных invite). Partial unique index: уникальность
-- chatId действует только для строк со статусом RINGING/ACTIVE.
CREATE UNIQUE INDEX "call_sessions_chatId_active_key"
  ON "call_sessions"("chatId")
  WHERE "status" IN ('RINGING', 'ACTIVE');

-- M-8: полнотекстовый/подстрочный поиск по сообщениям без sequential scan.
-- pg_trgm + GIN-индекс ускоряет ILIKE '%q%' по content.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "messages_content_trgm_idx"
  ON "messages" USING GIN ("content" gin_trgm_ops);
