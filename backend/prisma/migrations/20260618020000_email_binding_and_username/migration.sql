-- Привязка почты (6-значный код) + поля подтверждения e-mail у пользователя.
-- Миграция идемпотентна (IF [NOT] EXISTS): таблица email_verification_tokens
-- была заведена в схеме ранее, но без полей для реального флоу.

-- На всякий случай: колонки подтверждения почты у пользователя.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email" VARCHAR(255);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "emailVerifiedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users"("email");

-- Таблица токенов подтверждения почты.
CREATE TABLE IF NOT EXISTS "email_verification_tokens" (
    "id" TEXT NOT NULL,
    "userId" BIGINT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("id")
);

-- Приводим таблицу к актуальной форме (на случай, если она уже была со старыми полями).
ALTER TABLE "email_verification_tokens" ADD COLUMN IF NOT EXISTS "email" VARCHAR(255) NOT NULL DEFAULT '';
ALTER TABLE "email_verification_tokens" ADD COLUMN IF NOT EXISTS "codeHash" TEXT NOT NULL DEFAULT '';
ALTER TABLE "email_verification_tokens" ADD COLUMN IF NOT EXISTS "attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "email_verification_tokens" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Старое поле tokenHash и его уникальный индекс больше не нужны.
DROP INDEX IF EXISTS "email_verification_tokens_tokenHash_key";
ALTER TABLE "email_verification_tokens" DROP COLUMN IF EXISTS "tokenHash";

-- Дефолты на email/codeHash нужны были только для безопасного ADD COLUMN на
-- непустой таблице; для новых строк значения всегда задаёт приложение.
ALTER TABLE "email_verification_tokens" ALTER COLUMN "email" DROP DEFAULT;
ALTER TABLE "email_verification_tokens" ALTER COLUMN "codeHash" DROP DEFAULT;

CREATE INDEX IF NOT EXISTS "email_verification_tokens_userId_idx"
    ON "email_verification_tokens"("userId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'email_verification_tokens_userId_fkey'
  ) THEN
    ALTER TABLE "email_verification_tokens"
      ADD CONSTRAINT "email_verification_tokens_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
