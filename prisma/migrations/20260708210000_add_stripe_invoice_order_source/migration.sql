-- Add STRIPE_INVOICE to the OrderSource enum so payments synced from Stripe can
-- be converted into fulfillable orders. Idempotent (IF NOT EXISTS) so the
-- runtime migrate runner can safely re-apply it.
ALTER TYPE "OrderSource" ADD VALUE IF NOT EXISTS 'STRIPE_INVOICE';
