"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/auth";
import type { ArchiveDocumentType, PekerjaanKind } from "@/generated/prisma/enums";
import {
  createChecklistTemplate,
  deleteChecklistTemplate,
  updateChecklistTemplate,
  type ChecklistTemplateInput,
  type ChecklistTemplateItemInput,
} from "@/lib/checklistService";
import { requireCurrentActor } from "@/lib/currentActor";
import { prisma } from "@/lib/prisma";
import { assertWritable } from "@/lib/subscription";

const DOCUMENT_TYPES = new Set<ArchiveDocumentType>([
  "KTP", "KARTU_KELUARGA", "NPWP", "SERTIPIKAT", "AKTA_PERJANJIAN", "UMUM",
]);

function expectedDate(value: string): Date {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) throw new Error("Versi template tidak valid. Muat ulang halaman lalu coba lagi.");
  return date;
}

function strictItems(value: FormDataEntryValue | null): ChecklistTemplateItemInput[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(value ?? ""));
  } catch {
    throw new Error("Data item checklist tidak valid.");
  }
  if (!Array.isArray(parsed) || parsed.length > 50) throw new Error("Data item checklist tidak valid.");
  return parsed.map((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Data item checklist tidak valid.");
    const item = raw as Record<string, unknown>;
    const allowed = new Set(["key", "label", "description", "required", "expectedType", "sortOrder"]);
    if (Object.keys(item).some((key) => !allowed.has(key))) throw new Error("Data item checklist memiliki kolom yang tidak dikenal.");
    if (typeof item.label !== "string") throw new Error("Label item checklist tidak valid.");
    if (item.key !== undefined && typeof item.key !== "string") throw new Error("Kunci item checklist tidak valid.");
    if (item.description !== undefined && item.description !== null && typeof item.description !== "string") {
      throw new Error("Deskripsi item checklist tidak valid.");
    }
    if (item.required !== undefined && typeof item.required !== "boolean") throw new Error("Penanda wajib item checklist tidak valid.");
    if (item.sortOrder !== undefined && (!Number.isSafeInteger(item.sortOrder) || Number(item.sortOrder) < 0)) {
      throw new Error("Urutan item checklist tidak valid.");
    }
    if (item.expectedType !== undefined && item.expectedType !== null
      && (typeof item.expectedType !== "string" || !DOCUMENT_TYPES.has(item.expectedType as ArchiveDocumentType))) {
      throw new Error("Jenis dokumen item checklist tidak valid.");
    }
    return {
      key: item.key as string | undefined,
      label: item.label,
      description: item.description as string | null | undefined,
      required: item.required as boolean | undefined,
      expectedType: item.expectedType as ArchiveDocumentType | null | undefined,
      sortOrder: item.sortOrder as number | undefined,
    };
  });
}

function templateInput(formData: FormData): ChecklistTemplateInput {
  const kind = String(formData.get("kind") ?? "") as PekerjaanKind;
  if (kind !== "NOTARIS" && kind !== "PPAT") throw new Error("Jenis kelompok pekerjaan tidak valid.");
  const active = formData.get("isActive");
  if (active !== null && active !== "true" && active !== "false") throw new Error("Status template tidak valid.");
  return {
    kind,
    jenis: String(formData.get("jenis") ?? ""),
    name: String(formData.get("name") ?? ""),
    isActive: active === null ? true : active === "true",
    items: strictItems(formData.get("itemsJson")),
  };
}

async function mutateTemplate(run: Parameters<typeof prisma.$transaction>[0] extends (tx: infer T) => unknown ? (tx: T, actor: Awaited<ReturnType<typeof requireCurrentActor>>) => Promise<void> : never) {
  const session = await requireSession();
  const actor = await requireCurrentActor(session.user.id);
  await assertWritable(actor.officeId);
  await prisma.$transaction(async (tx) => {
    const current = await requireCurrentActor(session.user.id, tx);
    if (current.officeId !== actor.officeId) throw new Error("Kantor pengguna berubah. Silakan masuk kembali.");
    await run(tx, current);
  });
  revalidatePath("/dashboard/pengaturan");
  revalidatePath("/dashboard/pengaturan/checklist");
  revalidatePath("/dashboard/pekerjaan");
}

export async function createChecklistTemplateAction(formData: FormData) {
  const input = templateInput(formData);
  await mutateTemplate(async (tx, actor) => { await createChecklistTemplate(tx, actor, input); });
}

export async function updateChecklistTemplateAction(id: string, formData: FormData) {
  const input = templateInput(formData);
  const updatedAt = expectedDate(String(formData.get("expectedUpdatedAt") ?? ""));
  await mutateTemplate(async (tx, actor) => { await updateChecklistTemplate(tx, actor, id, updatedAt, input); });
}

export async function deleteChecklistTemplateAction(id: string, expectedUpdatedAt: string) {
  await mutateTemplate(async (tx, actor) => {
    await deleteChecklistTemplate(tx, actor, id, expectedDate(expectedUpdatedAt));
  });
}
