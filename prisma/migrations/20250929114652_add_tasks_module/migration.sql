-- CreateEnum
CREATE TYPE "public"."TaskStatus" AS ENUM ('open', 'in_progress', 'waiting', 'completed');

-- CreateEnum
CREATE TYPE "public"."TaskPriority" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "public"."TaskCategory" AS ENUM ('follow_up', 'tasting', 'campaign', 'other');

-- AlterTable
ALTER TABLE "public"."customer_interaction" ADD COLUMN     "followUpTaskId" TEXT;

-- CreateTable
CREATE TABLE "public"."task" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "public"."TaskStatus" NOT NULL DEFAULT 'open',
    "priority" "public"."TaskPriority" NOT NULL DEFAULT 'medium',
    "category" "public"."TaskCategory" NOT NULL DEFAULT 'other',
    "customerId" TEXT,
    "assignedToId" TEXT,
    "createdById" TEXT,
    "startAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "slaMinutes" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."task_dependency" (
    "id" TEXT NOT NULL,
    "predecessorId" TEXT NOT NULL,
    "successorId" TEXT NOT NULL,
    "relationType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_dependency_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "task_customerId_idx" ON "public"."task"("customerId");

-- CreateIndex
CREATE INDEX "task_assignedToId_idx" ON "public"."task"("assignedToId");

-- CreateIndex
CREATE INDEX "task_status_idx" ON "public"."task"("status");

-- CreateIndex
CREATE INDEX "task_dueAt_idx" ON "public"."task"("dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "task_dependency_predecessorId_successorId_key" ON "public"."task_dependency"("predecessorId", "successorId");

-- AddForeignKey
ALTER TABLE "public"."customer_interaction" ADD CONSTRAINT "customer_interaction_followUpTaskId_fkey" FOREIGN KEY ("followUpTaskId") REFERENCES "public"."task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."task" ADD CONSTRAINT "task_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."task" ADD CONSTRAINT "task_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "public"."crm_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."task" ADD CONSTRAINT "task_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."crm_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."task_dependency" ADD CONSTRAINT "task_dependency_predecessorId_fkey" FOREIGN KEY ("predecessorId") REFERENCES "public"."task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."task_dependency" ADD CONSTRAINT "task_dependency_successorId_fkey" FOREIGN KEY ("successorId") REFERENCES "public"."task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
