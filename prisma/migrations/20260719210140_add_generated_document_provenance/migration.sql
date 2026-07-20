-- AlterTable
ALTER TABLE "GeneratedDoc" ADD COLUMN     "archiveChecksum" TEXT,
ADD COLUMN     "generatedById" TEXT,
ADD COLUMN     "outputChecksum" TEXT,
ADD COLUMN     "templateChecksum" TEXT;

-- AddForeignKey
ALTER TABLE "GeneratedDoc" ADD CONSTRAINT "GeneratedDoc_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
