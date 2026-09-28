ALTER TABLE "Office" ADD COLUMN "offlineLicensingEnabledAt" TIMESTAMP(3);

CREATE TYPE "OfflineLicenseType" AS ENUM ('SUBSCRIPTION', 'PERPETUAL');

CREATE TABLE "SystemInstallation" (
  "id" TEXT NOT NULL DEFAULT 'singleton',
  "installationId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SystemInstallation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OfflineLicense" (
  "id" TEXT NOT NULL,
  "officeId" TEXT NOT NULL,
  "installationId" TEXT NOT NULL,
  "licenseId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "type" "OfflineLicenseType" NOT NULL,
  "plan" "SubscriptionPlan" NOT NULL,
  "issuedAt" TIMESTAMP(3) NOT NULL,
  "validUntil" TIMESTAMP(3),
  "gracePeriodDays" INTEGER NOT NULL DEFAULT 0,
  "payload" TEXT NOT NULL,
  "signature" TEXT NOT NULL,
  "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "importedById" TEXT,
  CONSTRAINT "OfflineLicense_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SystemInstallation_installationId_key" ON "SystemInstallation"("installationId");
CREATE UNIQUE INDEX "OfflineLicense_licenseId_key" ON "OfflineLicense"("licenseId");
CREATE UNIQUE INDEX "OfflineLicense_officeId_sequence_key" ON "OfflineLicense"("officeId", "sequence");
CREATE INDEX "OfflineLicense_officeId_sequence_idx" ON "OfflineLicense"("officeId", "sequence" DESC);

ALTER TABLE "OfflineLicense"
  ADD CONSTRAINT "OfflineLicense_officeId_fkey"
  FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OfflineLicense"
  ADD CONSTRAINT "OfflineLicense_sequence_check" CHECK ("sequence" > 0),
  ADD CONSTRAINT "OfflineLicense_grace_period_check" CHECK ("gracePeriodDays" BETWEEN 0 AND 30),
  ADD CONSTRAINT "OfflineLicense_validity_check" CHECK (
    ("type" = 'PERPETUAL' AND "validUntil" IS NULL)
    OR
    ("type" = 'SUBSCRIPTION' AND "validUntil" IS NOT NULL AND "validUntil" > "issuedAt")
  );
