import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import {
  createInvoiceDraft, createPayment, deleteInvoiceDraft, derivePaymentState, issueInvoice,
  reconcileInvoiceTotalPaid, updateInvoiceDraft, voidInvoice, voidPayment,
} from "../../src/lib/invoiceService";
import { deleteClientForActor } from "../../src/lib/clientService";
import { getFinanceReminders } from "../../src/lib/reminderService";
import { indonesiaTodayDateOnly } from "../../src/lib/pekerjaanUi";
import { createTenantFixtures } from "./fixtures";
import { expectDatabaseRejection, inRollbackTransaction, prisma } from "./testDatabase";

const item = (unitPrice = "1000000") => ({ category: "HONORARIUM" as const, desc: "Jasa akta", qty: 1, unitPrice });
const today = indonesiaTodayDateOnly();

test("draft CRUD is Notaris-only, tenant scoped, OCC-safe, exact, and no-op aware", async () => {
  await inRollbackTransaction(async (tx) => {
    const f = await createTenantFixtures(tx);
    const staff = await tx.user.create({ data: { officeId: f.officeA.id, name: "Staff A", email: `invoice-staff-${f.suffix}@integration.test`, passwordHash: "x", role: "STAF" } });
    await assert.rejects(createInvoiceDraft(tx, staff, { clientId: f.clientA.id, items: [item()] }), /hanya untuk Notaris/);
    await assert.rejects(createInvoiceDraft(tx, f.actorA, { clientId: f.clientB.id, items: [item()] }), /kantor lain/);
    const pekerjaan = await tx.pekerjaan.create({ data: { officeId: f.officeA.id, kind: "NOTARIS", jenis: "Akta", judul: "Pekerjaan invoice" } });
    await assert.rejects(createInvoiceDraft(tx, f.actorA, { clientId: f.clientA.id, pekerjaanId: pekerjaan.id, items: [item()] }), /terdaftar sebagai pihak/);
    await tx.pekerjaanClient.create({ data: { pekerjaanId: pekerjaan.id, clientId: f.clientA.id, peran: "Penghadap" } });

    const draft = await createInvoiceDraft(tx, f.actorA, { clientId: f.clientA.id, pekerjaanId: pekerjaan.id, dueDate: today, notes: "Catatan", items: [item("1.000.000"), { ...item("250000"), category: "TITIPAN_PAJAK", qty: 2 }] });
    const stored = await tx.invoice.findUniqueOrThrow({ where: { id: draft.id }, include: { items: { orderBy: { sortOrder: "asc" } } } });
    assert.equal(stored.number, null);
    assert.equal(stored.issuedAt, null);
    assert.equal(stored.totalAmount.toFixed(0), "1500000");
    assert.equal(stored.items[1].lineTotal.toFixed(0), "500000");

    const auditCount = await tx.auditLog.count({ where: { targetId: draft.id } });
    const noOp = await updateInvoiceDraft(tx, f.actorA, draft.id, 1, { clientId: f.clientA.id, pekerjaanId: pekerjaan.id, dueDate: today, notes: "Catatan", items: [item("1000000"), { ...item("250000"), category: "TITIPAN_PAJAK", qty: 2 }] });
    assert.equal(noOp.changed, false);
    assert.equal(await tx.auditLog.count({ where: { targetId: draft.id } }), auditCount);
    const updated = await updateInvoiceDraft(tx, f.actorA, draft.id, 1, { clientId: f.clientA.id, pekerjaanId: pekerjaan.id, items: [item("2000000")] });
    assert.equal(updated.version, 2);
    await assert.rejects(updateInvoiceDraft(tx, f.actorA, draft.id, 1, { clientId: f.clientA.id, items: [item()] }), /sudah diubah/);
    await deleteInvoiceDraft(tx, f.actorA, draft.id, 2);
    assert.equal(await tx.invoice.count({ where: { id: draft.id } }), 0);
  });
});

test("issue allocates permanent yearly numbers, snapshots safe fields, and freezes commercial data", async () => {
  await inRollbackTransaction(async (tx) => {
    const f = await createTenantFixtures(tx);
    await tx.client.update({ where: { id: f.clientA.id }, data: { nik: "SECRET-NIK", email: "secret@example.test", phone: "SECRET-PHONE", address: "Alamat snapshot" } });
    const first = await createInvoiceDraft(tx, f.actorA, { clientId: f.clientA.id, items: [item()] });
    const second = await createInvoiceDraft(tx, f.actorA, { clientId: f.clientA.id, items: [item("2")] });
    const issued1 = await issueInvoice(tx, f.actorA, first.id, 1, new Date("2026-08-20T03:00:00Z"));
    const issued2 = await issueInvoice(tx, f.actorA, second.id, 1, new Date("2026-08-20T04:00:00Z"));
    assert.match(issued1.number, /^INV\/2026\/\d{4}$/);
    assert.notEqual(issued1.number, issued2.number);
    const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: first.id } });
    const snapshot = JSON.stringify(invoice.snapshotJson);
    assert.equal(snapshot.includes("SECRET-NIK"), false);
    assert.equal(snapshot.includes("secret@example.test"), false);
    assert.equal(snapshot.includes("SECRET-PHONE"), false);
    await expectDatabaseRejection(tx, "issued_immutable", () => tx.invoice.update({ where: { id: first.id }, data: { notes: "ubah" } }), /commercial fields are immutable/);
    await expectDatabaseRejection(tx, "issued_item_immutable", () => tx.invoiceItem.create({ data: { invoiceId: first.id, category: "LAINNYA", desc: "x", qty: 1, unitPrice: 1, lineTotal: 1 } }), /only change while invoice is draft/);
    await expectDatabaseRejection(tx, "issued_delete", () => tx.invoice.delete({ where: { id: first.id } }), /records are permanent/);
  });
});

test("partial/final payments, overpay prevention, dates, idempotency, voids, and reconciliation work", async () => {
  await inRollbackTransaction(async (tx) => {
    const f = await createTenantFixtures(tx);
    const draft = await createInvoiceDraft(tx, f.actorA, { clientId: f.clientA.id, dueDate: today, items: [item()] });
    const issueDate = new Date(today); issueDate.setUTCDate(issueDate.getUTCDate() - 19); issueDate.setUTCHours(3);
    const beforeIssue = new Date(today); beforeIssue.setUTCDate(beforeIssue.getUTCDate() - 20);
    const tomorrow = new Date(today); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const issued = await issueInvoice(tx, f.actorA, draft.id, 1, issueDate);
    await assert.rejects(createPayment(tx, f.actorA, draft.id, issued.version, { amount: "1", paidAt: beforeIssue, method: "TUNAI", requestKey: randomUUID() }, today), /sebelum tanggal terbit/);
    await assert.rejects(createPayment(tx, f.actorA, draft.id, issued.version, { amount: "1", paidAt: tomorrow, method: "TUNAI", requestKey: randomUUID() }, today), /melewati hari ini/);
    const requestKey = randomUUID();
    const partial = await createPayment(tx, f.actorA, draft.id, issued.version, { amount: "400000", paidAt: today, method: "TRANSFER", requestKey, reference: "PRIVATE-REF" }, today);
    assert.equal(partial.paymentState, "SEBAGIAN");
    assert.match(partial.receiptNumber, new RegExp(`^KWT/${today.getUTCFullYear()}/\\d{4}$`));
    await assert.rejects(createPayment(tx, f.actorA, draft.id, partial.invoiceVersion, { amount: "1", paidAt: today, method: "TUNAI", requestKey }, today), /sudah pernah diproses/);
    await assert.rejects(createPayment(tx, f.actorA, draft.id, partial.invoiceVersion, { amount: "600001", paidAt: today, method: "TUNAI", requestKey: randomUUID() }, today), /melebihi sisa/);
    const final = await createPayment(tx, f.actorA, draft.id, partial.invoiceVersion, { amount: "600000", paidAt: today, method: "TUNAI", requestKey: randomUUID() }, today);
    assert.equal(final.paymentState, "LUNAS");
    assert.equal(derivePaymentState("100", "0"), "BELUM_BAYAR");
    assert.equal((await reconcileInvoiceTotalPaid(tx, f.officeA.id, draft.id)).matches, true);
    await assert.rejects(voidInvoice(tx, f.actorA, draft.id, final.invoiceVersion, "Batalkan"), /pembayaran aktif/);
    const voided = await voidPayment(tx, f.actorA, draft.id, partial.id, final.invoiceVersion, "Salah transfer", today);
    assert.equal(voided.paymentState, "SEBAGIAN");
    await expectDatabaseRejection(tx, "payment_delete", () => tx.payment.delete({ where: { id: final.id } }), /records are permanent/);
    const auditJson = JSON.stringify((await tx.auditLog.findMany({ where: { targetId: { in: [partial.id, final.id] } }, select: { metadata: true } })).map((row) => row.metadata));
    assert.equal(auditJson.includes("400000"), false);
    assert.equal(auditJson.includes("PRIVATE-REF"), false);
    assert.equal(auditJson.includes(partial.receiptNumber), false);
  });
});

test("invoice void requires no active payment; finance reminders are Notaris-only; client deletion is explicit", async () => {
  await inRollbackTransaction(async (tx) => {
    const f = await createTenantFixtures(tx);
    const due = today;
    const draft = await createInvoiceDraft(tx, f.actorA, { clientId: f.clientA.id, dueDate: due, items: [item()] });
    const issuedAt = new Date(today); issuedAt.setUTCDate(issuedAt.getUTCDate() - 1); issuedAt.setUTCHours(3);
    const issued = await issueInvoice(tx, f.actorA, draft.id, 1, issuedAt);
    const staff = await tx.user.create({ data: { officeId: f.officeA.id, name: "Finance Staff", email: `finance-staff-${f.suffix}@integration.test`, passwordHash: "x", role: "STAF" } });
    assert.equal((await getFinanceReminders(tx, staff, today)).length, 0);
    const reminders = await getFinanceReminders(tx, f.actorA, today);
    assert.deepEqual(reminders.map((row) => row.invoiceId), [draft.id]);
    assert.equal(JSON.stringify(reminders).includes(issued.number), false);
    await assert.rejects(deleteClientForActor(tx, f.actorA, f.clientA.id), /riwayat tagihan/);
    await voidInvoice(tx, f.actorA, draft.id, issued.version, "Tidak dilanjutkan", today);
    assert.equal((await tx.invoice.findUniqueOrThrow({ where: { id: draft.id } })).status, "VOID");
    assert.equal((await getFinanceReminders(tx, f.actorA, today)).length, 0);
  });
});

test("database constraints reject cross-office actors, invalid money, and totalPaid drift", async () => {
  await inRollbackTransaction(async (tx) => {
    const f = await createTenantFixtures(tx);
    await expectDatabaseRejection(tx, "cross_office_creator", () => tx.invoice.create({ data: { officeId: f.officeA.id, clientId: f.clientA.id, createdById: f.actorB.id } }), /creator must belong to the same office/);
    const draft = await createInvoiceDraft(tx, f.actorA, { clientId: f.clientA.id, items: [item()] });
    await expectDatabaseRejection(tx, "fractional_money", () => tx.invoiceItem.create({ data: { invoiceId: draft.id, category: "LAINNYA", desc: "pecahan", qty: 1, unitPrice: "1.5", lineTotal: "1.5" } }), /InvoiceItem_money_check/);
    await issueInvoice(tx, f.actorA, draft.id, 1);
    await expectDatabaseRejection(tx, "total_drift", async () => {
      await tx.invoice.update({ where: { id: draft.id }, data: { totalPaid: 1 } });
      await tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
    }, /must equal active payment sum/);
  });
});

test("concurrent issue numbers stay distinct and invoice locking prevents aggregate overpayment", async () => {
  const setup = await prisma.$transaction(async (tx) => {
    const f = await createTenantFixtures(tx);
    const first = await createInvoiceDraft(tx, f.actorA, { clientId: f.clientA.id, items: [item()] });
    const second = await createInvoiceDraft(tx, f.actorA, { clientId: f.clientA.id, items: [item()] });
    return { actor: f.actorA, first, second };
  });

  const issueOne = (id: string) => prisma.$transaction(
    (tx) => issueInvoice(tx, setup.actor, id, 1),
    { maxWait: 10_000, timeout: 30_000 },
  );
  const [firstIssued, secondIssued] = await Promise.all([issueOne(setup.first.id), issueOne(setup.second.id)]);
  assert.notEqual(firstIssued.number, secondIssued.number);

  const pay = (requestKey: string) => prisma.$transaction(
    (tx) => createPayment(tx, setup.actor, setup.first.id, firstIssued.version, {
      amount: "700000", paidAt: indonesiaTodayDateOnly(), method: "TRANSFER", requestKey,
    }),
    { maxWait: 10_000, timeout: 30_000 },
  );
  const results = await Promise.allSettled([pay(randomUUID()), pay(randomUUID())]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  const stored = await prisma.invoice.findUniqueOrThrow({ where: { id: setup.first.id } });
  assert.equal(stored.totalPaid.toFixed(0), "700000");
  assert.equal((await reconcileInvoiceTotalPaid(prisma, setup.actor.officeId, setup.first.id)).matches, true);
});
