import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { readArchiveFile } from "@/lib/archiveStorage";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return new NextResponse("Belum login.", { status: 401 });
  if (session.user.role !== "NOTARIS") return new NextResponse("Akses ditolak.", { status: 403 });
  const { id } = await params;
  const archive = await prisma.documentArchive.findFirst({
    where: { id, officeId: session.user.officeId },
  });
  if (!archive) return new NextResponse("Arsip tidak ditemukan.", { status: 404 });
  try {
    const buffer = readArchiveFile(session.user.officeId, archive.storageKey, archive.checksum);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": archive.mimeType,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(archive.originalName)}`,
        "Content-Length": String(buffer.length),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch {
    return new NextResponse("File arsip tidak ditemukan.", { status: 404 });
  }
}
