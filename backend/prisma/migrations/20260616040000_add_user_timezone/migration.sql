-- Часовой пояс пользователя (IANA, напр. "Asia/Yekaterinburg") для календаря и напоминаний.
ALTER TABLE "users" ADD COLUMN "timezone" VARCHAR(64);
