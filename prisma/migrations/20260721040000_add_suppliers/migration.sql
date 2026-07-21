-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "website" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierPriceItem" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "supplierSku" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "dose" TEXT NOT NULL DEFAULT '',
    "vialsPerBox" INTEGER,
    "unitCost" DECIMAL(12,2) NOT NULL,
    "listPrice" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierPriceItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_name_key" ON "Supplier"("name");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierPriceItem_supplierId_supplierSku_key" ON "SupplierPriceItem"("supplierId", "supplierSku");

-- CreateIndex
CREATE INDEX "SupplierPriceItem_supplierId_productName_idx" ON "SupplierPriceItem"("supplierId", "productName");

-- AddForeignKey
ALTER TABLE "SupplierPriceItem" ADD CONSTRAINT "SupplierPriceItem_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
