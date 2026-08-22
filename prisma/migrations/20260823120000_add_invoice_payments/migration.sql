-- Invoice and payment records are intentionally rebuilt from the unused MVP
-- placeholders. Refuse the migration if production has started using them.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Invoice") OR EXISTS (SELECT 1 FROM "InvoiceItem") THEN
    RAISE EXCEPTION 'Invoice and InvoiceItem must be empty before installing invoice payments MVP';
  END IF;
END;
$$;

ALTER TYPE "InvoiceStatus" ADD VALUE 'TERBIT';
ALTER TYPE "InvoiceStatus" ADD VALUE 'VOID';

ALTER TYPE "AuditAction" ADD VALUE 'INVOICE_CREATE';
ALTER TYPE "AuditAction" ADD VALUE 'INVOICE_UPDATE';
ALTER TYPE "AuditAction" ADD VALUE 'INVOICE_DELETE';
ALTER TYPE "AuditAction" ADD VALUE 'INVOICE_ISSUE';
ALTER TYPE "AuditAction" ADD VALUE 'INVOICE_VOID';
ALTER TYPE "AuditAction" ADD VALUE 'PAYMENT_CREATE';
ALTER TYPE "AuditAction" ADD VALUE 'PAYMENT_VOID';
ALTER TYPE "AuditTargetType" ADD VALUE 'INVOICE';
ALTER TYPE "AuditTargetType" ADD VALUE 'PAYMENT';

CREATE TYPE "InvoiceItemCategory" AS ENUM (
  'HONORARIUM', 'BIAYA_PROSES', 'TITIPAN_PAJAK', 'TITIPAN_PNBP', 'PAJAK_JASA', 'LAINNYA'
);
CREATE TYPE "PaymentStatus" AS ENUM ('AKTIF', 'VOID');
CREATE TYPE "PaymentMethod" AS ENUM ('TRANSFER', 'TUNAI', 'CEK_GIRO', 'LAINNYA');

DROP TABLE "InvoiceItem";

DROP INDEX "Invoice_officeId_status_idx";
DROP INDEX "Invoice_officeId_number_key";
ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_officeId_fkey";
ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_clientId_fkey";
ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_pekerjaanId_fkey";

ALTER TABLE "Invoice"
  ALTER COLUMN "number" DROP NOT NULL,
  ALTER COLUMN "issuedAt" DROP DEFAULT,
  ALTER COLUMN "issuedAt" DROP NOT NULL,
  ALTER COLUMN "dueDate" TYPE DATE USING "dueDate"::DATE,
  ALTER COLUMN "notes" TYPE TEXT,
  DROP COLUMN "paidAt",
  ADD COLUMN "totalAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "totalPaid" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "snapshotJson" JSONB,
  ADD COLUMN "createdById" TEXT,
  ADD COLUMN "issuedById" TEXT,
  ADD COLUMN "voidedById" TEXT,
  ADD COLUMN "voidedAt" TIMESTAMP(3),
  ADD COLUMN "voidReason" TEXT;

CREATE TABLE "InvoiceItem" (
  "id" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "category" "InvoiceItemCategory" NOT NULL,
  "desc" TEXT NOT NULL,
  "qty" INTEGER NOT NULL DEFAULT 1,
  "unitPrice" DECIMAL(18,2) NOT NULL,
  "lineTotal" DECIMAL(18,2) NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "InvoiceItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Payment" (
  "id" TEXT NOT NULL,
  "officeId" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "paidAt" TIMESTAMP(3) NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "method" "PaymentMethod" NOT NULL,
  "receiptNumber" TEXT NOT NULL,
  "requestKey" TEXT NOT NULL,
  "reference" TEXT,
  "notes" TEXT,
  "recordedById" TEXT,
  "status" "PaymentStatus" NOT NULL DEFAULT 'AKTIF',
  "voidedById" TEXT,
  "voidedAt" TIMESTAMP(3),
  "voidReason" TEXT,
  CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OfficeSequence" (
  "officeId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "lastValue" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "OfficeSequence_pkey" PRIMARY KEY ("officeId", "key")
);

ALTER TABLE "Invoice"
  ADD CONSTRAINT "Invoice_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Invoice_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Invoice_pekerjaanId_fkey" FOREIGN KEY ("pekerjaanId") REFERENCES "Pekerjaan"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Invoice_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Invoice_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Invoice_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InvoiceItem"
  ADD CONSTRAINT "InvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Payment_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Payment_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OfficeSequence"
  ADD CONSTRAINT "OfficeSequence_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Invoice_officeId_number_key" ON "Invoice"("officeId", "number");
CREATE INDEX "Invoice_officeId_status_dueDate_idx" ON "Invoice"("officeId", "status", "dueDate");
CREATE INDEX "Invoice_officeId_clientId_idx" ON "Invoice"("officeId", "clientId");
CREATE INDEX "Invoice_officeId_pekerjaanId_idx" ON "Invoice"("officeId", "pekerjaanId");
CREATE INDEX "InvoiceItem_invoiceId_sortOrder_idx" ON "InvoiceItem"("invoiceId", "sortOrder");
CREATE UNIQUE INDEX "Payment_officeId_receiptNumber_key" ON "Payment"("officeId", "receiptNumber");
CREATE UNIQUE INDEX "Payment_officeId_requestKey_key" ON "Payment"("officeId", "requestKey");
CREATE INDEX "Payment_invoiceId_status_idx" ON "Payment"("invoiceId", "status");
CREATE INDEX "Payment_officeId_paidAt_idx" ON "Payment"("officeId", "paidAt");

ALTER TABLE "Invoice"
  ADD CONSTRAINT "Invoice_status_supported_check" CHECK ("status" IN ('DRAFT', 'TERBIT', 'VOID')),
  ADD CONSTRAINT "Invoice_money_check" CHECK (
    "totalAmount" >= 0 AND "totalAmount" = trunc("totalAmount")
    AND "totalPaid" >= 0 AND "totalPaid" = trunc("totalPaid")
    AND "totalPaid" <= "totalAmount"
  ),
  ADD CONSTRAINT "Invoice_version_check" CHECK ("version" > 0),
  ADD CONSTRAINT "Invoice_number_format_check" CHECK (
    "number" IS NULL OR (
      "number" ~ '^INV/[0-9]{4}/[0-9]{4,}$'
      AND split_part("number", '/', 2)::INTEGER = EXTRACT(YEAR FROM "issuedAt" + INTERVAL '7 hours')::INTEGER
    )
  ),
  ADD CONSTRAINT "Invoice_notes_length_check" CHECK ("notes" IS NULL OR char_length("notes") <= 2000),
  ADD CONSTRAINT "Invoice_lifecycle_check" CHECK (
    ("status" = 'DRAFT' AND "number" IS NULL AND "issuedAt" IS NULL AND "issuedById" IS NULL
      AND "snapshotJson" IS NULL AND "voidedAt" IS NULL AND "voidedById" IS NULL AND "voidReason" IS NULL
      AND "totalPaid" = 0)
    OR
    ("status" = 'TERBIT' AND "number" IS NOT NULL AND "issuedAt" IS NOT NULL AND "issuedById" IS NOT NULL
      AND "snapshotJson" IS NOT NULL AND "voidedAt" IS NULL AND "voidedById" IS NULL AND "voidReason" IS NULL
      AND "totalAmount" > 0)
    OR
    ("status" = 'VOID' AND "number" IS NOT NULL AND "issuedAt" IS NOT NULL AND "issuedById" IS NOT NULL
      AND "snapshotJson" IS NOT NULL AND "voidedAt" IS NOT NULL AND "voidedById" IS NOT NULL
      AND char_length("voidReason") BETWEEN 3 AND 500 AND "totalAmount" > 0 AND "totalPaid" = 0)
  );

ALTER TABLE "InvoiceItem"
  ADD CONSTRAINT "InvoiceItem_description_check" CHECK (char_length("desc") BETWEEN 1 AND 200),
  ADD CONSTRAINT "InvoiceItem_qty_check" CHECK ("qty" BETWEEN 1 AND 999),
  ADD CONSTRAINT "InvoiceItem_money_check" CHECK (
    "unitPrice" >= 0 AND "unitPrice" = trunc("unitPrice")
    AND "lineTotal" >= 0 AND "lineTotal" = trunc("lineTotal")
    AND "lineTotal" = "qty" * "unitPrice"
  ),
  ADD CONSTRAINT "InvoiceItem_sort_order_check" CHECK ("sortOrder" >= 0);

ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_amount_check" CHECK ("amount" > 0 AND "amount" = trunc("amount")),
  ADD CONSTRAINT "Payment_receipt_format_check" CHECK (
    "receiptNumber" ~ '^KWT/[0-9]{4}/[0-9]{4,}$'
    AND split_part("receiptNumber", '/', 2)::INTEGER = EXTRACT(YEAR FROM "paidAt")::INTEGER
  ),
  ADD CONSTRAINT "Payment_request_key_check" CHECK (
    "requestKey" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  ADD CONSTRAINT "Payment_reference_length_check" CHECK ("reference" IS NULL OR char_length("reference") <= 200),
  ADD CONSTRAINT "Payment_notes_length_check" CHECK ("notes" IS NULL OR char_length("notes") <= 2000),
  ADD CONSTRAINT "Payment_lifecycle_check" CHECK (
    ("status" = 'AKTIF' AND "voidedAt" IS NULL AND "voidedById" IS NULL AND "voidReason" IS NULL)
    OR
    ("status" = 'VOID' AND "voidedAt" IS NOT NULL AND "voidedById" IS NOT NULL
      AND char_length("voidReason") BETWEEN 3 AND 500)
  );

ALTER TABLE "OfficeSequence"
  ADD CONSTRAINT "OfficeSequence_value_check" CHECK ("lastValue" >= 0),
  ADD CONSTRAINT "OfficeSequence_key_check" CHECK ("key" ~ '^(INVOICE|RECEIPT):[0-9]{4}$');

CREATE OR REPLACE FUNCTION "validate_invoice_consistency"()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE item_count INTEGER; item_total DECIMAL(18,2);
BEGIN
  PERFORM 1 FROM "Client"
  WHERE "id" = NEW."clientId" AND "officeId" = NEW."officeId" FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice client must belong to the same office'; END IF;

  IF NEW."pekerjaanId" IS NOT NULL THEN
    PERFORM 1 FROM "Pekerjaan" WHERE "id" = NEW."pekerjaanId" AND "officeId" = NEW."officeId" FOR KEY SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Invoice pekerjaan must belong to the same office'; END IF;
    PERFORM 1 FROM "PekerjaanClient" WHERE "pekerjaanId" = NEW."pekerjaanId" AND "clientId" = NEW."clientId";
    IF NOT FOUND THEN RAISE EXCEPTION 'Invoice client must be a party to the pekerjaan'; END IF;
  END IF;

  IF NEW."createdById" IS NOT NULL THEN
    PERFORM 1 FROM "User" WHERE "id" = NEW."createdById" AND "officeId" = NEW."officeId" FOR KEY SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Invoice creator must belong to the same office'; END IF;
  END IF;
  IF NEW."issuedById" IS NOT NULL THEN
    PERFORM 1 FROM "User" WHERE "id" = NEW."issuedById" AND "officeId" = NEW."officeId" FOR KEY SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Invoice issuer must belong to the same office'; END IF;
  END IF;
  IF NEW."voidedById" IS NOT NULL THEN
    PERFORM 1 FROM "User" WHERE "id" = NEW."voidedById" AND "officeId" = NEW."officeId" FOR KEY SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Invoice void actor must belong to the same office'; END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD."status" IN ('TERBIT', 'VOID') THEN
    IF NEW."officeId" IS DISTINCT FROM OLD."officeId"
      OR NEW."number" IS DISTINCT FROM OLD."number"
      OR NEW."clientId" IS DISTINCT FROM OLD."clientId"
      OR NEW."pekerjaanId" IS DISTINCT FROM OLD."pekerjaanId"
      OR NEW."issuedAt" IS DISTINCT FROM OLD."issuedAt"
      OR NEW."dueDate" IS DISTINCT FROM OLD."dueDate"
      OR NEW."notes" IS DISTINCT FROM OLD."notes"
      OR NEW."totalAmount" IS DISTINCT FROM OLD."totalAmount"
      OR NEW."snapshotJson" IS DISTINCT FROM OLD."snapshotJson"
      OR NEW."createdById" IS DISTINCT FROM OLD."createdById"
      OR NEW."issuedById" IS DISTINCT FROM OLD."issuedById"
      OR (OLD."status" = 'VOID' AND NEW."status" IS DISTINCT FROM OLD."status")
      OR (OLD."status" = 'TERBIT' AND NEW."status" NOT IN ('TERBIT', 'VOID')) THEN
      RAISE EXCEPTION 'Issued invoice commercial fields are immutable';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."status" = 'DRAFT' AND NEW."status" NOT IN ('DRAFT', 'TERBIT') THEN
    RAISE EXCEPTION 'Draft invoice may only remain draft or transition to issued';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."status" = 'DRAFT' AND NEW."status" = 'TERBIT' THEN
    SELECT COUNT(*), COALESCE(SUM("lineTotal"), 0)
    INTO item_count, item_total FROM "InvoiceItem" WHERE "invoiceId" = NEW."id";
    IF item_count = 0 OR item_total <= 0 OR item_total IS DISTINCT FROM NEW."totalAmount" THEN
      RAISE EXCEPTION 'Issued invoice total must equal its non-empty item sum';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "Invoice_consistency_trigger"
BEFORE INSERT OR UPDATE ON "Invoice"
FOR EACH ROW EXECUTE FUNCTION "validate_invoice_consistency"();

CREATE OR REPLACE FUNCTION "protect_invoice_delete"()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status" <> 'DRAFT' THEN RAISE EXCEPTION 'Issued invoice records are permanent'; END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER "Invoice_delete_guard_trigger"
BEFORE DELETE ON "Invoice" FOR EACH ROW EXECUTE FUNCTION "protect_invoice_delete"();

CREATE OR REPLACE FUNCTION "validate_invoice_item_mutation"()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE parent_status "InvoiceStatus";
BEGIN
  SELECT "status" INTO parent_status FROM "Invoice"
  WHERE "id" = CASE WHEN TG_OP = 'DELETE' THEN OLD."invoiceId" ELSE NEW."invoiceId" END
  FOR KEY SHARE;
  IF NOT FOUND OR parent_status <> 'DRAFT' THEN RAISE EXCEPTION 'Invoice items may only change while invoice is draft'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "InvoiceItem_draft_only_trigger"
BEFORE INSERT OR UPDATE OR DELETE ON "InvoiceItem"
FOR EACH ROW EXECUTE FUNCTION "validate_invoice_item_mutation"();

CREATE OR REPLACE FUNCTION "validate_payment_consistency"()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE parent_office TEXT; parent_status "InvoiceStatus"; parent_issued TIMESTAMP(3); jakarta_today DATE;
BEGIN
  SELECT "officeId", "status", "issuedAt" INTO parent_office, parent_status, parent_issued
  FROM "Invoice" WHERE "id" = NEW."invoiceId" FOR KEY SHARE;
  IF NOT FOUND OR parent_office <> NEW."officeId" THEN RAISE EXCEPTION 'Payment invoice must belong to the same office'; END IF;
  IF parent_status <> 'TERBIT' THEN RAISE EXCEPTION 'Payments require an issued invoice'; END IF;
  IF NEW."paidAt"::DATE < (parent_issued + INTERVAL '7 hours')::DATE THEN
    RAISE EXCEPTION 'Payment effective date cannot precede invoice issue date';
  END IF;
  jakarta_today := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::DATE;
  IF NEW."paidAt"::DATE > jakarta_today OR NEW."paidAt"::DATE < jakarta_today - 30 THEN
    RAISE EXCEPTION 'Payment effective date must be within the last 30 Jakarta calendar days';
  END IF;
  IF NEW."recordedById" IS NOT NULL THEN
    PERFORM 1 FROM "User" WHERE "id" = NEW."recordedById" AND "officeId" = NEW."officeId" FOR KEY SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Payment recorder must belong to the same office'; END IF;
  END IF;
  IF NEW."voidedById" IS NOT NULL THEN
    PERFORM 1 FROM "User" WHERE "id" = NEW."voidedById" AND "officeId" = NEW."officeId" FOR KEY SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Payment void actor must belong to the same office'; END IF;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW."officeId" IS DISTINCT FROM OLD."officeId"
      OR NEW."invoiceId" IS DISTINCT FROM OLD."invoiceId"
      OR NEW."amount" IS DISTINCT FROM OLD."amount"
      OR NEW."paidAt" IS DISTINCT FROM OLD."paidAt"
      OR NEW."recordedAt" IS DISTINCT FROM OLD."recordedAt"
      OR NEW."method" IS DISTINCT FROM OLD."method"
      OR NEW."receiptNumber" IS DISTINCT FROM OLD."receiptNumber"
      OR NEW."requestKey" IS DISTINCT FROM OLD."requestKey"
      OR NEW."reference" IS DISTINCT FROM OLD."reference"
      OR NEW."notes" IS DISTINCT FROM OLD."notes"
      OR NEW."recordedById" IS DISTINCT FROM OLD."recordedById"
      OR OLD."status" <> 'AKTIF' OR NEW."status" <> 'VOID' THEN
      RAISE EXCEPTION 'Payment commercial fields are immutable; only active payments may be voided';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Payment_consistency_trigger"
BEFORE INSERT OR UPDATE ON "Payment"
FOR EACH ROW EXECUTE FUNCTION "validate_payment_consistency"();

CREATE OR REPLACE FUNCTION "protect_payment_delete"()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Payment records are permanent';
END;
$$;
CREATE TRIGGER "Payment_delete_guard_trigger"
BEFORE DELETE ON "Payment" FOR EACH ROW EXECUTE FUNCTION "protect_payment_delete"();

CREATE OR REPLACE FUNCTION "verify_invoice_payment_total"()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE target_invoice TEXT; expected_total DECIMAL(18,2); stored_total DECIMAL(18,2);
BEGIN
  target_invoice := CASE WHEN TG_OP = 'DELETE' THEN OLD."invoiceId" ELSE NEW."invoiceId" END;
  SELECT COALESCE(SUM("amount"), 0) INTO expected_total FROM "Payment"
  WHERE "invoiceId" = target_invoice AND "status" = 'AKTIF';
  SELECT "totalPaid" INTO stored_total FROM "Invoice" WHERE "id" = target_invoice;
  IF FOUND AND stored_total IS DISTINCT FROM expected_total THEN
    RAISE EXCEPTION 'Invoice totalPaid must equal active payment sum';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "verify_invoice_stored_payment_total"()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE expected_total DECIMAL(18,2);
BEGIN
  SELECT COALESCE(SUM("amount"), 0) INTO expected_total FROM "Payment"
  WHERE "invoiceId" = NEW."id" AND "status" = 'AKTIF';
  IF NEW."totalPaid" IS DISTINCT FROM expected_total THEN
    RAISE EXCEPTION 'Invoice totalPaid must equal active payment sum';
  END IF;
  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER "Payment_total_reconcile_trigger"
AFTER INSERT OR UPDATE OR DELETE ON "Payment"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "verify_invoice_payment_total"();

CREATE CONSTRAINT TRIGGER "Invoice_total_reconcile_trigger"
AFTER INSERT OR UPDATE OF "totalPaid" ON "Invoice"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "verify_invoice_stored_payment_total"();
