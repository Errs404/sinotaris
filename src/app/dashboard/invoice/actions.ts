"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/auth";
import type { InvoiceItemCategory, PaymentMethod } from "@/generated/prisma/enums";
import { requireCurrentNotaris } from "@/lib/currentActor";
import {
  createInvoiceDraft, createPayment, deleteInvoiceDraft, issueInvoice,
  updateInvoiceDraft, voidInvoice, voidPayment, type InvoiceDraftInput,
} from "@/lib/invoiceService";
import { prisma } from "@/lib/prisma";
import { assertWritable } from "@/lib/subscription";

const CATEGORIES = new Set<InvoiceItemCategory>([
  "HONORARIUM", "BIAYA_PROSES", "TITIPAN_PAJAK", "TITIPAN_PNBP", "PAJAK_JASA", "LAINNYA",
]);
const METHODS = new Set<PaymentMethod>(["TRANSFER", "TUNAI", "CEK_GIRO", "LAINNYA"]);

function strictVersion(value: FormDataEntryValue | string | number | null) {
  const raw = String(value ?? "").trim();
  if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw))) throw new Error("Versi tagihan tidak valid. Muat ulang halaman lalu coba lagi.");
  return Number(raw);
}

function strictDateOnly(value: string, label: string, optional = false): Date | null {
  if (!value && optional) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${label} harus berformat YYYY-MM-DD.`);
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (year < 2000 || year > 2100 || date.toISOString().slice(0, 10) !== value) throw new Error(`${label} bukan tanggal kalender yang valid.`);
  return date;
}

function parseDraft(formData: FormData): InvoiceDraftInput {
  const raw = String(formData.get("items") ?? "");
  if (!raw || raw.length > 100_000) throw new Error("Data item tagihan tidak valid.");
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error("Data item tagihan bukan JSON yang valid."); }
  if (!Array.isArray(parsed)) throw new Error("Data item tagihan harus berupa daftar.");
  const items = parsed.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Bentuk item tagihan tidak valid.");
    const value = item as Record<string, unknown>;
    const category = String(value.category ?? "") as InvoiceItemCategory;
    if (!CATEGORIES.has(category)) throw new Error("Kategori item tagihan tidak valid.");
    const qty = typeof value.qty === "number" ? value.qty : Number(String(value.qty ?? ""));
    return { category, desc: String(value.desc ?? ""), qty, unitPrice: String(value.unitPrice ?? "") };
  });
  return {
    clientId: String(formData.get("clientId") ?? ""),
    pekerjaanId: String(formData.get("pekerjaanId") ?? "") || null,
    dueDate: strictDateOnly(String(formData.get("dueDate") ?? ""), "Tanggal jatuh tempo", true),
    notes: String(formData.get("notes") ?? "") || null,
    items,
  };
}

function revalidateInvoice(id?: string) {
  revalidatePath("/dashboard/invoice");
  if (id) revalidatePath(`/dashboard/invoice/${id}`);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/pengingat");
}

async function mutate<T>(run: (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], actor: Awaited<ReturnType<typeof requireCurrentNotaris>>) => Promise<T>) {
  const session = await requireSession();
  const actor = await requireCurrentNotaris(session.user.id);
  await assertWritable(actor.officeId);
  return prisma.$transaction(async (tx) => {
    const current = await requireCurrentNotaris(session.user.id, tx);
    if (current.officeId !== actor.officeId) throw new Error("Kantor pengguna berubah. Silakan masuk kembali.");
    await assertWritable(current.officeId, tx);
    return run(tx, current);
  }, { maxWait: 10_000, timeout: 30_000 });
}

export async function createInvoiceAction(formData: FormData) {
  const result = await mutate((tx, actor) => createInvoiceDraft(tx, actor, parseDraft(formData)));
  revalidateInvoice(result.id);
  return result;
}

export async function updateInvoiceAction(id: string, formData: FormData) {
  const version = strictVersion(formData.get("version"));
  const result = await mutate((tx, actor) => updateInvoiceDraft(tx, actor, id, version, parseDraft(formData)));
  revalidateInvoice(id);
  return result;
}

export async function deleteInvoiceAction(id: string, expectedVersion: number) {
  await mutate((tx, actor) => deleteInvoiceDraft(tx, actor, id, strictVersion(expectedVersion)));
  revalidateInvoice(id);
}

export async function issueInvoiceAction(id: string, expectedVersion: number) {
  const result = await mutate((tx, actor) => issueInvoice(tx, actor, id, strictVersion(expectedVersion)));
  revalidateInvoice(id);
  return result;
}

export async function createPaymentAction(invoiceId: string, formData: FormData) {
  const method = String(formData.get("method") ?? "") as PaymentMethod;
  if (!METHODS.has(method)) throw new Error("Metode pembayaran tidak valid.");
  const suppliedRequestKey = String(formData.get("requestKey") ?? "").trim();
  if (!suppliedRequestKey) throw new Error("Kunci permintaan pembayaran wajib tersedia. Muat ulang formulir lalu coba lagi.");
  const result = await mutate((tx, actor) => createPayment(tx, actor, invoiceId, strictVersion(formData.get("version")), {
    amount: String(formData.get("amount") ?? ""),
    paidAt: strictDateOnly(String(formData.get("paidAt") ?? ""), "Tanggal efektif pembayaran")!,
    method,
    requestKey: suppliedRequestKey,
    reference: String(formData.get("reference") ?? "") || null,
    notes: String(formData.get("notes") ?? "") || null,
  }));
  revalidateInvoice(invoiceId);
  return result;
}

export async function voidPaymentAction(invoiceId: string, paymentId: string, expectedVersion: number, reason: string) {
  const result = await mutate((tx, actor) => voidPayment(tx, actor, invoiceId, paymentId, strictVersion(expectedVersion), reason));
  revalidateInvoice(invoiceId);
  return result;
}

export async function voidInvoiceAction(id: string, expectedVersion: number, reason: string) {
  const result = await mutate((tx, actor) => voidInvoice(tx, actor, id, strictVersion(expectedVersion), reason));
  revalidateInvoice(id);
  return result;
}
