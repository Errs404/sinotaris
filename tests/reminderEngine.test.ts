import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildDynamicReminder,
  buildDynamicReminders,
  filterDynamicReminders,
  paginateDynamicReminders,
  type DynamicReminderCandidate,
} from "../src/lib/reminderEngine";

const today = new Date("2026-08-19T00:00:00.000Z");
const base: DynamicReminderCandidate = {
  id: "job-1", judul: "Akta A", jenis: "Akta", status: "PROSES", dueDate: null,
  pic: { id: "pic-1", name: "Sari" }, checklistItems: [],
};
const due = (days: number) => new Date(today.getTime() + days * 86_400_000);

test("due-date alerts cover overdue, today, H+1, H+3, and exclude H+4", () => {
  for (const days of [-2, 0]) assert.equal(buildDynamicReminder({ ...base, dueDate: due(days) }, today)?.severity, "KRITIS");
  for (const days of [1, 3]) assert.equal(buildDynamicReminder({ ...base, dueDate: due(days) }, today)?.severity, "PERINGATAN");
  assert.equal(buildDynamicReminder({ ...base, dueDate: due(4) }, today), null);
});

test("complete checklist does not suppress due alerts", () => {
  const alert = buildDynamicReminder({
    ...base, dueDate: today, checklistItems: [{ required: true, status: "TERVERIFIKASI" }],
  }, today);
  assert.equal(alert?.severity, "KRITIS");
  assert.equal(alert?.requiredVerified, 1);
  assert.deepEqual(alert?.counts, { empty: 0, rejected: 0, attached: 0 });
});

test("required statuses are grouped while optional items are ignored", () => {
  const alert = buildDynamicReminder({ ...base, dueDate: due(1), checklistItems: [
    { required: true, status: "KOSONG" }, { required: true, status: "KOSONG" },
    { required: true, status: "DITOLAK" }, { required: true, status: "TERLAMPIR" },
    { required: true, status: "TERVERIFIKASI" }, { required: false, status: "DITOLAK" },
  ] }, today);
  assert.equal(alert?.severity, "PERINGATAN");
  assert.deepEqual(alert?.counts, { empty: 2, rejected: 1, attached: 1 });
  assert.equal(alert?.requiredTotal, 5);
  assert.equal(alert?.requiredVerified, 1);
});

test("rejected required items remain visible without or far beyond a due date", () => {
  const checklistItems: DynamicReminderCandidate["checklistItems"] = [{ required: true, status: "DITOLAK" }];
  assert.equal(buildDynamicReminder({ ...base, checklistItems }, today)?.severity, "REVISI");
  assert.equal(buildDynamicReminder({ ...base, dueDate: due(30), checklistItems }, today)?.severity, "REVISI");
});

test("attached-only items never override due alerts and otherwise stay hidden", () => {
  const checklistItems: DynamicReminderCandidate["checklistItems"] = [{ required: true, status: "TERLAMPIR" }];
  assert.equal(buildDynamicReminder({ ...base, dueDate: due(2), checklistItems }, today)?.severity, "PERLU_VERIFIKASI");
  assert.equal(buildDynamicReminder({ ...base, dueDate: null, checklistItems }, today), null);
  assert.equal(buildDynamicReminder({ ...base, dueDate: due(4), checklistItems }, today), null);
});

test("terminal jobs are excluded; results sort, filter, and paginate deterministically", () => {
  assert.equal(buildDynamicReminder({ ...base, status: "SELESAI", dueDate: today }, today), null);
  const alerts = buildDynamicReminders([
    { ...base, id: "b", judul: "Beta", dueDate: due(2) },
    { ...base, id: "c", judul: "Charlie", dueDate: null, checklistItems: [{ required: true, status: "DITOLAK" }] },
    { ...base, id: "a", judul: "Alpha", dueDate: due(-1) },
  ], today);
  assert.deepEqual(alerts.map((item) => item.pekerjaanId), ["a", "b", "c"]);
  assert.equal(filterDynamicReminders(alerts, { severity: "PERINGATAN", picId: "pic-1", query: "beta" }).length, 1);
  assert.deepEqual(paginateDynamicReminders(alerts, 2, 2), {
    items: [alerts[2]], totalItems: 3, totalPages: 2, currentPage: 2,
  });
});
