-- Fix actor validation so the active actor, office, and snapshotted role are
-- checked in one predicate while the matching User row is locked for the insert.
CREATE OR REPLACE FUNCTION "validate_audit_log_actor"() RETURNS trigger AS $$
BEGIN
    IF NEW."actorId" IS NULL THEN
        IF NEW."actorRole" <> 'SYSTEM' THEN
            RAISE EXCEPTION 'System audit actor must use SYSTEM role';
        END IF;
        RETURN NEW;
    END IF;

    PERFORM 1
    FROM "User"
    WHERE "id" = NEW."actorId"
      AND "officeId" = NEW."officeId"
      AND "isActive" = TRUE
      AND "role"::TEXT = NEW."actorRole"
    FOR SHARE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Audit actor is inactive, has a mismatched role, or belongs to another office';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
