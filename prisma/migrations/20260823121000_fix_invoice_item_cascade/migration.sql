CREATE OR REPLACE FUNCTION "validate_invoice_item_mutation"()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE parent_status "InvoiceStatus";
BEGIN
  SELECT "status" INTO parent_status FROM "Invoice"
  WHERE "id" = CASE WHEN TG_OP = 'DELETE' THEN OLD."invoiceId" ELSE NEW."invoiceId" END
  FOR KEY SHARE;

  IF TG_OP = 'DELETE' AND NOT FOUND THEN RETURN OLD; END IF;
  IF NOT FOUND OR parent_status <> 'DRAFT' THEN
    RAISE EXCEPTION 'Invoice items may only change while invoice is draft';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
