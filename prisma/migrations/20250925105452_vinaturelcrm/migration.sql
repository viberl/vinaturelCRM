-- CreateTable
CREATE TABLE "public"."sales_rep" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_rep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."customer" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "company" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "street" TEXT,
    "city" TEXT,
    "zip" TEXT,
    "country" TEXT,
    "phone" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."sales_rep_customer" (
    "salesRepId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_rep_customer_pkey" PRIMARY KEY ("salesRepId","customerId")
);

-- CreateTable
CREATE TABLE "public"."sync_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "lastSync" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."crm_users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "salesRepEmail" TEXT,
    "salesRepId" TEXT,
    "role" TEXT NOT NULL DEFAULT 'sales_rep',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sales_rep_email_key" ON "public"."sales_rep"("email");

-- CreateIndex
CREATE UNIQUE INDEX "customer_email_key" ON "public"."customer"("email");

-- CreateIndex
CREATE UNIQUE INDEX "crm_users_email_key" ON "public"."crm_users"("email");

-- AddForeignKey
ALTER TABLE "public"."sales_rep_customer" ADD CONSTRAINT "sales_rep_customer_salesRepId_fkey" FOREIGN KEY ("salesRepId") REFERENCES "public"."sales_rep"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."sales_rep_customer" ADD CONSTRAINT "sales_rep_customer_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
