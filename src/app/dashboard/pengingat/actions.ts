"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/auth";
import type { ReminderType } from "@/generated/prisma/enums";
import { requireCurrentActor } from "@/lib/currentActor";
import { createManualReminder, deleteManualReminder, toggleManualReminder } from "@/lib/manualReminderService";
import { prisma } from "@/lib/prisma";
import { assertWritable } from "@/lib/subscription";

function strictDateOnly(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Tanggal jatuh tempo harus berformat YYYY-MM-DD.");
  const [year, month, day] = value.split("-").map(Number);
  if (year < 2000 || year > 2100) throw new Error("Tahun jatuh tempo harus antara 2000 dan 2100.");
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error("Tanggal jatuh tempo bukan tanggal kalender yang valid.");
  }
  return date;
}

function expectedDate(value: string): Date {
  if (!value) throw new Error("Versi pengingat tidak tersedia. Muat ulang halaman lalu coba lagi.");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Versi pengingat tidak valid. Muat ulang halaman lalu coba lagi.");
  return date;
}

function revalidateReminders() {
  revalidatePath("/dashboard/pengingat");
  revalidatePath("/dashboard");
}

export async function createReminderAction(formData: FormData) {
  const session = await requireSession();
  const title = String(formData.get("title") ?? "").trim();
  const dueDateRaw = String(formData.get("dueDate") ?? "").trim();
  const typeRaw = String(formData.get("type") ?? "").trim();
  const validTypes: ReminderType[] = ["LAPOR_WASIAT", "LAPOR_BULANAN", "PAJAK", "LAINNYA"];
  if (!title || title.length > 200) throw new Error("Judul pengingat wajib diisi dan maksimal 200 karakter.");
  if (!dueDateRaw) throw new Error("Tanggal jatuh tempo wajib diisi.");
  if (!validTypes.includes(typeRaw as ReminderType)) throw new Error("Jenis pengingat tidak valid.");
  const dueDate = strictDateOnly(dueDateRaw);

  await prisma.$transaction(async (tx) => {
    const actor = await requireCurrentActor(session.user.id, tx);
    await assertWritable(actor.officeId, tx);
    await createManualReminder(tx, actor, { title, dueDate, type: typeRaw as ReminderType });
  });
  revalidateReminders();
}

export async function toggleReminderAction(id: string, expectedDone: boolean, expectedUpdatedAt: string) {
  const session = await requireSession();
  if (typeof expectedDone !== "boolean") throw new Error("Status pengingat tidak valid. Muat ulang halaman lalu coba lagi.");
  const version = expectedDate(expectedUpdatedAt);
  await prisma.$transaction(async (tx) => {
    const actor = await requireCurrentActor(session.user.id, tx);
    await assertWritable(actor.officeId, tx);
    await toggleManualReminder(tx, actor, id, expectedDone, version);
  });
  revalidateReminders();
}

export async function deleteReminderAction(id: string, expectedUpdatedAt: string) {
  const session = await requireSession();
  const version = expectedDate(expectedUpdatedAt);
  await prisma.$transaction(async (tx) => {
    const actor = await requireCurrentActor(session.user.id, tx);
    await assertWritable(actor.officeId, tx);
    await deleteManualReminder(tx, actor, id, version);
  });
  revalidateReminders();
}
