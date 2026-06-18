-- Хэштеги/интересы профиля (выбирает сам пользователь).
ALTER TABLE "users" ADD COLUMN "interests" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Каталог бейджей (полностью кастомный, ведётся администратором).
CREATE TABLE "badges" (
    "id" TEXT NOT NULL,
    "slug" VARCHAR(40) NOT NULL,
    "label" VARCHAR(40) NOT NULL,
    "color" VARCHAR(11) NOT NULL,
    "icon" VARCHAR(8) NOT NULL,
    "description" VARCHAR(200),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "badges_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "badges_slug_key" ON "badges"("slug");

-- Назначение бейджа пользователю.
CREATE TABLE "user_badges" (
    "userId" BIGINT NOT NULL,
    "badgeId" TEXT NOT NULL,
    "grantedById" BIGINT,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_badges_pkey" PRIMARY KEY ("userId","badgeId")
);

CREATE INDEX "user_badges_badgeId_idx" ON "user_badges"("badgeId");

ALTER TABLE "user_badges" ADD CONSTRAINT "user_badges_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_badges" ADD CONSTRAINT "user_badges_badgeId_fkey" FOREIGN KEY ("badgeId") REFERENCES "badges"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_badges" ADD CONSTRAINT "user_badges_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Стартовый каталог бейджей (админ может править/удалять/добавлять).
INSERT INTO "badges" ("id","slug","label","color","icon","description","createdAt") VALUES
  ('badge_verified',  'verified',   'Verified',     '56,189,248',  '✓',  'Подтверждённый аккаунт',           CURRENT_TIMESTAMP),
  ('badge_early',     'early',      'Early User',   '168,85,247',  '⚡', 'Один из первых пользователей',      CURRENT_TIMESTAMP),
  ('badge_developer', 'developer',  'Developer',    '34,197,94',   '🛠', 'Разработчик Infy',                  CURRENT_TIMESTAMP),
  ('badge_premium',   'premium',    'Premium',      '251,191,36',  '✨', 'Подписка Infy Premium',             CURRENT_TIMESTAMP),
  ('badge_partner',   'partner',    'Partner',      '236,72,153',  '🤝', 'Партнёр проекта',                   CURRENT_TIMESTAMP),
  ('badge_beta',      'beta',       'Beta Tester',  '99,102,241',  '🧪', 'Участник бета-тестирования',        CURRENT_TIMESTAMP);
