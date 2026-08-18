import assert from "node:assert/strict";
import { test } from "node:test";
import { safePekerjaanTimelineDescription } from "../src/lib/pekerjaanUi";

test("Staff timeline hides financial field labels but retains safe operational labels", () => {
  const description = safePekerjaanTimelineDescription("PEKERJAAN_UPDATE", {
    changedFields: ["judul", "hargaTransaksi", "bphtb", "pphFinal", "honorarium", "internalNotes"],
  }, "STAF");
  assert.equal(description, "Data pekerjaan diperbarui: judul, catatan internal.");
  for (const hidden of ["harga transaksi", "BPHTB", "PPh Final", "honorarium"]) {
    assert.equal(description.includes(hidden), false);
  }
});

test("Notaris timeline may show financial field labels without values", () => {
  assert.equal(safePekerjaanTimelineDescription("PEKERJAAN_UPDATE", {
    changedFields: ["hargaTransaksi", "bphtb", "pphFinal", "honorarium"],
  }, "NOTARIS"), "Data pekerjaan diperbarui: harga transaksi, BPHTB, PPh Final, honorarium.");
});

test("timeline helper safely handles status and unknown metadata", () => {
  assert.equal(safePekerjaanTimelineDescription("PEKERJAAN_STATUS_CHANGE", {
    previousStatus: "MASUK", newStatus: "PROSES",
  }, "STAF"), "Status diubah dari Masuk menjadi Proses.");
  assert.equal(safePekerjaanTimelineDescription("PEKERJAAN_WORKFLOW_UPDATE", {
    changedFields: ["unknown", 123],
  }, "STAF"), "Alur kerja diperbarui.");
});

test("checklist timeline descriptions expose only allowlisted operational metadata", () => {
  assert.equal(safePekerjaanTimelineDescription("CHECKLIST_APPLY", { addedCount: 3, itemId: "secret" }, "STAF"), "3 item checklist ditambahkan.");
  assert.equal(safePekerjaanTimelineDescription("CHECKLIST_ATTACHMENT_UPDATE", { operation: "ATTACH", attachmentCount: 2, archiveId: "secret", originalName: "PII.pdf" }, "STAF"), "Lampiran checklist ditambahkan; kini ada 2 lampiran pada item.");
  assert.equal(safePekerjaanTimelineDescription("CHECKLIST_STATUS_CHANGE", { previousStatus: "TERLAMPIR", newStatus: "DITOLAK", rejectionReason: "private" }, "STAF"), "Status item checklist diubah dari Terlampir menjadi Ditolak.");
});
