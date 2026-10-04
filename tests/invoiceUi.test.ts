import assert from "node:assert/strict";
import test from "node:test";
import { formatInvoiceMoney, invoiceOutstanding, invoicePaymentState, invoiceDueLabel, jakartaToday, parseInvoiceSnapshot, rupiahInteger } from "../src/lib/invoiceUi";
test("formats exact decimal strings beyond safe integers", () => {
  assert.equal(formatInvoiceMoney("9999999999999999.00"), "Rp 9.999.999.999.999.999");
  assert.equal(formatInvoiceMoney("1234.50"), "Rp 1.234,5");
  assert.equal(formatInvoiceMoney("0"), "Rp 0");
  assert.throws(() => formatInvoiceMoney("1e3"));
});
test("integer preview and payment states remain exact", () => {
  assert.equal((rupiahInteger("9999999999999") * BigInt(999)).toString(), "9989999999999001");
  assert.equal(invoiceOutstanding("9999999999999999", "9999999999999998"), "1");
  assert.equal(invoicePaymentState("100", "0"), "BELUM_BAYAR");
  assert.equal(invoicePaymentState("100", "1"), "SEBAGIAN");
  assert.equal(invoicePaymentState("100", "100"), "LUNAS");
  assert.throws(() => rupiahInteger("1.5"));
  assert.throws(() => rupiahInteger("-1"));
});
test("due labels cross midnight in Jakarta", () => {
  const now = new Date("2026-08-31T17:00:00Z");
  assert.equal(jakartaToday(now), "2026-09-01");
  assert.equal(invoiceDueLabel("2026-08-31", now), "Terlambat 1 hari");
  assert.equal(invoiceDueLabel("2026-09-01", now), "Jatuh tempo hari ini");
  assert.equal(invoiceDueLabel(null, now), "Tanpa jatuh tempo");
});
test("snapshot rejects malformed financial documents", () => {
  assert.equal(parseInvoiceSnapshot(null), null);
  assert.equal(parseInvoiceSnapshot({ items: [] }), null);
  const snapshot = { office: { name: "Kantor", address: null, phone: null }, client: { name: "Klien", address: null }, pekerjaan: null, items: [{ category: "HONORARIUM", desc: "Jasa", qty: 1, unitPrice: "100", lineTotal: "100" }], totalAmount: "100", dueDate: null, notes: null, number: "INV/2026/0001", issuedAt: "2026-08-01T00:00:00Z" };
  assert.deepEqual(parseInvoiceSnapshot(snapshot), snapshot);
  assert.equal(parseInvoiceSnapshot({ ...snapshot, totalAmount: "NaN" }), null);
});
