-- Enforce tenant and pekerjaan consistency for checklist records even when SQL
-- is issued outside Prisma's application services.

CREATE OR REPLACE FUNCTION "enforce_checklist_item_consistency"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM 1
  FROM "Pekerjaan"
  WHERE "id" = NEW."pekerjaanId"
    AND "officeId" = NEW."officeId"
  FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Checklist item pekerjaan must belong to the same office';
  END IF;

  IF NEW."templateItemId" IS NOT NULL THEN
    PERFORM 1
    FROM "ChecklistTemplateItem" item
    JOIN "ChecklistTemplate" template ON template."id" = item."templateId"
    WHERE item."id" = NEW."templateItemId"
      AND template."officeId" = NEW."officeId"
    FOR KEY SHARE OF item, template;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Checklist item template must belong to the same office';
    END IF;
  END IF;

  IF NEW."verifiedById" IS NOT NULL THEN
    PERFORM 1
    FROM "User"
    WHERE "id" = NEW."verifiedById"
      AND "officeId" = NEW."officeId"
    FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Checklist verifier must belong to the same office';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "enforce_checklist_attachment_consistency"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  item_pekerjaan_id TEXT;
BEGIN
  SELECT "pekerjaanId"
  INTO item_pekerjaan_id
  FROM "PekerjaanChecklistItem"
  WHERE "id" = NEW."itemId"
    AND "officeId" = NEW."officeId"
  FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Checklist attachment item must belong to the same office';
  END IF;

  PERFORM 1
  FROM "DocumentArchive"
  WHERE "id" = NEW."archiveId"
    AND "officeId" = NEW."officeId"
    AND "pekerjaanId" = item_pekerjaan_id
  FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Checklist attachment archive must belong to the same office and pekerjaan';
  END IF;

  IF NEW."createdById" IS NOT NULL THEN
    PERFORM 1
    FROM "User"
    WHERE "id" = NEW."createdById"
      AND "officeId" = NEW."officeId"
    FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Checklist attachment creator must belong to the same office';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "PekerjaanChecklistItem_consistency_trigger"
BEFORE INSERT OR UPDATE ON "PekerjaanChecklistItem"
FOR EACH ROW
EXECUTE FUNCTION "enforce_checklist_item_consistency"();

CREATE TRIGGER "PekerjaanChecklistAttachment_consistency_trigger"
BEFORE INSERT OR UPDATE ON "PekerjaanChecklistAttachment"
FOR EACH ROW
EXECUTE FUNCTION "enforce_checklist_attachment_consistency"();
