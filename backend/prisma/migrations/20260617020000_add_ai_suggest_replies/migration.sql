-- Infy Puls: показывать ли подсказки ответов над полем ввода чата (по умолчанию включено).
ALTER TABLE "users" ADD COLUMN "aiSuggestReplies" BOOLEAN NOT NULL DEFAULT true;
