-- Same provider (NPI) may be linked to multiple practices/clients.
DROP INDEX IF EXISTS "Client_npiNumber_key";

-- Keep a non-unique index for search and partner lead matching.
CREATE INDEX IF NOT EXISTS "Client_npiNumber_idx" ON "Client"("npiNumber");
