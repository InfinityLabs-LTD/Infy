-- Добавляем типы AI-сообщений: запрос пользователя к ИИ и ответ ИИ
-- (видны обоим участникам чата, рендерятся как сообщения, а не системные плашки).
ALTER TYPE "MessageType" ADD VALUE IF NOT EXISTS 'AI_QUERY';
ALTER TYPE "MessageType" ADD VALUE IF NOT EXISTS 'AI';
