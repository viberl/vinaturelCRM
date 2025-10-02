-- CreateTable
CREATE TABLE "focus_wine_list" (
    "id" SERIAL PRIMARY KEY,
    "articleNumbers" TEXT[] NOT NULL,
    "fileName" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedById" TEXT,
    CONSTRAINT "focus_wine_list_uploaded_by_id_fkey" FOREIGN KEY ("uploadedById") REFERENCES "crm_users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
