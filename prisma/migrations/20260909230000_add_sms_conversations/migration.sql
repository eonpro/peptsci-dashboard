-- SMS inbox (CRM): one conversation per phone number, and SmsMessage becomes
-- two-way (INBOUND rows written by the Twilio inbound webhook, STAFF_REPLY
-- rows written from the admin composer).
--
-- Idempotent: safe to re-run through the in-app migrate route.

CREATE TABLE IF NOT EXISTS "SmsConversation" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "clientId" TEXT,
    "contactName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "assignedToId" TEXT,
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "lastMessageAt" TIMESTAMP(3),
    "lastMessagePreview" TEXT,
    "lastDirection" TEXT,
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmsConversation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SmsConversation_phone_key" ON "SmsConversation"("phone");
CREATE INDEX IF NOT EXISTS "SmsConversation_clientId_idx" ON "SmsConversation"("clientId");
CREATE INDEX IF NOT EXISTS "SmsConversation_status_lastMessageAt_idx" ON "SmsConversation"("status", "lastMessageAt");
CREATE INDEX IF NOT EXISTS "SmsConversation_assignedToId_idx" ON "SmsConversation"("assignedToId");
CREATE INDEX IF NOT EXISTS "SmsConversation_unreadCount_idx" ON "SmsConversation"("unreadCount");

ALTER TABLE "SmsConversation" ADD CONSTRAINT "SmsConversation_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SmsConversation" ADD CONSTRAINT "SmsConversation_assignedToId_fkey"
    FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SmsConversation" ADD CONSTRAINT "SmsConversation_closedById_fkey"
    FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SmsMessage" ADD COLUMN IF NOT EXISTS "direction" TEXT NOT NULL DEFAULT 'OUTBOUND';
ALTER TABLE "SmsMessage" ADD COLUMN IF NOT EXISTS "conversationId" TEXT;
ALTER TABLE "SmsMessage" ADD COLUMN IF NOT EXISTS "sentById" TEXT;
ALTER TABLE "SmsMessage" ADD COLUMN IF NOT EXISTS "readAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "SmsMessage_conversationId_createdAt_idx" ON "SmsMessage"("conversationId", "createdAt");

ALTER TABLE "SmsMessage" ADD CONSTRAINT "SmsMessage_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "SmsConversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SmsMessage" ADD CONSTRAINT "SmsMessage_sentById_fkey"
    FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
