-- CreateEnum
CREATE TYPE "SanctionType" AS ENUM ('WARN', 'MUTE', 'BAN');

-- CreateTable
CREATE TABLE "sanctions" (
    "id" TEXT NOT NULL,
    "userId" BIGINT NOT NULL,
    "issuedById" BIGINT NOT NULL,
    "type" "SanctionType" NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "sanctions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sanctions_userId_idx" ON "sanctions"("userId");

-- CreateIndex
CREATE INDEX "sanctions_type_idx" ON "sanctions"("type");

-- AddForeignKey
ALTER TABLE "sanctions" ADD CONSTRAINT "sanctions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sanctions" ADD CONSTRAINT "sanctions_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
