-- CreateEnum
CREATE TYPE "ArchiveDocumentType" AS ENUM ('KTP', 'KARTU_KELUARGA', 'NPWP', 'SERTIPIKAT', 'AKTA_PERJANJIAN', 'UMUM');

-- CreateEnum
CREATE TYPE "ArchiveStatus" AS ENUM ('PERLU_REVIEW', 'DIKONFIRMASI', 'GAGAL');

-- CreateTable
CREATE TABLE "DocumentArchive" (
    "id" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "clientId" TEXT,
    "pekerjaanId" TEXT,
    "type" "ArchiveDocumentType" NOT NULL DEFAULT 'UMUM',
    "status" "ArchiveStatus" NOT NULL DEFAULT 'PERLU_REVIEW',
    "originalName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "rawText" TEXT NOT NULL DEFAULT '',
    "extractedJson" JSONB NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentArchive_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentArchive_storageKey_key" ON "DocumentArchive"("storageKey");

-- CreateIndex
CREATE INDEX "DocumentArchive_officeId_status_createdAt_idx" ON "DocumentArchive"("officeId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "DocumentArchive_officeId_clientId_idx" ON "DocumentArchive"("officeId", "clientId");

-- CreateIndex
CREATE INDEX "DocumentArchive_officeId_pekerjaanId_idx" ON "DocumentArchive"("officeId", "pekerjaanId");

-- AddForeignKey
ALTER TABLE "DocumentArchive" ADD CONSTRAINT "DocumentArchive_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentArchive" ADD CONSTRAINT "DocumentArchive_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentArchive" ADD CONSTRAINT "DocumentArchive_pekerjaanId_fkey" FOREIGN KEY ("pekerjaanId") REFERENCES "Pekerjaan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
