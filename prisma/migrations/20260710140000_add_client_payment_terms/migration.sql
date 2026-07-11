-- Net-terms billing on the client: opt-in "bill to account" at checkout.
ALTER TABLE "Client" ADD COLUMN "paymentTermsDays" INTEGER;
ALTER TABLE "Client" ADD COLUMN "creditLimit" DECIMAL(12,2);
