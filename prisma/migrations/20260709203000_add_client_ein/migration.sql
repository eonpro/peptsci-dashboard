-- Optional Employer Identification Number (tax ID) on clinic/practice Client rows.
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "ein" TEXT;
