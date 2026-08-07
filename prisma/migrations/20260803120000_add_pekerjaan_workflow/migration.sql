-- CreateEnum
CREATE TYPE "PekerjaanPriority" AS ENUM ('RENDAH', 'NORMAL', 'TINGGI');

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'PEKERJAAN_STATUS_CHANGE';
ALTER TYPE "AuditAction" ADD VALUE 'PEKERJAAN_WORKFLOW_UPDATE';

-- AlterTable
ALTER TABLE "Pekerjaan"
ADD COLUMN "picId" TEXT,
ADD COLUMN "dueDate" DATE,
ADD COLUMN "priority" "PekerjaanPriority" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN "internalNotes" TEXT,
ADD COLUMN "completedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Pekerjaan_officeId_status_dueDate_idx" ON "Pekerjaan"("officeId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "Pekerjaan_officeId_picId_status_idx" ON "Pekerjaan"("officeId", "picId", "status");

-- CreateIndex
CREATE INDEX "Pekerjaan_officeId_priority_status_idx" ON "Pekerjaan"("officeId", "priority", "status");

-- AddForeignKey
ALTER TABLE "Pekerjaan" ADD CONSTRAINT "Pekerjaan_picId_fkey" FOREIGN KEY ("picId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
