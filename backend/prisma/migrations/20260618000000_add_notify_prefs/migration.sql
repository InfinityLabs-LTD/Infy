-- Настройки push-уведомлений пользователя (по умолчанию всё включено).
ALTER TABLE "users" ADD COLUMN "notifyPopup" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "users" ADD COLUMN "notifySound" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "users" ADD COLUMN "notifyVibrate" BOOLEAN NOT NULL DEFAULT true;
