-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CLIENT_CREATE', 'CLIENT_UPDATE', 'CLIENT_DELETE', 'PEKERJAAN_CREATE', 'PEKERJAAN_UPDATE', 'PEKERJAAN_DELETE', 'ARCHIVE_UPLOAD', 'ARCHIVE_REVIEW', 'ARCHIVE_CONFIRM', 'ARCHIVE_RELATION_UPDATE', 'ARCHIVE_DELETE', 'ARCHIVE_CANCEL_SCAN', 'ARCHIVE_PREVIEW', 'ARCHIVE_DOWNLOAD', 'GENERATED_DOC_CREATE');

-- CreateEnum
CREATE TYPE "AuditTargetType" AS ENUM ('CLIENT', 'PEKERJAAN', 'DOCUMENT_ARCHIVE', 'GENERATED_DOC');

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "actorId" TEXT,
    "actorRole" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "targetType" "AuditTargetType" NOT NULL,
    "targetId" TEXT,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_officeId_createdAt_idx" ON "AuditLog"("officeId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_officeId_action_createdAt_idx" ON "AuditLog"("officeId", "action", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_officeId_targetType_targetId_createdAt_idx" ON "AuditLog"("officeId", "targetType", "targetId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Validate actor attribution at the database boundary while retaining actorId as
-- an immutable historical snapshot if the User row is later deleted. FOR SHARE
-- prevents concurrent user updates/deletion until the audit insert commits.
CREATE FUNCTION "validate_audit_log_actor"() RETURNS trigger AS $$
DECLARE
    current_role TEXT;
BEGIN
    IF NEW."actorId" IS NULL THEN
        IF NEW."actorRole" <> 'SYSTEM' THEN
            RAISE EXCEPTION 'System audit actor must use SYSTEM role';
        END IF;
        RETURN NEW;
    END IF;

    SELECT "role"::TEXT INTO current_role
    FROM "User"
    WHERE "id" = NEW."actorId"
      AND "officeId" = NEW."officeId"
      AND "isActive" = TRUE
    FOR SHARE;

    IF current_role IS NULL OR current_role <> NEW."actorRole" THEN
        RAISE EXCEPTION 'Audit actor is inactive, has a mismatched role, or belongs to another office';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AuditLog_validate_actor"
BEFORE INSERT ON "AuditLog"
FOR EACH ROW EXECUTE FUNCTION "validate_audit_log_actor"();

-- Prevent application or direct SQL mutation of audit history.
CREATE FUNCTION "reject_audit_log_mutation"() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'AuditLog is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AuditLog_reject_update_delete"
BEFORE UPDATE OR DELETE ON "AuditLog"
FOR EACH ROW EXECUTE FUNCTION "reject_audit_log_mutation"();
