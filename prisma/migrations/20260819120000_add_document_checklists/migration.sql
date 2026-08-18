-- CreateEnum
CREATE TYPE "ChecklistItemStatus" AS ENUM ('KOSONG', 'TERLAMPIR', 'TERVERIFIKASI', 'DITOLAK', 'DILEWATI');

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'CHECKLIST_TEMPLATE_CREATE';
ALTER TYPE "AuditAction" ADD VALUE 'CHECKLIST_TEMPLATE_UPDATE';
ALTER TYPE "AuditAction" ADD VALUE 'CHECKLIST_TEMPLATE_DELETE';
ALTER TYPE "AuditAction" ADD VALUE 'CHECKLIST_APPLY';
ALTER TYPE "AuditAction" ADD VALUE 'CHECKLIST_ATTACHMENT_UPDATE';
ALTER TYPE "AuditAction" ADD VALUE 'CHECKLIST_STATUS_CHANGE';
ALTER TYPE "AuditTargetType" ADD VALUE 'CHECKLIST_TEMPLATE';

-- CreateTable
CREATE TABLE "ChecklistTemplate" (
    "id" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "kind" "PekerjaanKind" NOT NULL,
    "jenis" TEXT NOT NULL,
    "jenisKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ChecklistTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistTemplateItem" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "expectedType" "ArchiveDocumentType",
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ChecklistTemplateItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PekerjaanChecklistItem" (
    "id" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "pekerjaanId" TEXT NOT NULL,
    "templateItemId" TEXT,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "expectedType" "ArchiveDocumentType",
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "ChecklistItemStatus" NOT NULL DEFAULT 'KOSONG',
    "rejectionReason" TEXT,
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PekerjaanChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PekerjaanChecklistAttachment" (
    "id" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "archiveId" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PekerjaanChecklistAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChecklistTemplate_officeId_kind_jenisKey_key" ON "ChecklistTemplate"("officeId", "kind", "jenisKey");
CREATE INDEX "ChecklistTemplate_officeId_isActive_kind_idx" ON "ChecklistTemplate"("officeId", "isActive", "kind");
CREATE UNIQUE INDEX "ChecklistTemplateItem_templateId_key_key" ON "ChecklistTemplateItem"("templateId", "key");
CREATE INDEX "ChecklistTemplateItem_templateId_sortOrder_idx" ON "ChecklistTemplateItem"("templateId", "sortOrder");
CREATE UNIQUE INDEX "PekerjaanChecklistItem_pekerjaanId_key_key" ON "PekerjaanChecklistItem"("pekerjaanId", "key");
CREATE INDEX "PekerjaanChecklistItem_officeId_pekerjaanId_status_idx" ON "PekerjaanChecklistItem"("officeId", "pekerjaanId", "status");
CREATE INDEX "PekerjaanChecklistItem_officeId_required_status_idx" ON "PekerjaanChecklistItem"("officeId", "required", "status");
CREATE UNIQUE INDEX "PekerjaanChecklistAttachment_itemId_archiveId_key" ON "PekerjaanChecklistAttachment"("itemId", "archiveId");
CREATE INDEX "PekerjaanChecklistAttachment_officeId_archiveId_idx" ON "PekerjaanChecklistAttachment"("officeId", "archiveId");
CREATE INDEX "PekerjaanChecklistAttachment_itemId_createdAt_idx" ON "PekerjaanChecklistAttachment"("itemId", "createdAt");

-- AddForeignKey
ALTER TABLE "ChecklistTemplate" ADD CONSTRAINT "ChecklistTemplate_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChecklistTemplateItem" ADD CONSTRAINT "ChecklistTemplateItem_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ChecklistTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PekerjaanChecklistItem" ADD CONSTRAINT "PekerjaanChecklistItem_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PekerjaanChecklistItem" ADD CONSTRAINT "PekerjaanChecklistItem_pekerjaanId_fkey" FOREIGN KEY ("pekerjaanId") REFERENCES "Pekerjaan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PekerjaanChecklistItem" ADD CONSTRAINT "PekerjaanChecklistItem_templateItemId_fkey" FOREIGN KEY ("templateItemId") REFERENCES "ChecklistTemplateItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PekerjaanChecklistItem" ADD CONSTRAINT "PekerjaanChecklistItem_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PekerjaanChecklistAttachment" ADD CONSTRAINT "PekerjaanChecklistAttachment_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PekerjaanChecklistAttachment" ADD CONSTRAINT "PekerjaanChecklistAttachment_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "PekerjaanChecklistItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PekerjaanChecklistAttachment" ADD CONSTRAINT "PekerjaanChecklistAttachment_archiveId_fkey" FOREIGN KEY ("archiveId") REFERENCES "DocumentArchive"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PekerjaanChecklistAttachment" ADD CONSTRAINT "PekerjaanChecklistAttachment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
