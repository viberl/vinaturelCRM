-- CreateTable
CREATE TABLE "public"."task_watcher" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_watcher_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "task_watcher_taskId_userId_key" ON "public"."task_watcher"("taskId", "userId");

-- AddForeignKey
ALTER TABLE "public"."task_watcher" ADD CONSTRAINT "task_watcher_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "public"."task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."task_watcher" ADD CONSTRAINT "task_watcher_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."crm_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
