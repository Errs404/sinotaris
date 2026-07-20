-- AlterTable
ALTER TABLE "GeneratedDoc" ADD COLUMN     "archiveId" TEXT;

-- AddForeignKey
ALTER TABLE "GeneratedDoc" ADD CONSTRAINT "GeneratedDoc_archiveId_fkey" FOREIGN KEY ("archiveId") REFERENCES "DocumentArchive"("id") ON DELETE SET NULL ON UPDATE CASCADE;
