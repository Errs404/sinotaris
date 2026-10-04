import assert from "node:assert/strict";
import test from "node:test";
import { identityPeriod, identityPreviewValues } from "../src/lib/officeIdentityUi";

test("preview replaces legacy identity while preserving job values", () => {
  const values = identityPreviewValues({ nama_notaris: "Legacy", nomor_akta: "10" }, { nama_notaris: "Published" });
  assert.equal(values.nama_notaris, "Published");
  assert.equal(values.nomor_akta, "10");
  assert.equal(values.alamat_kantor, "");
});
test("unresolved identity clears legacy values", () => {
  assert.equal(identityPreviewValues({ nama_notaris: "Legacy" }, null).nama_notaris, "");
});
test("period supports open and inclusive date-only boundaries", () => {
  assert.equal(identityPeriod({ effectiveFrom: null, effectiveUntil: null }), "Tanpa awal — Tanpa akhir");
  assert.equal(identityPeriod({ effectiveFrom: new Date("2026-01-01T00:00:00Z"), effectiveUntil: "2026-12-31" }), "2026-01-01 — 2026-12-31");
});
