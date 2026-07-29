import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { readArchiveFile } from "@/lib/archiveStorage";
import { createAuditLog } from "@/lib/audit";
import { findOwnedArchive } from "@/lib/archiveAccess";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return new NextResponse("Belum login.", { status: 401 });
  if (session.user.role !== "NOTARIS") return new NextResponse("Akses ditolak.", { status: 403 });
  const { id } = await params;
  const archive = await findOwnedArchive(prisma, session.user.officeId, id);
  if (!archive) return new NextResponse("Arsip tidak ditemukan.", { status: 404 });
  let buffer: Buffer;
  try {
    buffer = readArchiveFile(session.user.officeId, archive.storageKey, archive.checksum);
  } catch {
    return new NextResponse("File arsip tidak ditemukan.", { status: 404 });
  }
  const wantsPreview = new URL(request.url).searchParams.get("preview") === "1";
  const canPreview = archive.mimeType === "application/pdf" || archive.mimeType.startsWith("image/");
  const disposition = wantsPreview && canPreview ? "inline" : "attachment";
  try {
    await createAuditLog(prisma, {
      officeId: session.user.officeId,
      actorId: session.user.id,
      action: disposition === "inline" ? "ARCHIVE_PREVIEW" : "ARCHIVE_DOWNLOAD",
      targetType: "DOCUMENT_ARCHIVE",
      targetId: archive.id,
      metadata: {
        documentType: archive.type,
        mimeType: archive.mimeType,
        mimeCategory: archive.mimeType.split("/", 1)[0] || "unknown",
        byteCount: buffer.length,
        checksum: archive.checksum,
        checksumVerified: true,
      },
    });
  } catch {
    return new NextResponse("Audit akses arsip tidak tersedia.", { status: 503 });
  }
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": archive.mimeType,
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(archive.originalName)}`,
      "Content-Length": String(buffer.length),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox",
      "Referrer-Policy": "no-referrer",
    },
  });
}
