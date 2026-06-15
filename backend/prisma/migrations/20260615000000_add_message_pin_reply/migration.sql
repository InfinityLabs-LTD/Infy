-- AlterTable: pin + reply support on messages
ALTER TABLE "messages" ADD COLUMN "pinnedAt" TIMESTAMP(3);
ALTER TABLE "messages" ADD COLUMN "replyToId" TEXT;

-- AddForeignKey: self-relation for replies (null out on parent delete)
ALTER TABLE "messages" ADD CONSTRAINT "messages_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: track when a member last read the chat (for "read at" timestamp)
ALTER TABLE "chat_members" ADD COLUMN "lastReadAt" TIMESTAMP(3);
