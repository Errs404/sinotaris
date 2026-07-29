"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireNotaris } from "@/auth";
import { prisma } from "@/lib/prisma";
import { assertWritable } from "@/lib/subscription";
import {
  finalizeQuarantinedArchive,
  quarantineArchiveFile,
  restoreQuarantinedArchive,
} from "@/lib/archiveStorage";
import type { ArchiveTypeValue } from "@/lib/archiveTypes";
import { createArchiveFromFile } from "@/lib/archiveCreation";
import { createAuditLog } from "@/lib/audit";

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
  const type = requestedType(formData);
  const clientId = nullable(formData.get("clientId"));
  const pekerjaanId = nullable(formData.get("pekerjaanId"));
  await validateRelations(session.user.officeId, clientId, pekerjaanId);
  const archive = await createArchiveFromFile({
    officeId: session.user.officeId,
    file,
    type,
    clientId,
    pekerjaanId,
    uploadedById: session.user.id,
  });
  revalidatePath("/dashboard/arsip");
  redirect(`/dashboard/arsip/${archive.id}`);
}

export async function updateArchiveReviewAction(id: string, formData: FormData) {
  const session = await requireNotaris();
  await assertWritable(session.user.officeId);

  const fieldsRaw = String(formData.get("fieldsJson") ?? "{}");
  let fields: Record<string, string>;
  const allowedFields = new Set([
    "name", "nik", "npwp", "tempatLahir", "tanggalLahir", "gender", "pekerjaan", "statusKawin",
    "wargaNegara", "address", "rtRw", "kelurahan", "kecamatan", "kabupaten", "provinsi", "nomorKk",
    "nomorHak", "jenisHak", "luasTanah", "nib", "nomorSuratUkur", "tanggalSuratUkur", "pemegangHak",
    "nomorAkta", "tanggalAkta", "judulDokumen", "paraPihak",
  ]);
  try {
    const parsed = JSON.parse(fieldsRaw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
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

  await prisma.$transaction(async (tx) => {
    const archive = await tx.documentArchive.findFirst({
      where: { id, officeId: session.user.officeId },
      select: { id: true, extractedJson: true },
    });
    if (!archive) throw new Error("Arsip tidak ditemukan.");
    const previous = archive.extractedJson as Record<string, unknown>;
    const previousFields = previous.fields && typeof previous.fields === "object" && !Array.isArray(previous.fields)
      ? previous.fields as Record<string, unknown>
      : {};
    const changedFields = [...new Set([...Object.keys(previousFields), ...Object.keys(fields)])]
      .filter((field) => allowedFields.has(field) && previousFields[field] !== fields[field])
      .sort();
    const updated = await tx.documentArchive.update({
      where: { id: archive.id },
      data: {
        extractedJson: {
          ...previous,
          documentType: previous.documentType ?? "UMUM",
          confidence: previous.confidence ?? 0,
          warnings: previous.warnings ?? [],
          fields,
        },
        status: "DIKONFIRMASI",
      },
      select: { id: true, type: true, status: true },
    });
    await createAuditLog(tx, {
      officeId: session.user.officeId,
      actorId: session.user.id,
      action: "ARCHIVE_REVIEW",
      targetType: "DOCUMENT_ARCHIVE",
      targetId: updated.id,
      metadata: { documentType: updated.type, status: updated.status, changedFields },
    });
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
  const fieldsRaw = String(formData.get("fieldsJson") ?? "{}");
  let fields: Record<string, string>;
  try {
    const parsed = JSON.parse(fieldsRaw) as Record<string, unknown>;
    fields = Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, String(value ?? "").trim().slice(0, 5_000)]));
  } catch {
    throw new Error("Hasil review tidak valid.");
  }
  if (!fields.name) throw new Error("Nama wajib dikoreksi sebelum membuat klien.");
  if (fields.nik) {
    fields.nik = fields.nik.replace(/\D/g, "");
    if (!/^\d{16}$/.test(fields.nik)) throw new Error("NIK harus terdiri dari 16 digit.");
  }
  if (fields.nomorKk) {
    fields.nomorKk = fields.nomorKk.replace(/\D/g, "");
    if (!/^\d{16}$/.test(fields.nomorKk)) throw new Error("Nomor KK harus terdiri dari 16 digit.");
  }

  const existingClientId = nullable(formData.get("existingClientId"));
  if (existingClientId) {
    if (session.user.role !== "NOTARIS") throw new Error("Hanya Notaris yang dapat memperbarui klien lama dari hasil ekstraksi.");
    await prisma.$transaction(async (tx) => {
      const archive = await tx.documentArchive.findFirst({
        where: { id, officeId: session.user.officeId },
      });
      if (!archive) throw new Error("Arsip tidak ditemukan.");
      if (archive.status === "GAGAL" || archive.clientId !== null) {
        throw new Error("Arsip sudah berubah atau terhubung ke Klien lain.");
      }
      const existing = await tx.client.findFirst({
        where: { id: existingClientId, officeId: session.user.officeId },
        select: {
          id: true,
          name: true,
          nik: true,
          nomorKk: true,
          npwp: true,
          tempatLahir: true,
          tanggalLahir: true,
          gender: true,
          pekerjaan: true,
          statusKawin: true,
          wargaNegara: true,
          address: true,
        },
      });
      if (!existing) throw new Error("Klien tujuan tidak ditemukan.");
      const clientData = {
        name: fields.name || existing.name,
        nik: fields.nik || existing.nik,
        nomorKk: fields.nomorKk || existing.nomorKk,
        npwp: fields.npwp || existing.npwp,
        tempatLahir: fields.tempatLahir || existing.tempatLahir,
        tanggalLahir: dateOrNull(fields.tanggalLahir) || existing.tanggalLahir,
        gender: fields.gender || existing.gender,
        pekerjaan: fields.pekerjaan || existing.pekerjaan,
        statusKawin: fields.statusKawin || existing.statusKawin,
        wargaNegara: fields.wargaNegara || existing.wargaNegara,
        address: fields.address || existing.address,
      };
      const changedFields = Object.keys(clientData)
        .filter((field) => {
          const previous = existing[field as keyof typeof existing];
          const next = clientData[field as keyof typeof clientData];
          if (previous instanceof Date || next instanceof Date) {
            return !(previous instanceof Date && next instanceof Date && previous.getTime() === next.getTime());
          }
          return previous !== next;
        })
        .sort();
      await tx.client.update({
        where: { id: existing.id },
        data: clientData,
      });
      const claimed = await tx.documentArchive.updateMany({
        where: {
          id: archive.id,
          officeId: session.user.officeId,
          updatedAt: archive.updatedAt,
          status: archive.status,
          clientId: null,
        },
        data: {
          clientId: existing.id,
          status: "DIKONFIRMASI",
          extractedJson: { ...(archive.extractedJson as object), fields },
        },
      });
      if (claimed.count !== 1) throw new Error("Arsip baru saja diubah oleh proses lain. Silakan ulangi.");
      await createAuditLog(tx, {
        officeId: session.user.officeId,
        actorId: session.user.id,
        action: "CLIENT_UPDATE",
        targetType: "CLIENT",
        targetId: existing.id,
        metadata: {
          changedFields,
          sourceArchiveId: archive.id,
        },
      });
      await createAuditLog(tx, {
        officeId: session.user.officeId,
        actorId: session.user.id,
        action: "ARCHIVE_CONFIRM",
        targetType: "DOCUMENT_ARCHIVE",
        targetId: archive.id,
        metadata: { documentType: archive.type, status: "DIKONFIRMASI", clientId: existing.id, createdClient: false },
      });
    });
  } else {
    await prisma.$transaction(async (tx) => {
      const archive = await tx.documentArchive.findFirst({
        where: { id, officeId: session.user.officeId },
      });
      if (!archive) throw new Error("Arsip tidak ditemukan.");
      if (archive.status === "GAGAL" || archive.clientId !== null) {
        throw new Error("Arsip sudah berubah atau terhubung ke Klien lain.");
      }
      const client = await tx.client.create({
        data: {
          officeId: session.user.officeId,
          type: "PERORANGAN",
          name: fields.name,
          nik: fields.nik || null,
          nomorKk: fields.nomorKk || null,
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
      const claimed = await tx.documentArchive.updateMany({
        where: {
          id: archive.id,
          officeId: session.user.officeId,
          updatedAt: archive.updatedAt,
          status: archive.status,
          clientId: null,
        },
        data: {
          clientId: client.id,
          status: "DIKONFIRMASI",
          extractedJson: { ...(archive.extractedJson as object), fields },
        },
      });
      if (claimed.count !== 1) throw new Error("Arsip baru saja diubah oleh proses lain. Silakan ulangi.");
      await createAuditLog(tx, {
        officeId: session.user.officeId,
        actorId: session.user.id,
        action: "CLIENT_CREATE",
        targetType: "CLIENT",
        targetId: client.id,
        metadata: { clientType: client.type, sourceArchiveId: archive.id },
      });
      await createAuditLog(tx, {
        officeId: session.user.officeId,
        actorId: session.user.id,
        action: "ARCHIVE_CONFIRM",
        targetType: "DOCUMENT_ARCHIVE",
        targetId: archive.id,
        metadata: { documentType: archive.type, status: "DIKONFIRMASI", clientId: client.id, createdClient: true },
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
  await prisma.$transaction(async (tx) => {
    const archive = await tx.documentArchive.findFirst({
      where: { id, officeId: session.user.officeId },
      select: { id: true, clientId: true, pekerjaanId: true, updatedAt: true },
    });
    if (!archive) throw new Error("Arsip tidak ditemukan.");
    const changedFields = [
      ...(archive.clientId !== clientId ? ["clientId"] : []),
      ...(archive.pekerjaanId !== pekerjaanId ? ["pekerjaanId"] : []),
    ];
    if (!changedFields.length) return;
    const updated = await tx.documentArchive.updateMany({
      where: {
        id,
        officeId: session.user.officeId,
        clientId: archive.clientId,
        pekerjaanId: archive.pekerjaanId,
        updatedAt: archive.updatedAt,
      },
      data: { clientId, pekerjaanId },
    });
    if (updated.count !== 1) throw new Error("Relasi arsip baru saja diubah oleh proses lain. Silakan ulangi.");
    await createAuditLog(tx, {
      officeId: session.user.officeId,
      actorId: session.user.id,
      action: "ARCHIVE_RELATION_UPDATE",
      targetType: "DOCUMENT_ARCHIVE",
      targetId: id,
      metadata: {
        changedFields,
        ...(clientId ? { clientId } : {}),
        ...(pekerjaanId ? { pekerjaanId } : {}),
        hasClient: clientId !== null,
        hasPekerjaan: pekerjaanId !== null,
      },
    });
  });
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
    await prisma.$transaction(async (tx) => {
      await tx.documentArchive.delete({ where: { id: archive.id } });
      await createAuditLog(tx, {
        officeId: session.user.officeId,
        actorId: session.user.id,
        action: "ARCHIVE_DELETE",
        targetType: "DOCUMENT_ARCHIVE",
        targetId: archive.id,
        metadata: { databaseDeleted: true, fileDeletePending: true },
      });
    });
  } catch (error) {
    restoreQuarantinedArchive(quarantined);
    throw error;
  }
  finalizeQuarantinedArchive(quarantined);
  revalidatePath("/dashboard/arsip");
  redirect("/dashboard/arsip");
}
