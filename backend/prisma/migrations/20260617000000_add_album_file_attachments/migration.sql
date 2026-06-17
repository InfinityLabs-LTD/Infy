-- Альбомы (несколько вложений в одном сообщении) и одиночные файлы/документы.
-- Новые типы сообщений + имя файла у вложения для документов.
ALTER TYPE "MessageType" ADD VALUE IF NOT EXISTS 'FILE';
ALTER TYPE "MessageType" ADD VALUE IF NOT EXISTS 'ALBUM';

ALTER TABLE "attachments" ADD COLUMN IF NOT EXISTS "fileName" TEXT;
