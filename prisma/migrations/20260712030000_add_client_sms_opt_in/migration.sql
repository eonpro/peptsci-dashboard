-- SMS consent (TCPA / Twilio A2P web opt-in) captured at onboarding.
ALTER TABLE "Client" ADD COLUMN "smsOptIn" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Client" ADD COLUMN "smsOptInAt" TIMESTAMP(3);
