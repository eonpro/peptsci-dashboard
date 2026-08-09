-- White-label vial labels per client (Elevated Vitality pilot + future brands).
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "whiteLabelEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "labelBrandKey" TEXT;
