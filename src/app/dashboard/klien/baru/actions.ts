"use server";

import { requireNotaris } from "@/auth";
import { assertWritable } from "@/lib/subscription";
import { createArchiveFromFile } from "@/lib/archiveCreation";
import type { ArchiveTypeValue } from "@/lib/archiveTypes";
import { finalizeQuarantinedArchive, quarantineArchiveFile, restoreQuarantinedArchive } from "@/lib/archiveStorage";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";

const clientDocumentTypes = new Set<ArchiveTypeValue>(["KTP", "KARTU_KELUARGA", "NPWP", "UMUM"]);

export async function scanClientDocumentAction(formData: FormData) {
  const session = await requireNotaris();
  await assertWritable(session.user.officeId);
  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("Pilih dokumen Klien.");
  const requested = String(formData.get("type") ?? "") as ArchiveTypeValue;
  if (!clientDocumentTypes.has(requested)) throw new Error("Jenis dokumen Klien tidak valid.");

  const result = await createArchiveFromFile({
    officeId: session.user.officeId,
    file,
    type: requested,
    uploadedById: session.user.id,
  });

  return {
    archiveId: result.id,
    originalName: result.originalName,
    mimeType: result.mimeType,
    documentType: result.extracted.documentType,
    confidence: result.extracted.confidence,
    fields: result.extracted.fields,
    warnings: result.extracted.warnings,
  };
}

export async function cancelClientScanAction(archiveId: string) {
  const session = await requireNotaris();
  await assertWritable(session.user.officeId);
  const archive = await prisma.documentArchive.findFirst({
    where: {
      id: archiveId,
      officeId: session.user.officeId,
      uploadedById: session.user.id,
      clientId: null,
      status: "PERLU_REVIEW",
    },
    select: { id: true, storageKey: true },
  });
  if (!archive) throw new Error("Scan tidak tersedia atau sudah digunakan.");
  const quarantined = quarantineArchiveFile(session.user.officeId, archive.storageKey);
  try {
    await prisma.$transaction(async (tx) => {
      const deleted = await tx.documentArchive.deleteMany({
        where: {
          id: archive.id,
          officeId: session.user.officeId,
          uploadedById: session.user.id,
          clientId: null,
          status: "PERLU_REVIEW",
        },
      });
      if (deleted.count !== 1) {
        throw new Error("Scan sedang digunakan proses lain dan tidak dapat dibatalkan.");
      }
      await createAuditLog(tx, {
        officeId: session.user.officeId,
        actorId: session.user.id,
        action: "ARCHIVE_CANCEL_SCAN",
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
}
