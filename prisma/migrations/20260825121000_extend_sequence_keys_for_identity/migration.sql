ALTER TABLE "OfficeSequence" DROP CONSTRAINT "OfficeSequence_key_check";
ALTER TABLE "OfficeSequence" ADD CONSTRAINT "OfficeSequence_key_check" CHECK (
  "key" ~ '^(INVOICE|RECEIPT):[0-9]{4}$'
  OR "key" = 'IDENTITY:profile:'
  OR "key" ~ '^IDENTITY:appointment:(NOTARIS|PPAT|NOTARIS_PENGGANTI)$'
);
