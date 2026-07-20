-- Data fix: supplier COAs should list Peptsci Research as the client of record
-- (manufacturer remains CrestPeptide). Idempotent — re-running matches 0 rows.
UPDATE "ProductCoa"
SET "clientOfRecord" = 'Peptsci Research'
WHERE "clientOfRecord" = 'Crestpep.com';
