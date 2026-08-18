import assert from "node:assert/strict";
import { test } from "node:test";
import { checklistProgress, checklistProgressPercent, sortChecklistCandidates } from "../src/lib/checklistUi";

test("required progress counts only verified required items", () => {
  const progress = checklistProgress([
    { required: true, status: "TERVERIFIKASI" },
    { required: true, status: "TERLAMPIR" },
    { required: false, status: "DILEWATI" },
  ]);
  assert.deepEqual(progress, { requiredTotal: 2, requiredVerified: 1, optionalTotal: 1, optionalComplete: 1 });
  assert.equal(checklistProgressPercent(progress), 50);
});

test("zero required items uses a neutral zero percent", () => {
  assert.equal(checklistProgressPercent({ requiredTotal: 0, requiredVerified: 0 }), 0);
});

test("candidate sorting prioritizes expected type then newest without mutating input", () => {
  const candidates = [
    { id: "old-match", type: "KTP" as const, createdAt: "2026-01-01T00:00:00.000Z" },
    { id: "new-other", type: "NPWP" as const, createdAt: "2026-03-01T00:00:00.000Z" },
    { id: "new-match", type: "KTP" as const, createdAt: "2026-02-01T00:00:00.000Z" },
  ];
  assert.deepEqual(sortChecklistCandidates(candidates, "KTP").map((item) => item.id), ["new-match", "old-match", "new-other"]);
  assert.equal(candidates[0].id, "old-match");
});
