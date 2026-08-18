"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/auth";
import type { ArchiveDocumentType, ChecklistItemStatus } from "@/generated/prisma/enums";
import {
  addManualChecklistItem,
  applyChecklistTemplateForPekerjaan,
  attachArchiveToChecklistItem,
  detachArchiveFromChecklistItem,
  setChecklistItemStatus,
} from "@/lib/checklistService";
import { requireCurrentActor } from "@/lib/currentActor";
import { prisma } from "@/lib/prisma";
import { assertWritable } from "@/lib/subscription";

const DOCUMENT_TYPES = new Set<ArchiveDocumentType>([
  "KTP", "KARTU_KELUARGA", "NPWP", "SERTIPIKAT", "AKTA_PERJANJIAN", "UMUM",
]);
const STATUSES = new Set<ChecklistItemStatus>(["TERVERIFIKASI", "DITOLAK", "DILEWATI"]);

function expectedDate(value?: string): Date {
  if (!value) throw new Error("Versi item checklist tidak tersedia. Muat ulang halaman lalu coba lagi.");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Versi item checklist tidak valid. Muat ulang halaman lalu coba lagi.");
  return date;
}

function revalidatePekerjaan(id: string) {
  revalidatePath(`/dashboard/pekerjaan/${id}`);
  revalidatePath("/dashboard/pekerjaan");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/pengingat");
}

async function mutateChecklist<T>(run: Parameters<typeof prisma.$transaction>[0] extends (tx: infer D) => unknown
  ? (tx: D, actor: Awaited<ReturnType<typeof requireCurrentActor>>) => Promise<T> : never) {
  const session = await requireSession();
  const actor = await requireCurrentActor(session.user.id);
  await assertWritable(actor.officeId);
  return prisma.$transaction(async (tx) => {
    const current = await requireCurrentActor(session.user.id, tx);
    if (current.officeId !== actor.officeId) throw new Error("Kantor pengguna berubah. Silakan masuk kembali.");
    return run(tx, current);
  });
}

export async function applyChecklistTemplateAction(pekerjaanId: string, expectedUpdatedAt?: string) {
  const result = await mutateChecklist((tx, actor) => applyChecklistTemplateForPekerjaan(
    tx, actor, pekerjaanId, expectedUpdatedAt ? expectedDate(expectedUpdatedAt) : undefined,
  ));
  revalidatePekerjaan(pekerjaanId);
  return result;
}

export async function addManualChecklistItemAction(pekerjaanId: string, formData: FormData) {
  const expectedTypeRaw = String(formData.get("expectedType") ?? "").trim();
  const expectedType = expectedTypeRaw || null;
  if (expectedType && !DOCUMENT_TYPES.has(expectedType as ArchiveDocumentType)) throw new Error("Jenis dokumen tidak valid.");
  const sortOrderRaw = String(formData.get("sortOrder") ?? "0").trim();
  if (!/^\d+$/.test(sortOrderRaw)) throw new Error("Urutan item tidak valid.");
  await mutateChecklist((tx, actor) => addManualChecklistItem(tx, actor, pekerjaanId, {
    key: String(formData.get("key") ?? "").trim() || undefined,
    label: String(formData.get("label") ?? ""),
    description: String(formData.get("description") ?? "").trim() || null,
    required: String(formData.get("required") ?? "true") === "true",
    expectedType: expectedType as ArchiveDocumentType | null,
    sortOrder: Number(sortOrderRaw),
  }));
  revalidatePekerjaan(pekerjaanId);
}

export async function attachChecklistArchiveAction(itemId: string, archiveId: string, expectedUpdatedAt: string) {
  const result = await mutateChecklist((tx, actor) => attachArchiveToChecklistItem(
    tx, actor, itemId, archiveId, expectedDate(expectedUpdatedAt),
  ));
  revalidatePekerjaan(result.pekerjaanId);
  revalidatePath(`/dashboard/arsip/${archiveId}`);
  return result;
}

export async function detachChecklistArchiveAction(itemId: string, archiveId: string, expectedUpdatedAt: string) {
  const result = await mutateChecklist((tx, actor) => detachArchiveFromChecklistItem(
    tx, actor, itemId, archiveId, expectedDate(expectedUpdatedAt),
  ));
  revalidatePekerjaan(result.pekerjaanId);
  revalidatePath(`/dashboard/arsip/${archiveId}`);
  return result;
}

export async function setChecklistItemStatusAction(
  itemId: string,
  status: string,
  expectedUpdatedAt: string,
  rejectionReason?: string,
) {
  if (!STATUSES.has(status as ChecklistItemStatus)) throw new Error("Status checklist tidak valid.");
  const result = await mutateChecklist((tx, actor) => setChecklistItemStatus(
    tx, actor, itemId, status as ChecklistItemStatus, expectedDate(expectedUpdatedAt), rejectionReason,
  ));
  revalidatePekerjaan(result.pekerjaanId);
  return result;
}
