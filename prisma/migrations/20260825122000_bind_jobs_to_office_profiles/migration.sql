ALTER TABLE "Pekerjaan" ADD COLUMN "officeProfileVersionId" TEXT;
ALTER TABLE "Pekerjaan" ADD CONSTRAINT "Pekerjaan_officeProfileVersionId_fkey"
  FOREIGN KEY ("officeProfileVersionId") REFERENCES "OfficeProfileVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Pekerjaan_officeProfileVersionId_idx" ON "Pekerjaan"("officeProfileVersionId");

UPDATE "Pekerjaan" p SET "officeProfileVersionId" = (
  SELECT v."id" FROM "OfficeProfileVersion" v
  WHERE v."officeId" = p."officeId"
    AND (v."id" = 'legacy-profile-' || p."officeId" OR v."status" = 'PUBLISHED')
  ORDER BY (v."id" = 'legacy-profile-' || p."officeId") DESC, v."version" ASC
  LIMIT 1
);

CREATE OR REPLACE FUNCTION guard_pekerjaan_appointment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."officeProfileVersionId" IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM "OfficeProfileVersion" v WHERE v."id" = NEW."officeProfileVersionId"
   AND v."officeId" = NEW."officeId" AND v."status" <> 'DRAFT'
 ) THEN RAISE EXCEPTION 'Job profile tenant/status mismatch'; END IF;
 IF NEW."appointmentId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "NotaryAppointment" a WHERE a."id" = NEW."appointmentId" AND a."officeId" = NEW."officeId" AND a."status" <> 'DRAFT' AND ((NEW."kind" = 'PPAT' AND a."kind" = 'PPAT') OR (NEW."kind" = 'NOTARIS' AND a."kind" IN ('NOTARIS','NOTARIS_PENGGANTI')))) THEN RAISE EXCEPTION 'Job appointment tenant/type mismatch'; END IF;
 IF TG_OP = 'UPDATE' THEN
   IF NEW."appointmentId" IS DISTINCT FROM OLD."appointmentId" AND EXISTS (SELECT 1 FROM "GeneratedDoc" WHERE "pekerjaanId" = OLD."id" AND "appointmentId" IS DISTINCT FROM NEW."appointmentId") THEN RAISE EXCEPTION 'Generated job appointment provenance cannot change'; END IF;
   -- Profile provenance lives in the immutable artifact snapshot, not a separate FK.
   -- Conservatively lock the binding once any document has been generated.
   IF NEW."officeProfileVersionId" IS DISTINCT FROM OLD."officeProfileVersionId" AND EXISTS (SELECT 1 FROM "GeneratedDoc" WHERE "pekerjaanId" = OLD."id") THEN RAISE EXCEPTION 'Generated job profile provenance cannot change'; END IF;
 END IF;
 RETURN NEW;
END $$;
