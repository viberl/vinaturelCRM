-- CreateTable
CREATE TABLE "public"."microsoft_credentials" (
    "id" SERIAL NOT NULL,
    "crmUserId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "scope" TEXT,
    "tokenType" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "microsoft_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "microsoft_credentials_crmUserId_key" ON "public"."microsoft_credentials"("crmUserId");

-- AddForeignKey
ALTER TABLE "public"."microsoft_credentials" ADD CONSTRAINT "microsoft_credentials_crmUserId_fkey" FOREIGN KEY ("crmUserId") REFERENCES "public"."crm_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
