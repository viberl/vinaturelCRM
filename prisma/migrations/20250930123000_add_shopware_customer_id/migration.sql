ALTER TABLE "customer"
ADD COLUMN "shopware_customer_id" TEXT;

UPDATE "customer"
SET "shopware_customer_id" = "id"
WHERE "shopware_customer_id" IS NULL;

CREATE UNIQUE INDEX "customer_shopware_customer_id_key"
  ON "customer"("shopware_customer_id");
