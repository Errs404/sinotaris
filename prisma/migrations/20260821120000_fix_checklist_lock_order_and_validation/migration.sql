BEGIN;

SET LOCAL lock_timeout = '5s';

-- Abort rather than installing stricter validation over inconsistent existing rows.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "PekerjaanChecklistItem" item
    LEFT JOIN "Pekerjaan" pekerjaan ON pekerjaan."id" = item."pekerjaanId"
    WHERE pekerjaan."id" IS NULL
       OR pekerjaan."officeId" <> item."officeId"
  ) THEN
    RAISE EXCEPTION 'Existing checklist item pekerjaan must belong to the same office';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "PekerjaanChecklistItem" checklist_item
    LEFT JOIN "ChecklistTemplateItem" template_item ON template_item."id" = checklist_item."templateItemId"
    LEFT JOIN "ChecklistTemplate" template ON template."id" = template_item."templateId"
    WHERE checklist_item."templateItemId" IS NOT NULL
      AND (
        template_item."id" IS NULL
        OR template."id" IS NULL
        OR template."officeId" <> checklist_item."officeId"
      )
  ) THEN
    RAISE EXCEPTION 'Existing checklist item template must belong to the same office';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "PekerjaanChecklistItem" item
    LEFT JOIN "User" verifier ON verifier."id" = item."verifiedById"
    WHERE item."verifiedById" IS NOT NULL
      AND (verifier."id" IS NULL OR verifier."officeId" <> item."officeId")
  ) THEN
    RAISE EXCEPTION 'Existing checklist verifier must belong to the same office';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "PekerjaanChecklistAttachment" attachment
    LEFT JOIN "PekerjaanChecklistItem" item ON item."id" = attachment."itemId"
    LEFT JOIN "DocumentArchive" archive ON archive."id" = attachment."archiveId"
    WHERE item."id" IS NULL
       OR archive."id" IS NULL
       OR item."officeId" <> attachment."officeId"
       OR archive."officeId" <> attachment."officeId"
       OR archive."pekerjaanId" IS DISTINCT FROM item."pekerjaanId"
  ) THEN
    RAISE EXCEPTION 'Existing checklist attachment must belong to the same office and pekerjaan';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "PekerjaanChecklistAttachment" attachment
    LEFT JOIN "User" creator ON creator."id" = attachment."createdById"
    WHERE attachment."createdById" IS NOT NULL
      AND (creator."id" IS NULL OR creator."officeId" <> attachment."officeId")
  ) THEN
    RAISE EXCEPTION 'Existing checklist attachment creator must belong to the same office';
  END IF;
END;
$$;

-- Match application lock ordering: archive first, then checklist item.
CREATE OR REPLACE FUNCTION "validate_checklist_attachment_consistency"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  archive_office_id TEXT;
  archive_pekerjaan_id TEXT;
  item_office_id TEXT;
  item_pekerjaan_id TEXT;
BEGIN
  SELECT "officeId", "pekerjaanId"
  INTO archive_office_id, archive_pekerjaan_id
  FROM "DocumentArchive"
  WHERE "id" = NEW."archiveId"
  FOR KEY SHARE;
  IF NOT FOUND
     OR archive_office_id <> NEW."officeId" THEN
    RAISE EXCEPTION 'Checklist attachment archive must belong to the same office and pekerjaan';
  END IF;

  SELECT "officeId", "pekerjaanId"
  INTO item_office_id, item_pekerjaan_id
  FROM "PekerjaanChecklistItem"
  WHERE "id" = NEW."itemId"
  FOR KEY SHARE;
  IF NOT FOUND
     OR item_office_id <> NEW."officeId" THEN
    RAISE EXCEPTION 'Checklist attachment item must belong to the same office';
  END IF;

  IF archive_pekerjaan_id IS DISTINCT FROM item_pekerjaan_id THEN
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

DROP TRIGGER "PekerjaanChecklistAttachment_consistency_trigger"
ON "PekerjaanChecklistAttachment";

CREATE TRIGGER "PekerjaanChecklistAttachment_consistency_trigger"
BEFORE INSERT OR UPDATE ON "PekerjaanChecklistAttachment"
FOR EACH ROW
EXECUTE FUNCTION "validate_checklist_attachment_consistency"();

COMMIT;
