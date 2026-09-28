CREATE TYPE "DossierStage" AS ENUM (
  'PENGUMPULAN_DATA', 'PENYUSUNAN_DRAFT', 'SIAP_TANDA_TANGAN',
  'SUDAH_TANDA_TANGAN', 'PROSES_INSTANSI', 'SELESAI', 'DIBATALKAN'
);

ALTER TABLE "Pekerjaan"
  ADD COLUMN "dossierStage" "DossierStage" NOT NULL DEFAULT 'PENGUMPULAN_DATA',
  ADD COLUMN "signingScheduledAt" TIMESTAMP(3),
  ADD COLUMN "signingLocation" TEXT;

ALTER TABLE "PekerjaanClient" ADD COLUMN "capacity" TEXT;

CREATE TABLE "PekerjaanLandObject" (
  "id" TEXT NOT NULL, "officeId" TEXT NOT NULL, "pekerjaanId" TEXT NOT NULL,
  "label" TEXT, "hakType" TEXT, "certificateNumber" TEXT, "nib" TEXT, "nop" TEXT,
  "address" TEXT, "luasTanah" DECIMAL(12,2), "luasBangunan" DECIMAL(12,2),
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PekerjaanLandObject_pkey" PRIMARY KEY ("id")
);

INSERT INTO "PekerjaanLandObject" (
  "id", "officeId", "pekerjaanId", "label", "nop", "luasTanah", "luasBangunan", "sortOrder", "updatedAt"
)
SELECT CONCAT("id", '-legacy-land'), "officeId", "id", 'Objek tanah utama', "nop", "luasTanah", "luasBangunan", 0, CURRENT_TIMESTAMP
FROM "Pekerjaan"
WHERE "kind" = 'PPAT' AND ("nop" IS NOT NULL OR "luasTanah" IS NOT NULL OR "luasBangunan" IS NOT NULL);

CREATE INDEX "Pekerjaan_officeId_dossierStage_signingScheduledAt_idx"
  ON "Pekerjaan"("officeId", "dossierStage", "signingScheduledAt");
CREATE INDEX "PekerjaanLandObject_officeId_pekerjaanId_sortOrder_idx"
  ON "PekerjaanLandObject"("officeId", "pekerjaanId", "sortOrder");

ALTER TABLE "PekerjaanLandObject"
  ADD CONSTRAINT "PekerjaanLandObject_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "PekerjaanLandObject_pekerjaanId_fkey" FOREIGN KEY ("pekerjaanId") REFERENCES "Pekerjaan"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "PekerjaanLandObject_sortOrder_check" CHECK ("sortOrder" >= 0),
  ADD CONSTRAINT "PekerjaanLandObject_luas_check" CHECK (("luasTanah" IS NULL OR "luasTanah" >= 0) AND ("luasBangunan" IS NULL OR "luasBangunan" >= 0));

CREATE OR REPLACE FUNCTION "validate_pekerjaan_land_object_tenant"()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Pekerjaan" WHERE "id" = NEW."pekerjaanId" AND "officeId" = NEW."officeId") THEN
    RAISE EXCEPTION 'Objek tanah dan pekerjaan harus berasal dari kantor yang sama';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PekerjaanLandObject_tenant_trigger"
BEFORE INSERT OR UPDATE OF "officeId", "pekerjaanId" ON "PekerjaanLandObject"
FOR EACH ROW EXECUTE FUNCTION "validate_pekerjaan_land_object_tenant"();
