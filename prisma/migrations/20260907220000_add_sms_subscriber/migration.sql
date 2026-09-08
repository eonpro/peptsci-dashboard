-- PeptSci Alerts: standalone SMS consent records (TCPA / Twilio A2P 10DLC).
-- Captures the verbatim consent text, timestamp, source, and request metadata
-- for every mobile number enrolled via the public /sms opt-in page.
CREATE TABLE IF NOT EXISTS "SmsSubscriber" (
    "id"          TEXT NOT NULL,
    "phone"       TEXT NOT NULL,
    "email"       TEXT,
    "clientId"    TEXT,
    "consentText" TEXT NOT NULL,
    "consentedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "optedOutAt"  TIMESTAMP(3),
    "source"      TEXT NOT NULL DEFAULT 'WEB_SMS_PAGE',
    "ipAddress"   TEXT,
    "userAgent"   TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmsSubscriber_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SmsSubscriber_phone_key" ON "SmsSubscriber"("phone");
CREATE INDEX IF NOT EXISTS "SmsSubscriber_clientId_idx" ON "SmsSubscriber"("clientId");
CREATE INDEX IF NOT EXISTS "SmsSubscriber_optedOutAt_idx" ON "SmsSubscriber"("optedOutAt");

-- (No DO $$ block: the runtime runner splits on ';' and treats "already exists" as a no-op.)
ALTER TABLE "SmsSubscriber"
  ADD CONSTRAINT "SmsSubscriber_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
