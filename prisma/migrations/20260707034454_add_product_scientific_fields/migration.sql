-- AlterTable
ALTER TABLE "CompetitorPrice" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "DistributorOrder" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "InventoryReservation" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Invoice" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "OrderFulfillment" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "aka" TEXT,
ADD COLUMN     "casNumber" TEXT,
ADD COLUMN     "complexity" DOUBLE PRECISION,
ADD COLUMN     "heavyAtomCount" INTEGER,
ADD COLUMN     "hydrogenBondAcceptorCount" INTEGER,
ADD COLUMN     "hydrogenBondDonorCount" INTEGER,
ADD COLUMN     "intendedUse" TEXT,
ADD COLUMN     "molecularFormula" TEXT,
ADD COLUMN     "molecularWeight" DOUBLE PRECISION,
ADD COLUMN     "monoisotopicMass" DOUBLE PRECISION,
ADD COLUMN     "peptideLength" INTEGER,
ADD COLUMN     "pubchemCid" TEXT,
ADD COLUMN     "rotatableBondCount" INTEGER,
ADD COLUMN     "safetySummary" TEXT,
ADD COLUMN     "xlogp" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "ReturnRequest" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "SalesRecord" ALTER COLUMN "updatedAt" DROP DEFAULT;
