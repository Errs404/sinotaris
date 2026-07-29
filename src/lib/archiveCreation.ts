import { prisma } from "@/lib/prisma";
import { extractArchiveText } from "@/lib/archiveExtraction";
import { parseArchiveText } from "@/lib/archiveParser";
import {
  deleteArchiveFile,
  saveArchiveFile,
  validateArchiveFile,
  validateArchiveSignature,
} from "@/lib/archiveStorage";
import { acquireArchiveUploadLock } from "@/lib/archiveUploadLock";
import type { ArchiveTypeValue, ExtractedArchiveData } from "@/lib/archiveTypes";
import { createAuditLog } from "@/lib/audit";

export async function createArchiveFromFile({
  officeId,
  file,
  type,
  clientId = null,
  pekerjaanId = null,
  uploadedById = null,
}: {
  officeId: string;
  file: File;
  type: ArchiveTypeValue;
  clientId?: string | null;
  pekerjaanId?: string | null;
  uploadedById?: string | null;
}): Promise<{ id: string; originalName: string; mimeType: string; extracted: ExtractedArchiveData }> {
  const releaseUpload = await acquireArchiveUploadLock();
  try {
    validateArchiveFile(file);
    const buffer = Buffer.from(await file.arrayBuffer());
    validateArchiveSignature(buffer, file.type);

    const usage = await prisma.documentArchive.aggregate({
      where: { officeId },
      _count: { id: true },
      _sum: { sizeBytes: true },
    });
    if (usage._count.id >= 500) throw new Error("Batas 500 arsip per kantor telah tercapai.");
    if (Number(usage._sum.sizeBytes ?? 0) + file.size > 500 * 1024 * 1024) {
      throw new Error("Kuota arsip kantor 500 MB telah tercapai.");
    }

    let stored: ReturnType<typeof saveArchiveFile> | null = null;
    try {
      stored = saveArchiveFile(officeId, file.name, file.type, buffer);
      const saved = stored;
      const rawText = await extractArchiveText(buffer, file.type);
      const extracted = parseArchiveText(rawText, type);
      const archive = await prisma.$transaction(async (tx) => {
        const created = await tx.documentArchive.create({
          data: {
            officeId,
            clientId,
            pekerjaanId,
            uploadedById,
            type: extracted.documentType,
            status: "PERLU_REVIEW",
            originalName: file.name.slice(0, 200),
            storageKey: saved.storageKey,
            mimeType: file.type,
            sizeBytes: saved.sizeBytes,
            checksum: saved.checksum,
            rawText,
            extractedJson: {
              documentType: extracted.documentType,
              confidence: extracted.confidence,
              fields: extracted.fields,
              warnings: extracted.warnings,
            },
          },
        });
        await createAuditLog(tx, {
          officeId,
          actorId: uploadedById,
          action: "ARCHIVE_UPLOAD",
          targetType: "DOCUMENT_ARCHIVE",
          targetId: created.id,
          metadata: {
            documentType: created.type,
            status: created.status,
            mimeType: created.mimeType,
            mimeCategory: created.mimeType.split("/", 1)[0] || "unknown",
            byteCount: created.sizeBytes,
            checksum: created.checksum,
            hasClient: created.clientId !== null,
            hasPekerjaan: created.pekerjaanId !== null,
          },
        });
        return created;
      });
      return { id: archive.id, originalName: archive.originalName, mimeType: archive.mimeType, extracted };
    } catch (error) {
      if (stored) deleteArchiveFile(officeId, stored.storageKey);
      throw error;
    }
  } finally {
    releaseUpload();
  }
}
