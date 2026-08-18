-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'REMINDER_CREATE';
ALTER TYPE "AuditAction" ADD VALUE 'REMINDER_STATUS_CHANGE';
ALTER TYPE "AuditAction" ADD VALUE 'REMINDER_DELETE';
ALTER TYPE "AuditTargetType" ADD VALUE 'REMINDER';

-- AlterTable
-- The default backfills existing rows and keeps inserts from older application
-- versions compatible during a rolling deployment. Prisma maintains this value
-- on subsequent updates through @updatedAt.
ALTER TABLE "Reminder"
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
