-- CreateTable
CREATE TABLE "public"."task_attachment" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "uploadedBy" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_attachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "task_attachment_taskId_idx" ON "public"."task_attachment"("taskId");

-- AddForeignKey
ALTER TABLE "public"."task_attachment" ADD CONSTRAINT "task_attachment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "public"."task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."task_attachment" ADD CONSTRAINT "task_attachment_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "public"."crm_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
