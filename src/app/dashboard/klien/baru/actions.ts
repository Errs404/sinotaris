"use server";

import { requireSession } from "@/auth";
import { assertWritable } from "@/lib/subscription";
import { createArchiveFromFile } from "@/lib/archiveCreation";
import type { ArchiveTypeValue } from "@/lib/archiveTypes";
import { finalizeQuarantinedArchive, quarantineArchiveFile, restoreQuarantinedArchive } from "@/lib/archiveStorage";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";
import { lockArchiveForChecklistMutation, reconcileChecklistItemsAfterArchiveDelete } from "@/lib/checklistService";
import { requireCurrentNotaris } from "@/lib/currentActor";

const clientDocumentTypes = new Set<ArchiveTypeValue>(["KTP", "KARTU_KELUARGA", "NPWP", "UMUM"]);

export async function scanClientDocumentAction(formData: FormData) {
  const session = await requireSession();
  const actor = await requireCurrentNotaris(session.user.id);
  await assertWritable(actor.officeId);
  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("Pilih dokumen Klien.");
  const requested = String(formData.get("type") ?? "") as ArchiveTypeValue;
  if (!clientDocumentTypes.has(requested)) throw new Error("Jenis dokumen Klien tidak valid.");

  const result = await createArchiveFromFile({
    officeId: actor.officeId,
    file,
    type: requested,
    uploadedById: actor.id,
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
  const session = await requireSession();
  const actor = await requireCurrentNotaris(session.user.id);
  await assertWritable(actor.officeId);
  let quarantined: ReturnType<typeof quarantineArchiveFile> | null = null;
  try {
    await prisma.$transaction(async (tx) => {
      const current = await requireCurrentNotaris(session.user.id, tx);
      if (current.officeId !== actor.officeId) throw new Error("Kantor pengguna berubah. Silakan masuk kembali.");
      const archive = await lockArchiveForChecklistMutation(tx, current.officeId, archiveId);
      if (!archive
        || archive.uploadedById !== current.id
        || archive.clientId !== null
        || archive.status !== "PERLU_REVIEW") {
        throw new Error("Scan tidak tersedia atau sudah digunakan.");
      }
      const affectedItems = await tx.pekerjaanChecklistAttachment.findMany({
        where: { archiveId: archive.id, officeId: current.officeId },
        select: { itemId: true },
      });
      const affectedChecklistItemIds = [...new Set(affectedItems.map((item) => item.itemId))];
      quarantined = quarantineArchiveFile(current.officeId, archive.storageKey);
      const deleted = await tx.documentArchive.deleteMany({
        where: {
          id: archive.id,
          officeId: current.officeId,
          uploadedById: current.id,
          clientId: null,
          status: "PERLU_REVIEW",
        },
      });
      if (deleted.count !== 1) {
        throw new Error("Scan sedang digunakan proses lain dan tidak dapat dibatalkan.");
      }
      await reconcileChecklistItemsAfterArchiveDelete(
        tx,
        current.officeId,
        affectedChecklistItemIds,
      );
      await createAuditLog(tx, {
        officeId: current.officeId,
        actorId: current.id,
        action: "ARCHIVE_CANCEL_SCAN",
        targetType: "DOCUMENT_ARCHIVE",
        targetId: archive.id,
        metadata: {
          databaseDeleted: true,
          fileDeletePending: true,
          affectedChecklistItemCount: affectedChecklistItemIds.length,
        },
      });
    });
  } catch (error) {
    if (quarantined) restoreQuarantinedArchive(quarantined);
    throw error;
  }
  if (quarantined) {
    try {
      finalizeQuarantinedArchive(quarantined);
    } catch {
      // Database deletion already committed; stale quarantine cleanup is best-effort.
    }
  }
}
