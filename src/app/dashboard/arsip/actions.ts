"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireNotaris } from "@/auth";
import { prisma } from "@/lib/prisma";
import { assertWritable } from "@/lib/subscription";
import { extractArchiveText } from "@/lib/archiveExtraction";
import { parseArchiveText } from "@/lib/archiveParser";
import {
  deleteArchiveFile,
  finalizeQuarantinedArchive,
  quarantineArchiveFile,
  restoreQuarantinedArchive,
  saveArchiveFile,
  validateArchiveFile,
  validateArchiveSignature,
} from "@/lib/archiveStorage";
import type { ArchiveTypeValue } from "@/lib/archiveTypes";
import { acquireArchiveUploadLock } from "@/lib/archiveUploadLock";

const validTypes = new Set<ArchiveTypeValue>([
  "KTP",
  "KARTU_KELUARGA",
  "NPWP",
  "SERTIPIKAT",
  "AKTA_PERJANJIAN",
  "UMUM",
]);

function requestedType(formData: FormData): ArchiveTypeValue {
  const value = String(formData.get("type") ?? "UMUM") as ArchiveTypeValue;
  return validTypes.has(value) ? value : "UMUM";
}

function nullable(value: FormDataEntryValue | null): string | null {
  const result = String(value ?? "").trim();
  return result || null;
}

async function validateRelations(officeId: string, clientId: string | null, pekerjaanId: string | null) {
  if (clientId) {
    const client = await prisma.client.findFirst({ where: { id: clientId, officeId }, select: { id: true } });
    if (!client) throw new Error("Klien tidak ditemukan.");
  }
  if (pekerjaanId) {
    const pekerjaan = await prisma.pekerjaan.findFirst({ where: { id: pekerjaanId, officeId }, select: { id: true } });
    if (!pekerjaan) throw new Error("Pekerjaan tidak ditemukan.");
  }
}

export async function uploadArchiveAction(formData: FormData) {
  const session = await requireNotaris();
  await assertWritable(session.user.officeId);

  const file = formData.get("file") as File | null;
  if (!(file instanceof File)) throw new Error("Pilih file yang akan dipindai.");
  const releaseUpload = await acquireArchiveUploadLock();
  let archiveId = "";
  try {
    validateArchiveFile(file);
    const buffer = Buffer.from(await file.arrayBuffer());
    validateArchiveSignature(buffer, file.type);

    const type = requestedType(formData);
    const clientId = nullable(formData.get("clientId"));
    const pekerjaanId = nullable(formData.get("pekerjaanId"));
    await validateRelations(session.user.officeId, clientId, pekerjaanId);
    const usage = await prisma.documentArchive.aggregate({
      where: { officeId: session.user.officeId },
      _count: { id: true },
      _sum: { sizeBytes: true },
    });
    if (usage._count.id >= 500) throw new Error("Batas 500 arsip per kantor telah tercapai.");
    if (Number(usage._sum.sizeBytes ?? 0) + file.size > 500 * 1024 * 1024) {
      throw new Error("Kuota arsip kantor 500 MB telah tercapai.");
    }

    let stored: ReturnType<typeof saveArchiveFile> | null = null;
    try {
      stored = saveArchiveFile(session.user.officeId, file.name, file.type, buffer);
      const rawText = await extractArchiveText(buffer, file.type);
      const extracted = parseArchiveText(rawText, type);
      const archive = await prisma.documentArchive.create({
        data: {
          officeId: session.user.officeId,
          clientId,
          pekerjaanId,
          type: extracted.documentType,
          status: "PERLU_REVIEW",
          originalName: file.name.slice(0, 200),
          storageKey: stored.storageKey,
          mimeType: file.type,
          sizeBytes: stored.sizeBytes,
          checksum: stored.checksum,
          rawText,
          extractedJson: {
            documentType: extracted.documentType,
            confidence: extracted.confidence,
            fields: extracted.fields,
            warnings: extracted.warnings,
          },
        },
      });
      archiveId = archive.id;
    } catch (error) {
      if (stored) deleteArchiveFile(session.user.officeId, stored.storageKey);
      throw error;
    }
  } finally {
    releaseUpload();
  }
  revalidatePath("/dashboard/arsip");
  redirect(`/dashboard/arsip/${archiveId}`);
}

export async function updateArchiveReviewAction(id: string, formData: FormData) {
  const session = await requireNotaris();
  await assertWritable(session.user.officeId);
  const archive = await prisma.documentArchive.findFirst({
    where: { id, officeId: session.user.officeId },
    select: { id: true, extractedJson: true },
  });
  if (!archive) throw new Error("Arsip tidak ditemukan.");

  const fieldsRaw = String(formData.get("fieldsJson") ?? "{}");
  let fields: Record<string, string>;
  try {
    const parsed = JSON.parse(fieldsRaw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    const allowedFields = new Set([
      "name", "nik", "npwp", "tempatLahir", "tanggalLahir", "gender", "pekerjaan", "statusKawin",
      "wargaNegara", "address", "rtRw", "kelurahan", "kecamatan", "kabupaten", "provinsi", "nomorKk",
      "nomorHak", "jenisHak", "luasTanah", "nib", "nomorSuratUkur", "tanggalSuratUkur", "pemegangHak",
      "nomorAkta", "tanggalAkta", "judulDokumen", "paraPihak",
    ]);
    const entries = Object.entries(parsed as Record<string, unknown>);
    if (entries.length > 50) throw new Error();
    fields = Object.fromEntries(
      entries
        .map(([key, value]) => [key.replace(/[^a-zA-Z0-9_]/g, ""), String(value ?? "").trim().slice(0, 5_000)])
        .filter(([key]) => allowedFields.has(key)),
    );
    if (JSON.stringify(fields).length > 50_000) throw new Error();
  } catch {
    throw new Error("Hasil ekstraksi tidak valid.");
  }

  const previous = archive.extractedJson as { documentType?: string; confidence?: number; warnings?: string[] };
  await prisma.documentArchive.update({
    where: { id: archive.id },
    data: {
      extractedJson: {
        documentType: previous.documentType ?? "UMUM",
        confidence: previous.confidence ?? 0,
        warnings: previous.warnings ?? [],
        fields,
      },
      status: "DIKONFIRMASI",
    },
  });
  revalidatePath(`/dashboard/arsip/${id}`);
}

function dateOrNull(value: string | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function confirmArchiveAsClientAction(id: string, formData: FormData) {
  const session = await requireNotaris();
  await assertWritable(session.user.officeId);
  const archive = await prisma.documentArchive.findFirst({
    where: { id, officeId: session.user.officeId },
  });
  if (!archive) throw new Error("Arsip tidak ditemukan.");
  const fieldsRaw = String(formData.get("fieldsJson") ?? "{}");
  let fields: Record<string, string>;
  try {
    const parsed = JSON.parse(fieldsRaw) as Record<string, unknown>;
    fields = Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, String(value ?? "").trim().slice(0, 5_000)]));
  } catch {
    throw new Error("Hasil review tidak valid.");
  }
  if (!fields.name) throw new Error("Nama wajib dikoreksi sebelum membuat klien.");

  const existingClientId = nullable(formData.get("existingClientId"));
  if (existingClientId) {
    if (session.user.role !== "NOTARIS") throw new Error("Hanya Notaris yang dapat memperbarui klien lama dari hasil ekstraksi.");
    const existing = await prisma.client.findFirst({ where: { id: existingClientId, officeId: session.user.officeId } });
    if (!existing) throw new Error("Klien tujuan tidak ditemukan.");
    await prisma.$transaction([
      prisma.client.update({
        where: { id: existing.id },
        data: {
          name: fields.name || existing.name,
          nik: fields.nik || existing.nik,
          npwp: fields.npwp || existing.npwp,
          tempatLahir: fields.tempatLahir || existing.tempatLahir,
          tanggalLahir: dateOrNull(fields.tanggalLahir) || existing.tanggalLahir,
          gender: fields.gender || existing.gender,
          pekerjaan: fields.pekerjaan || existing.pekerjaan,
          statusKawin: fields.statusKawin || existing.statusKawin,
          wargaNegara: fields.wargaNegara || existing.wargaNegara,
          address: fields.address || existing.address,
        },
      }),
      prisma.documentArchive.update({
        where: { id: archive.id },
        data: {
          clientId: existing.id,
          status: "DIKONFIRMASI",
          extractedJson: { ...(archive.extractedJson as object), fields },
        },
      }),
    ]);
  } else {
    await prisma.$transaction(async (tx) => {
      const client = await tx.client.create({
        data: {
          officeId: session.user.officeId,
          type: "PERORANGAN",
          name: fields.name,
          nik: fields.nik || null,
          npwp: fields.npwp || null,
          tempatLahir: fields.tempatLahir || null,
          tanggalLahir: dateOrNull(fields.tanggalLahir),
          gender: fields.gender || null,
          pekerjaan: fields.pekerjaan || null,
          statusKawin: fields.statusKawin || null,
          wargaNegara: fields.wargaNegara || "Indonesia",
          address: fields.address || null,
        },
      });
      await tx.documentArchive.update({
        where: { id: archive.id },
        data: {
          clientId: client.id,
          status: "DIKONFIRMASI",
          extractedJson: { ...(archive.extractedJson as object), fields },
        },
      });
    });
  }
  revalidatePath(`/dashboard/arsip/${id}`);
  revalidatePath("/dashboard/klien");
}

export async function linkArchiveAction(id: string, formData: FormData) {
  const session = await requireNotaris();
  await assertWritable(session.user.officeId);
  const clientId = nullable(formData.get("clientId"));
  const pekerjaanId = nullable(formData.get("pekerjaanId"));
  await validateRelations(session.user.officeId, clientId, pekerjaanId);
  const updated = await prisma.documentArchive.updateMany({
    where: { id, officeId: session.user.officeId },
    data: { clientId, pekerjaanId },
  });
  if (!updated.count) throw new Error("Arsip tidak ditemukan.");
  revalidatePath(`/dashboard/arsip/${id}`);
}

export async function deleteArchiveAction(id: string) {
  const session = await requireNotaris();
  await assertWritable(session.user.officeId);
  const archive = await prisma.documentArchive.findFirst({
    where: { id, officeId: session.user.officeId },
    select: { id: true, storageKey: true },
  });
  if (!archive) throw new Error("Arsip tidak ditemukan.");
  const quarantined = quarantineArchiveFile(session.user.officeId, archive.storageKey);
  try {
    await prisma.documentArchive.delete({ where: { id: archive.id } });
    finalizeQuarantinedArchive(quarantined);
  } catch (error) {
    restoreQuarantinedArchive(quarantined);
    throw error;
  }
  revalidatePath("/dashboard/arsip");
  redirect("/dashboard/arsip");
}
