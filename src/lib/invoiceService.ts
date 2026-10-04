import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { InvoiceItemCategory, PaymentMethod, UserRole } from "@/generated/prisma/enums";
import { createAuditLog } from "@/lib/audit";
import type { CurrentActor } from "@/lib/currentActor";
import { indonesiaTodayDateOnly } from "@/lib/pekerjaanUi";
import { multiplyRupiah, parseRupiah, serializeRupiah, sumRupiah } from "@/lib/money";
import { resolveDocumentIdentity } from "@/lib/officeIdentity";

export type DbClient = Prisma.TransactionClient;
export type InvoiceReadDb = PrismaClient | Prisma.TransactionClient;

const CATEGORIES = new Set<InvoiceItemCategory>([
  "HONORARIUM", "BIAYA_PROSES", "TITIPAN_PAJAK", "TITIPAN_PNBP", "PAJAK_JASA", "LAINNYA",
]);
const METHODS = new Set<PaymentMethod>(["TRANSFER", "TUNAI", "CEK_GIRO", "LAINNYA"]);
const STALE = "Tagihan sudah diubah oleh pengguna lain. Muat ulang halaman lalu coba lagi.";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface InvoiceItemInput {
  category: InvoiceItemCategory;
  desc: string;
  qty: number;
  unitPrice: string;
}

export interface InvoiceDraftInput {
  clientId: string;
  pekerjaanId?: string | null;
  dueDate?: Date | null;
  notes?: string | null;
  items: InvoiceItemInput[];
}

export interface PaymentInput {
  amount: string;
  paidAt: Date;
  method: PaymentMethod;
  requestKey: string;
  reference?: string | null;
  notes?: string | null;
}

type NormalizedItem = {
  category: InvoiceItemCategory;
  desc: string;
  qty: number;
  unitPrice: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
  sortOrder: number;
};

async function assertNotaris(db: DbClient, actor: CurrentActor) {
  if (actor.role !== "NOTARIS") throw new Error("Akses tagihan dan pembayaran hanya untuk Notaris.");
  const current = await db.user.findFirst({
    where: { id: actor.id, officeId: actor.officeId, role: "NOTARIS", isActive: true },
    select: { id: true },
  });
  if (!current) throw new Error("Akun Notaris tidak aktif atau bukan anggota kantor.");
}

function dateOnly(value: Date | null | undefined, label: string): Date | null {
  if (value == null) return null;
  if (!(value instanceof Date) || Number.isNaN(value.getTime())
    || value.getUTCHours() || value.getUTCMinutes() || value.getUTCSeconds() || value.getUTCMilliseconds()) {
    throw new Error(`${label} harus berupa tanggal kalender tanpa waktu.`);
  }
  return value;
}

function optionalText(value: string | null | undefined, label: string, max: number) {
  const normalized = value?.trim() || null;
  if (normalized && normalized.length > max) throw new Error(`${label} maksimal ${max} karakter.`);
  return normalized;
}

function normalizeDraft(input: InvoiceDraftInput) {
  const clientId = input.clientId.trim();
  if (!clientId) throw new Error("Klien wajib dipilih.");
  if (!Array.isArray(input.items) || input.items.length > 50) throw new Error("Tagihan maksimal memiliki 50 item.");
  const items: NormalizedItem[] = input.items.map((item, sortOrder) => {
    if (!CATEGORIES.has(item.category)) throw new Error("Kategori item tagihan tidak valid.");
    const desc = item.desc.trim();
    if (!desc || desc.length > 200) throw new Error("Deskripsi item wajib diisi dan maksimal 200 karakter.");
    if (!Number.isInteger(item.qty) || item.qty < 1 || item.qty > 999) throw new Error("Kuantitas item harus 1 sampai 999.");
    const unitPrice = parseRupiah(item.unitPrice);
    return { category: item.category, desc, qty: item.qty, unitPrice, lineTotal: multiplyRupiah(unitPrice, item.qty), sortOrder };
  });
  const totalAmount = sumRupiah(items.map((item) => item.lineTotal));
  if (totalAmount.greaterThan("9999999999999999")) throw new Error("Total tagihan melebihi batas nominal.");
  return {
    clientId,
    pekerjaanId: input.pekerjaanId?.trim() || null,
    dueDate: dateOnly(input.dueDate, "Tanggal jatuh tempo"),
    notes: optionalText(input.notes, "Catatan", 2000),
    items,
    totalAmount,
  };
}

async function validateLinks(db: DbClient, officeId: string, clientId: string, pekerjaanId: string | null) {
  const client = await db.client.findFirst({ where: { id: clientId, officeId }, select: { id: true } });
  if (!client) throw new Error("Klien tidak ditemukan atau berasal dari kantor lain.");
  if (!pekerjaanId) return;
  const pekerjaan = await db.pekerjaan.findFirst({
    where: { id: pekerjaanId, officeId, clients: { some: { clientId } } }, select: { id: true },
  });
  if (!pekerjaan) throw new Error("Pekerjaan harus berasal dari kantor yang sama dan klien harus terdaftar sebagai pihak.");
}

function sameDate(a: Date | null, b: Date | null) { return a?.getTime() === b?.getTime(); }
function sameItems(existing: Array<{ category: InvoiceItemCategory; desc: string; qty: number; unitPrice: Prisma.Decimal; sortOrder: number }>, next: NormalizedItem[]) {
  return existing.length === next.length && existing.every((item, index) => {
    const other = next[index];
    return item.category === other.category && item.desc === other.desc && item.qty === other.qty
      && item.unitPrice.equals(other.unitPrice) && item.sortOrder === other.sortOrder;
  });
}

async function lockInvoice(db: DbClient, actor: CurrentActor, id: string) {
  const rows = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "Invoice" WHERE "id" = ${id} AND "officeId" = ${actor.officeId} FOR UPDATE
  `);
  if (!rows.length) throw new Error("Tagihan tidak ditemukan.");
  return db.invoice.findUniqueOrThrow({
    where: { id }, include: {
      office: { select: { name: true, address: true, phone: true } },
      client: { select: { name: true, address: true } },
      pekerjaan: { select: { judul: true, jenis: true } },
      items: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
    },
  });
}

async function allocateSequence(db: DbClient, officeId: string, prefix: "INVOICE" | "RECEIPT", year: number) {
  const key = `${prefix}:${year}`;
  const rows = await db.$queryRaw<Array<{ lastValue: number }>>(Prisma.sql`
    INSERT INTO "OfficeSequence" ("officeId", "key", "lastValue")
    VALUES (${officeId}, ${key}, 1)
    ON CONFLICT ("officeId", "key") DO UPDATE
    SET "lastValue" = "OfficeSequence"."lastValue" + 1
    RETURNING "lastValue"
  `);
  return rows[0].lastValue;
}

function jakartaParts(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(value);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { year: Number(map.year), date: `${map.year}-${map.month}-${map.day}` };
}

export function derivePaymentState(totalAmount: Prisma.Decimal | string, totalPaid: Prisma.Decimal | string) {
  const total = new Prisma.Decimal(totalAmount);
  const paid = new Prisma.Decimal(totalPaid);
  return paid.isZero() ? "BELUM_BAYAR" as const : paid.lessThan(total) ? "SEBAGIAN" as const : "LUNAS" as const;
}

export async function createInvoiceDraft(db: DbClient, actor: CurrentActor, input: InvoiceDraftInput) {
  await assertNotaris(db, actor);
  const data = normalizeDraft(input);
  await validateLinks(db, actor.officeId, data.clientId, data.pekerjaanId);
  const invoice = await db.invoice.create({ data: {
    officeId: actor.officeId, clientId: data.clientId, pekerjaanId: data.pekerjaanId,
    dueDate: data.dueDate, notes: data.notes, totalAmount: data.totalAmount, createdById: actor.id,
    items: { create: data.items },
  }, select: { id: true, version: true } });
  await createAuditLog(db, { officeId: actor.officeId, actorId: actor.id, action: "INVOICE_CREATE", targetType: "INVOICE", targetId: invoice.id,
    metadata: { itemCount: data.items.length, categories: [...new Set(data.items.map((item) => item.category))].sort(), hasDueDate: !!data.dueDate },
  });
  return invoice;
}

export async function updateInvoiceDraft(db: DbClient, actor: CurrentActor, id: string, expectedVersion: number, input: InvoiceDraftInput) {
  await assertNotaris(db, actor);
  const data = normalizeDraft(input);
  const existing = await db.invoice.findFirst({
    where: { id, officeId: actor.officeId }, include: { items: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } },
  });
  if (!existing) throw new Error("Tagihan tidak ditemukan.");
  if (existing.status !== "DRAFT") throw new Error("Hanya tagihan draft yang dapat diubah.");
  if (existing.version !== expectedVersion) throw new Error(STALE);
  await validateLinks(db, actor.officeId, data.clientId, data.pekerjaanId);
  const changedFields = [
    ...(existing.clientId !== data.clientId ? ["clientId"] : []),
    ...(existing.pekerjaanId !== data.pekerjaanId ? ["pekerjaanId"] : []),
    ...(!sameDate(existing.dueDate, data.dueDate) ? ["dueDate"] : []),
    ...(existing.notes !== data.notes ? ["notes"] : []),
    ...(!sameItems(existing.items, data.items) ? ["items"] : []),
  ];
  if (!changedFields.length) return { id, version: existing.version, changed: false };
  const claimed = await db.invoice.updateMany({ where: { id, officeId: actor.officeId, status: "DRAFT", version: expectedVersion }, data: {
    clientId: data.clientId, pekerjaanId: data.pekerjaanId, dueDate: data.dueDate, notes: data.notes,
    totalAmount: data.totalAmount, version: { increment: 1 },
  } });
  if (claimed.count !== 1) throw new Error(STALE);
  await db.invoiceItem.deleteMany({ where: { invoiceId: id } });
  if (data.items.length) await db.invoiceItem.createMany({ data: data.items.map((item) => ({ ...item, invoiceId: id })) });
  await createAuditLog(db, { officeId: actor.officeId, actorId: actor.id, action: "INVOICE_UPDATE", targetType: "INVOICE", targetId: id,
    metadata: { changedFields: changedFields.sort(), itemCount: data.items.length, categories: [...new Set(data.items.map((item) => item.category))].sort(), hasDueDate: !!data.dueDate },
  });
  return { id, version: expectedVersion + 1, changed: true };
}

export async function deleteInvoiceDraft(db: DbClient, actor: CurrentActor, id: string, expectedVersion: number) {
  await assertNotaris(db, actor);
  const existing = await db.invoice.findFirst({ where: { id, officeId: actor.officeId }, select: { status: true, version: true } });
  if (!existing) throw new Error("Tagihan tidak ditemukan.");
  if (existing.status !== "DRAFT") throw new Error("Tagihan yang sudah diterbitkan tidak dapat dihapus permanen.");
  if (existing.version !== expectedVersion) throw new Error(STALE);
  const deleted = await db.invoice.deleteMany({ where: { id, officeId: actor.officeId, status: "DRAFT", version: expectedVersion } });
  if (deleted.count !== 1) throw new Error(STALE);
  await createAuditLog(db, { officeId: actor.officeId, actorId: actor.id, action: "INVOICE_DELETE", targetType: "INVOICE", targetId: id, metadata: {} });
}

export async function issueInvoice(db: DbClient, actor: CurrentActor, id: string, expectedVersion: number, now = new Date()) {
  await assertNotaris(db, actor);
  const invoice = await lockInvoice(db, actor, id);
  if (invoice.status !== "DRAFT") throw new Error("Hanya tagihan draft yang dapat diterbitkan.");
  if (invoice.version !== expectedVersion) throw new Error(STALE);
  if (!invoice.items.length || !invoice.totalAmount.greaterThan(0)) throw new Error("Tagihan harus memiliki item dan total lebih dari nol sebelum diterbitkan.");
  if (invoice.dueDate && invoice.dueDate < indonesiaTodayDateOnly(now)) {
    throw new Error("Tanggal jatuh tempo tidak boleh sebelum tanggal terbit di Jakarta.");
  }
  const { year } = jakartaParts(now);
  const sequence = await allocateSequence(db, actor.officeId, "INVOICE", year);
  const number = `INV/${year}/${String(sequence).padStart(4, "0")}`;
  const identity = invoice.pekerjaanId ? await resolveDocumentIdentity(db, actor.officeId, invoice.pekerjaanId, now) : null;
  const snapshot = {
    office: identity ? { name: identity.profile.officeName, address: identity.profile.address, phone: identity.profile.phone } : invoice.office,
    ...(identity ? { identity: { ...identity } } : {}),
    client: invoice.client,
    pekerjaan: invoice.pekerjaan,
    items: invoice.items.map((item) => ({ category: item.category, desc: item.desc, qty: item.qty,
      unitPrice: serializeRupiah(item.unitPrice), lineTotal: serializeRupiah(item.lineTotal) })),
    totalAmount: serializeRupiah(invoice.totalAmount), dueDate: invoice.dueDate?.toISOString().slice(0, 10) ?? null,
    notes: invoice.notes, number, issuedAt: now.toISOString(),
  };
  await db.invoice.update({ where: { id }, data: { status: "TERBIT", number, issuedAt: now, issuedById: actor.id, snapshotJson: snapshot, version: { increment: 1 } } });
  await createAuditLog(db, { officeId: actor.officeId, actorId: actor.id, action: "INVOICE_ISSUE", targetType: "INVOICE", targetId: id,
    metadata: { itemCount: invoice.items.length, hasDueDate: !!invoice.dueDate },
  });
  return { id, number, version: expectedVersion + 1 };
}

async function activePaymentTotal(db: DbClient, invoiceId: string) {
  const result = await db.payment.aggregate({ where: { invoiceId, status: "AKTIF" }, _sum: { amount: true } });
  return result._sum.amount ?? new Prisma.Decimal(0);
}

export async function createPayment(db: DbClient, actor: CurrentActor, invoiceId: string, expectedVersion: number, input: PaymentInput, now = new Date()) {
  await assertNotaris(db, actor);
  if (!UUID.test(input.requestKey)) throw new Error("Kunci permintaan pembayaran harus berupa UUID yang valid.");
  if (!METHODS.has(input.method)) throw new Error("Metode pembayaran tidak valid.");
  const amount = parseRupiah(input.amount);
  if (!amount.greaterThan(0)) throw new Error("Nominal pembayaran harus lebih dari nol.");
  const paidAt = dateOnly(input.paidAt, "Tanggal efektif pembayaran")!;
  const invoice = await lockInvoice(db, actor, invoiceId);
  await db.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${actor.officeId}:${input.requestKey}`}, 0))`);
  const reference = optionalText(input.reference, "Referensi", 200);
  const notes = optionalText(input.notes, "Catatan pembayaran", 2000);
  const duplicate = await db.payment.findFirst({ where: { officeId: actor.officeId, requestKey: input.requestKey } });
  if (duplicate) {
    if (duplicate.invoiceId !== invoiceId || !duplicate.amount.equals(amount)
      || duplicate.paidAt.getTime() !== paidAt.getTime() || duplicate.method !== input.method
      || duplicate.reference !== reference || duplicate.notes !== notes) {
      throw new Error("Kunci permintaan pembayaran sudah digunakan untuk data pembayaran yang berbeda.");
    }
    return { id: duplicate.id, receiptNumber: duplicate.receiptNumber, invoiceVersion: invoice.version,
      paymentState: derivePaymentState(invoice.totalAmount, invoice.totalPaid), replayed: true };
  }
  if (invoice.status !== "TERBIT") throw new Error("Pembayaran hanya dapat dicatat untuk tagihan terbit.");
  if (invoice.version !== expectedVersion) throw new Error(STALE);
  const paidDate = paidAt.toISOString().slice(0, 10);
  const today = indonesiaTodayDateOnly(now);
  const earliest = new Date(today); earliest.setUTCDate(earliest.getUTCDate() - 30);
  const issuedDate = jakartaParts(invoice.issuedAt!).date;
  if (paidDate < issuedDate) throw new Error("Tanggal pembayaran tidak boleh sebelum tanggal terbit tagihan.");
  if (paidAt > today) throw new Error("Tanggal pembayaran tidak boleh melewati hari ini di Jakarta.");
  if (paidAt < earliest) throw new Error("Tanggal pembayaran hanya boleh dimundurkan maksimal 30 hari.");
  const reconciled = await activePaymentTotal(db, invoiceId);
  if (!reconciled.equals(invoice.totalPaid)) await db.invoice.update({ where: { id: invoiceId }, data: { totalPaid: reconciled } });
  const outstanding = invoice.totalAmount.minus(reconciled);
  if (amount.greaterThan(outstanding)) throw new Error("Nominal pembayaran melebihi sisa tagihan.");
  const year = Number(paidDate.slice(0, 4));
  const sequence = await allocateSequence(db, actor.officeId, "RECEIPT", year);
  const receiptNumber = `KWT/${year}/${String(sequence).padStart(4, "0")}`;
  const payment = await db.payment.create({ data: {
    officeId: actor.officeId, invoiceId, amount, paidAt, method: input.method, receiptNumber,
    requestKey: input.requestKey, reference,
    notes, recordedById: actor.id,
  }, select: { id: true } });
  const totalPaid = reconciled.plus(amount);
  await db.invoice.update({ where: { id: invoiceId }, data: { totalPaid, version: { increment: 1 } } });
  await createAuditLog(db, { officeId: actor.officeId, actorId: actor.id, action: "PAYMENT_CREATE", targetType: "PAYMENT", targetId: payment.id,
    metadata: { invoiceId, method: input.method, completed: totalPaid.equals(invoice.totalAmount) },
  });
  return { id: payment.id, receiptNumber, invoiceVersion: expectedVersion + 1, paymentState: derivePaymentState(invoice.totalAmount, totalPaid), replayed: false };
}

export async function voidPayment(db: DbClient, actor: CurrentActor, invoiceId: string, paymentId: string, expectedInvoiceVersion: number, reason: string, now = new Date()) {
  await assertNotaris(db, actor);
  const normalizedReason = optionalText(reason, "Alasan pembatalan", 500);
  if (!normalizedReason || normalizedReason.length < 3) throw new Error("Alasan pembatalan minimal 3 karakter.");
  const invoice = await lockInvoice(db, actor, invoiceId);
  if (invoice.status !== "TERBIT") throw new Error("Pembayaran hanya dapat dibatalkan pada tagihan terbit.");
  if (invoice.version !== expectedInvoiceVersion) throw new Error(STALE);
  const locked = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "Payment" WHERE "id" = ${paymentId} AND "invoiceId" = ${invoiceId} AND "officeId" = ${actor.officeId} FOR UPDATE
  `);
  if (!locked.length) throw new Error("Pembayaran tidak ditemukan.");
  const payment = await db.payment.findUniqueOrThrow({ where: { id: paymentId } });
  if (payment.status !== "AKTIF") throw new Error("Pembayaran sudah dibatalkan.");
  const reconciled = await activePaymentTotal(db, invoiceId);
  if (!reconciled.equals(invoice.totalPaid)) await db.invoice.update({ where: { id: invoiceId }, data: { totalPaid: reconciled } });
  const totalPaid = reconciled.minus(payment.amount);
  await db.payment.update({ where: { id: paymentId }, data: { status: "VOID", voidedAt: now, voidedById: actor.id, voidReason: normalizedReason } });
  await db.invoice.update({ where: { id: invoiceId }, data: { totalPaid, version: { increment: 1 } } });
  await createAuditLog(db, { officeId: actor.officeId, actorId: actor.id, action: "PAYMENT_VOID", targetType: "PAYMENT", targetId: paymentId,
    metadata: { invoiceId, previousStatus: "AKTIF", newStatus: "VOID" },
  });
  return { invoiceVersion: expectedInvoiceVersion + 1, paymentState: derivePaymentState(invoice.totalAmount, totalPaid) };
}

export async function voidInvoice(db: DbClient, actor: CurrentActor, id: string, expectedVersion: number, reason: string, now = new Date()) {
  await assertNotaris(db, actor);
  const normalizedReason = optionalText(reason, "Alasan pembatalan", 500);
  if (!normalizedReason || normalizedReason.length < 3) throw new Error("Alasan pembatalan minimal 3 karakter.");
  const invoice = await lockInvoice(db, actor, id);
  if (invoice.status !== "TERBIT") throw new Error("Hanya tagihan terbit yang dapat dibatalkan.");
  if (invoice.version !== expectedVersion) throw new Error(STALE);
  const active = await activePaymentTotal(db, id);
  if (!active.isZero() || !invoice.totalPaid.isZero()) throw new Error("Tagihan dengan pembayaran aktif tidak dapat dibatalkan.");
  await db.invoice.update({ where: { id }, data: { status: "VOID", voidedAt: now, voidedById: actor.id, voidReason: normalizedReason, version: { increment: 1 } } });
  await createAuditLog(db, { officeId: actor.officeId, actorId: actor.id, action: "INVOICE_VOID", targetType: "INVOICE", targetId: id, metadata: {} });
  return { id, version: expectedVersion + 1 };
}

export async function reconcileInvoiceTotalPaid(db: InvoiceReadDb, officeId: string, invoiceId: string) {
  const invoice = await db.invoice.findFirst({ where: { id: invoiceId, officeId }, select: { totalPaid: true } });
  if (!invoice) throw new Error("Tagihan tidak ditemukan.");
  const result = await db.payment.aggregate({ where: { invoiceId, officeId, status: "AKTIF" }, _sum: { amount: true } });
  const activeTotal = result._sum.amount ?? new Prisma.Decimal(0);
  return { storedTotal: invoice.totalPaid, activeTotal, matches: invoice.totalPaid.equals(activeTotal) };
}

export function canViewFinance(role: UserRole) { return role === "NOTARIS"; }
