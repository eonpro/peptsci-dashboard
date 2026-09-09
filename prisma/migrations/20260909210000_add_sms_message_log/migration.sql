-- PeptSci Alerts: outbound SMS delivery log. One row per send attempt; status
-- is advanced by Twilio's StatusCallback webhook (/api/webhooks/twilio/status).
CREATE TABLE IF NOT EXISTS "SmsMessage" (
    "id"           TEXT NOT NULL,
    "phone"        TEXT NOT NULL,
    "body"         TEXT NOT NULL,
    "kind"         TEXT NOT NULL,
    "status"       TEXT NOT NULL DEFAULT 'QUEUED',
    "twilioSid"    TEXT,
    "errorCode"    TEXT,
    "errorMessage" TEXT,
    "orderId"      TEXT,
    "clientId"     TEXT,
    "sentAt"       TIMESTAMP(3),
    "deliveredAt"  TIMESTAMP(3),
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmsMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SmsMessage_twilioSid_key" ON "SmsMessage"("twilioSid");
CREATE INDEX IF NOT EXISTS "SmsMessage_orderId_idx" ON "SmsMessage"("orderId");
CREATE INDEX IF NOT EXISTS "SmsMessage_clientId_idx" ON "SmsMessage"("clientId");
CREATE INDEX IF NOT EXISTS "SmsMessage_phone_createdAt_idx" ON "SmsMessage"("phone", "createdAt");
CREATE INDEX IF NOT EXISTS "SmsMessage_status_idx" ON "SmsMessage"("status");

-- (No DO $$ block: the runtime runner splits on ';' and treats "already exists" as a no-op.)
ALTER TABLE "SmsMessage"
  ADD CONSTRAINT "SmsMessage_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SmsMessage"
  ADD CONSTRAINT "SmsMessage_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
