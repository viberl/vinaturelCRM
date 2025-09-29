-- CreateEnum
CREATE TYPE "public"."InteractionType" AS ENUM ('phone', 'email', 'meeting', 'chat');

-- CreateTable
CREATE TABLE "public"."customer_interaction" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" "public"."InteractionType" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "employee" TEXT,
    "durationSeconds" INTEGER,
    "topic" TEXT,
    "result" TEXT,
    "notes" TEXT,
    "attachmentsCount" INTEGER,
    "followUpTitle" TEXT,
    "followUpDueDate" TIMESTAMP(3),
    "followUpAssignee" TEXT,
    "followUpPriority" TEXT,
    "followUpReminder" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_interaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customer_interaction_customerId_idx" ON "public"."customer_interaction"("customerId");

-- AddForeignKey
ALTER TABLE "public"."customer_interaction" ADD CONSTRAINT "customer_interaction_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
