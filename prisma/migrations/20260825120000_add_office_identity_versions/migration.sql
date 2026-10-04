CREATE TYPE "ConfigVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'RETIRED');
CREATE TYPE "NotaryAppointmentKind" AS ENUM ('NOTARIS', 'PPAT', 'NOTARIS_PENGGANTI');
ALTER TYPE "AuditAction" ADD VALUE 'OFFICE_PROFILE_CREATE';
ALTER TYPE "AuditAction" ADD VALUE 'OFFICE_PROFILE_UPDATE';
ALTER TYPE "AuditAction" ADD VALUE 'OFFICE_PROFILE_DELETE';
ALTER TYPE "AuditAction" ADD VALUE 'OFFICE_PROFILE_PUBLISH';
ALTER TYPE "AuditAction" ADD VALUE 'OFFICE_PROFILE_RETIRE';
ALTER TYPE "AuditAction" ADD VALUE 'NOTARY_APPOINTMENT_CREATE';
ALTER TYPE "AuditAction" ADD VALUE 'NOTARY_APPOINTMENT_UPDATE';
ALTER TYPE "AuditAction" ADD VALUE 'NOTARY_APPOINTMENT_DELETE';
ALTER TYPE "AuditAction" ADD VALUE 'NOTARY_APPOINTMENT_PUBLISH';
ALTER TYPE "AuditAction" ADD VALUE 'NOTARY_APPOINTMENT_RETIRE';
ALTER TYPE "AuditAction" ADD VALUE 'OFFICE_UPDATE';
ALTER TYPE "AuditTargetType" ADD VALUE 'OFFICE_PROFILE';
ALTER TYPE "AuditTargetType" ADD VALUE 'NOTARY_APPOINTMENT';
ALTER TYPE "AuditTargetType" ADD VALUE 'OFFICE';

CREATE TABLE "OfficeProfileVersion" (
 "id" TEXT PRIMARY KEY, "officeId" TEXT NOT NULL REFERENCES "Office"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "version" INTEGER NOT NULL CHECK ("version" > 0), "status" "ConfigVersionStatus" NOT NULL DEFAULT 'DRAFT',
 "officeName" TEXT NOT NULL, "address" TEXT, "phone" TEXT, "email" TEXT, "logoStorageKey" TEXT,
 "effectiveFrom" DATE, "effectiveUntil" DATE, "publishedAt" TIMESTAMP(3),
 "createdById" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
 "retiredAt" TIMESTAMP(3), "retiredById" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE, "retireReason" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CHECK ("effectiveUntil" IS NULL OR "effectiveFrom" IS NULL OR "effectiveUntil" >= "effectiveFrom"),
 CHECK (("status" = 'DRAFT' AND "publishedAt" IS NULL AND "retiredAt" IS NULL AND "retireReason" IS NULL AND "retiredById" IS NULL)
 OR ("status" = 'PUBLISHED' AND "publishedAt" IS NOT NULL AND "retiredAt" IS NULL AND "retireReason" IS NULL AND "retiredById" IS NULL)
 OR ("status" = 'RETIRED' AND "publishedAt" IS NOT NULL AND "retiredAt" IS NOT NULL AND "retireReason" IS NOT NULL AND length(trim("retireReason")) BETWEEN 3 AND 500))
);
CREATE UNIQUE INDEX "OfficeProfileVersion_officeId_version_key" ON "OfficeProfileVersion"("officeId", "version");
CREATE INDEX "OfficeProfileVersion_officeId_status_effectiveFrom_effective_idx" ON "OfficeProfileVersion"("officeId", "status", "effectiveFrom", "effectiveUntil");

CREATE TABLE "NotaryAppointment" (
 "id" TEXT PRIMARY KEY, "officeId" TEXT NOT NULL REFERENCES "Office"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "version" INTEGER NOT NULL CHECK ("version" > 0), "status" "ConfigVersionStatus" NOT NULL DEFAULT 'DRAFT',
 "kind" "NotaryAppointmentKind" NOT NULL, "notaryName" TEXT NOT NULL, "title" TEXT, "workArea" TEXT,
 "decreeNumber" TEXT, "decreeDate" DATE, "decreeDateText" TEXT,
 "effectiveFrom" DATE, "effectiveUntil" DATE, "publishedAt" TIMESTAMP(3),
 "supersedesId" TEXT REFERENCES "NotaryAppointment"("id") ON DELETE SET NULL ON UPDATE CASCADE,
 "createdById" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
 "retiredAt" TIMESTAMP(3), "retiredById" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE, "retireReason" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CHECK ("supersedesId" IS DISTINCT FROM "id"),
 CHECK ("effectiveUntil" IS NULL OR "effectiveFrom" IS NULL OR "effectiveUntil" >= "effectiveFrom"),
 CHECK (("status" = 'DRAFT' AND "publishedAt" IS NULL AND "retiredAt" IS NULL AND "retireReason" IS NULL AND "retiredById" IS NULL)
 OR ("status" = 'PUBLISHED' AND "publishedAt" IS NOT NULL AND "retiredAt" IS NULL AND "retireReason" IS NULL AND "retiredById" IS NULL)
 OR ("status" = 'RETIRED' AND "publishedAt" IS NOT NULL AND "retiredAt" IS NOT NULL AND "retireReason" IS NOT NULL AND length(trim("retireReason")) BETWEEN 3 AND 500))
);
CREATE UNIQUE INDEX "NotaryAppointment_officeId_kind_version_key" ON "NotaryAppointment"("officeId", "kind", "version");
CREATE INDEX "NotaryAppointment_officeId_kind_status_effectiveFrom_effectiv_idx" ON "NotaryAppointment"("officeId", "kind", "status", "effectiveFrom", "effectiveUntil");
CREATE INDEX "NotaryAppointment_supersedesId_idx" ON "NotaryAppointment"("supersedesId");
ALTER TABLE "Pekerjaan" ADD COLUMN "appointmentId" TEXT REFERENCES "NotaryAppointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Pekerjaan_appointmentId_idx" ON "Pekerjaan"("appointmentId");
ALTER TABLE "GeneratedDoc" ADD COLUMN "officeId" TEXT, ADD COLUMN "appointmentId" TEXT REFERENCES "NotaryAppointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE, ADD COLUMN "identityJson" JSONB;

INSERT INTO "OfficeProfileVersion" ("id", "officeId", "version", "status", "officeName", "address", "phone", "effectiveFrom", "publishedAt", "createdAt", "updatedAt")
SELECT 'legacy-profile-' || "id", "id", 1, 'PUBLISHED', "name", "address", "phone", "createdAt"::date, "createdAt", "createdAt", "updatedAt" FROM "Office";
INSERT INTO "NotaryAppointment" ("id", "officeId", "version", "status", "kind", "notaryName", "title", "workArea", "decreeNumber", "decreeDateText", "effectiveFrom", "publishedAt", "createdAt", "updatedAt")
SELECT 'legacy-appointment-' || "id", "id", 1, 'PUBLISHED', 'NOTARIS', "notarisName", "notarisTitle", "wilayahKerja", "skNotarisNo", "skNotarisDate", "createdAt"::date, "createdAt", "createdAt", "updatedAt" FROM "Office" WHERE trim("notarisName") <> '';
UPDATE "Pekerjaan" p SET "appointmentId" = a."id" FROM "NotaryAppointment" a WHERE p."officeId" = a."officeId" AND p."kind" = 'NOTARIS';
UPDATE "GeneratedDoc" g SET "officeId" = t."officeId" FROM "DocTemplate" t WHERE g."templateId" = t."id";
UPDATE "GeneratedDoc" g SET "appointmentId" = p."appointmentId" FROM "Pekerjaan" p WHERE g."pekerjaanId" = p."id";
ALTER TABLE "GeneratedDoc" ALTER COLUMN "officeId" SET NOT NULL;
ALTER TABLE "GeneratedDoc" ADD CONSTRAINT "GeneratedDoc_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "GeneratedDoc_officeId_createdAt_idx" ON "GeneratedDoc"("officeId", "createdAt");
CREATE INDEX "GeneratedDoc_appointmentId_idx" ON "GeneratedDoc"("appointmentId");

-- The same transaction lock is used by services for version allocation/publication.
CREATE FUNCTION guard_office_identity_version() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE collision boolean; scope text; old_payload jsonb; new_payload jsonb;
BEGIN
 IF TG_OP = 'DELETE' THEN
   IF OLD."status" <> 'DRAFT' THEN RAISE EXCEPTION 'Published identity history cannot be deleted'; END IF;
   RETURN OLD;
 END IF;
 scope := TG_TABLE_NAME || ':' || NEW."officeId" || ':' || coalesce(to_jsonb(NEW)->>'kind', '');
 PERFORM pg_advisory_xact_lock(hashtextextended(scope, 0));
 IF TG_OP = 'UPDATE' THEN
   IF OLD."officeId" <> NEW."officeId" OR OLD."version" <> NEW."version" OR OLD."id" <> NEW."id"
      OR (to_jsonb(OLD)->>'kind') IS DISTINCT FROM (to_jsonb(NEW)->>'kind') THEN
     RAISE EXCEPTION 'Identity version ownership and number are immutable';
   END IF;
   IF OLD."status" <> 'DRAFT' THEN
     old_payload := to_jsonb(OLD) - ARRAY['status','retiredAt','retiredById','retireReason','updatedAt','createdById','supersedesId'];
     new_payload := to_jsonb(NEW) - ARRAY['status','retiredAt','retiredById','retireReason','updatedAt','createdById','supersedesId'];
     IF old_payload <> new_payload OR (OLD."status" = 'RETIRED' AND NEW."status" <> 'RETIRED')
       OR (NEW."status" NOT IN ('PUBLISHED', 'RETIRED')) THEN RAISE EXCEPTION 'Published identity is immutable'; END IF;
     IF NEW."createdById" IS DISTINCT FROM OLD."createdById" AND NEW."createdById" IS NOT NULL THEN RAISE EXCEPTION 'Creator is immutable'; END IF;
     IF (to_jsonb(NEW)->>'supersedesId') IS DISTINCT FROM (to_jsonb(OLD)->>'supersedesId') AND (to_jsonb(NEW)->>'supersedesId') IS NOT NULL THEN RAISE EXCEPTION 'Predecessor is immutable'; END IF;
     IF OLD."status" = 'RETIRED' AND (NEW."retiredAt" IS DISTINCT FROM OLD."retiredAt" OR NEW."retireReason" IS DISTINCT FROM OLD."retireReason" OR (NEW."retiredById" IS DISTINCT FROM OLD."retiredById" AND NEW."retiredById" IS NOT NULL)) THEN RAISE EXCEPTION 'Retirement is immutable'; END IF;
   ELSIF NEW."status" = 'RETIRED' THEN RAISE EXCEPTION 'Only published identities can be retired'; END IF;
 END IF;
 IF NEW."createdById" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "User" WHERE "id" = NEW."createdById" AND "officeId" = NEW."officeId") THEN RAISE EXCEPTION 'Identity creator tenant mismatch'; END IF;
 IF NEW."retiredById" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "User" WHERE "id" = NEW."retiredById" AND "officeId" = NEW."officeId") THEN RAISE EXCEPTION 'Identity retirement tenant mismatch'; END IF;
 IF TG_TABLE_NAME = 'NotaryAppointment' AND (to_jsonb(NEW)->>'supersedesId') IS NOT NULL THEN
   IF NOT EXISTS (SELECT 1 FROM "NotaryAppointment" WHERE "id" = (to_jsonb(NEW)->>'supersedesId') AND "officeId" = NEW."officeId" AND "kind"::text = (to_jsonb(NEW)->>'kind')) THEN RAISE EXCEPTION 'Predecessor tenant/type mismatch'; END IF;
 END IF;
 IF NEW."status" = 'PUBLISHED' THEN
   EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I x WHERE x."officeId" = $1 AND x."id" <> $2 AND x."status" = ''PUBLISHED'' AND ($5 IS NULL OR to_jsonb(x)->>''kind'' = $5) AND daterange(coalesce(x."effectiveFrom", ''-infinity''::date), coalesce(x."effectiveUntil", ''infinity''::date), ''[]'') && daterange(coalesce($3, ''-infinity''::date), coalesce($4, ''infinity''::date), ''[]''))', TG_TABLE_NAME)
    INTO collision USING NEW."officeId", NEW."id", NEW."effectiveFrom", NEW."effectiveUntil", to_jsonb(NEW)->>'kind';
   IF collision THEN RAISE EXCEPTION 'Published identity effective dates overlap'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER office_profile_version_guard BEFORE INSERT OR UPDATE OR DELETE ON "OfficeProfileVersion" FOR EACH ROW EXECUTE FUNCTION guard_office_identity_version();
CREATE TRIGGER notary_appointment_guard BEFORE INSERT OR UPDATE OR DELETE ON "NotaryAppointment" FOR EACH ROW EXECUTE FUNCTION guard_office_identity_version();

CREATE FUNCTION guard_pekerjaan_appointment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."appointmentId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "NotaryAppointment" a WHERE a."id" = NEW."appointmentId" AND a."officeId" = NEW."officeId" AND a."status" <> 'DRAFT' AND ((NEW."kind" = 'PPAT' AND a."kind" = 'PPAT') OR (NEW."kind" = 'NOTARIS' AND a."kind" IN ('NOTARIS','NOTARIS_PENGGANTI')))) THEN RAISE EXCEPTION 'Job appointment tenant/type mismatch'; END IF;
 IF TG_OP = 'UPDATE' AND NEW."appointmentId" IS DISTINCT FROM OLD."appointmentId" AND EXISTS (SELECT 1 FROM "GeneratedDoc" WHERE "pekerjaanId" = OLD."id" AND "appointmentId" IS DISTINCT FROM NEW."appointmentId") THEN RAISE EXCEPTION 'Generated job appointment provenance cannot change'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER pekerjaan_appointment_guard BEFORE INSERT OR UPDATE ON "Pekerjaan" FOR EACH ROW EXECUTE FUNCTION guard_pekerjaan_appointment();

CREATE FUNCTION guard_generated_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM "DocTemplate" WHERE "id" = NEW."templateId" AND "officeId" = NEW."officeId") THEN RAISE EXCEPTION 'Generated template tenant mismatch'; END IF;
 IF NEW."pekerjaanId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Pekerjaan" WHERE "id" = NEW."pekerjaanId" AND "officeId" = NEW."officeId" AND "appointmentId" IS NOT DISTINCT FROM NEW."appointmentId") THEN RAISE EXCEPTION 'Generated job identity mismatch'; END IF;
 IF NEW."archiveId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "DocumentArchive" WHERE "id" = NEW."archiveId" AND "officeId" = NEW."officeId") THEN RAISE EXCEPTION 'Generated archive tenant mismatch'; END IF;
 IF NEW."generatedById" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "User" WHERE "id" = NEW."generatedById" AND "officeId" = NEW."officeId") THEN RAISE EXCEPTION 'Generated actor tenant mismatch'; END IF;
 IF NEW."appointmentId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "NotaryAppointment" WHERE "id" = NEW."appointmentId" AND "officeId" = NEW."officeId" AND "status" <> 'DRAFT') THEN RAISE EXCEPTION 'Generated appointment tenant mismatch'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER generated_identity_guard BEFORE INSERT OR UPDATE ON "GeneratedDoc" FOR EACH ROW EXECUTE FUNCTION guard_generated_identity();
