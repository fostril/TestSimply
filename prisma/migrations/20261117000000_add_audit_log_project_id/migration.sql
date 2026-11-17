-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN "projectId" TEXT;

-- CreateIndex
CREATE INDEX "AuditLog_projectId_idx" ON "AuditLog"("projectId");
