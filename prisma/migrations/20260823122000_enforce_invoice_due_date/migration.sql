-- Prisma timestamps represent UTC; Jakarta is UTC+07 with no daylight saving.
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_due_after_issue_check"
CHECK ("status"::text NOT IN ('TERBIT', 'VOID') OR "dueDate" IS NULL
  OR "dueDate" >= ("issuedAt" + INTERVAL '7 hours')::date);

CREATE INDEX "Invoice_officeId_createdAt_id_idx"
ON "Invoice" ("officeId", "createdAt" DESC, "id" DESC);
