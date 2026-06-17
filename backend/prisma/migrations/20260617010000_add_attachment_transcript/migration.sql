-- Распознанный текст голосовых сообщений и кружков (заполняется по запросу,
-- кэшируется на вложении, чтобы не распознавать повторно).
ALTER TABLE "attachments" ADD COLUMN IF NOT EXISTS "transcript" TEXT;
