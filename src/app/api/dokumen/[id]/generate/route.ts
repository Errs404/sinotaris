import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { assertWritable } from "@/lib/subscription";
import { readTemplateFile } from "@/lib/storage";
import { generateDocx, sanitizeFileName } from "@/lib/docx";
import { formatIndonesianDateText, formatAktaDate, formatDisplayDate } from "@/lib/indoDate";
import { collectDatePairs, type TemplateFieldsDef } from "@/lib/templateFields";
import crypto from "crypto";
import { createAuditLog } from "@/lib/audit";
import { requireCurrentActor } from "@/lib/currentActor";
import { identityPlaceholders, resolveDocumentIdentity } from "@/lib/officeIdentity";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user) return new NextResponse("Belum login.", { status: 401 });

    const result = await prisma.$transaction(async (tx) => {
    const actor = await requireCurrentActor(session.user.id, tx);
    await assertWritable(actor.officeId, tx);

    const { id } = await params;
    const template = await tx.docTemplate.findFirst({
      where: { id, officeId: actor.officeId },
    });
    if (!template) return new NextResponse("Template tidak ditemukan.", { status: 404 });

    const body = (await request.json()) as Record<string, string>;
    const pekerjaanId = String(body.__pekerjaanId ?? "").trim() || null;
    const archiveId = String(body.__archiveId ?? "").trim() || null;
    const sections = template.fieldsJson as unknown as TemplateFieldsDef;

    if (pekerjaanId) {
      const ownedJob = await tx.pekerjaan.findFirst({
        where: { id: pekerjaanId, officeId: actor.officeId },
        select: { id: true },
      });
      if (!ownedJob) return new NextResponse("Pekerjaan tidak ditemukan.", { status: 404 });
    }
    let archiveChecksum: string | null = null;
    if (archiveId) {
      if (actor.role !== "NOTARIS") return new NextResponse("Akses arsip ditolak.", { status: 403 });
      const ownedArchive = await tx.documentArchive.findFirst({
        where: { id: archiveId, officeId: actor.officeId, status: "DIKONFIRMASI" },
        select: { id: true, checksum: true },
      });
      if (!ownedArchive) return new NextResponse("Arsip tidak ditemukan.", { status: 404 });
      archiveChecksum = ownedArchive.checksum;
    }

    // Server-side: hitung ulang semua field otomatis (jangan percaya client)
    const data: Record<string, string> = {};
    for (const section of sections) {
      for (const field of section.fields) {
        data[field.name] = String(body[field.name] ?? field.default ?? "");
      }
    }

    const identity = await resolveDocumentIdentity(tx, actor.officeId, pekerjaanId);
    Object.assign(data, identityPlaceholders(identity));
    // A caller cannot supply derived decree text independently of the authoritative decree date.
    data.sk_notaris_tanggal_teks = data.sk_notaris_tanggal ? formatIndonesianDateText(data.sk_notaris_tanggal) : "";
    for (const [dateField, textField] of collectDatePairs(sections)) {
      if (!data[dateField]) continue;
      const text = formatIndonesianDateText(data[dateField]);
      if (text) {
        data[dateField] = formatDisplayDate(data[dateField]);
        data[textField] = text;
      }
    }

    if (data.tanggal_akta) {
      const akta = formatAktaDate(data.tanggal_akta);
      if ("hari_akta" in data && akta.hari) data.hari_akta = akta.hari;
      if ("tanggal_akta_teks" in data && akta.teks) data.tanggal_akta_teks = akta.teks;
    }

    const templateBuffer = readTemplateFile(template.fileName);
    const buffer = generateDocx(templateBuffer, data);
    const templateChecksum = crypto.createHash("sha256").update(templateBuffer).digest("hex");
    const outputChecksum = crypto.createHash("sha256").update(buffer).digest("hex");

    const subjectName =
      data.nama_pemberi || data.nama_debitor || data.nama_klien || data.nama || "";
    const fileName = sanitizeFileName(
      `${template.name}${subjectName ? ` ${subjectName}` : ""}.docx`,
      `${template.name}.docx`,
    );

    // Catat riwayat generate
      const generatedDoc = await tx.generatedDoc.create({
        data: {
          officeId: actor.officeId,
          appointmentId: identity.appointment?.id ?? null,
          identityJson: { ...identity },
          templateId: template.id,
          pekerjaanId,
          archiveId,
           generatedById: actor.id,
          fileName,
          dataJson: data,
          templateChecksum,
          archiveChecksum,
          outputChecksum,
        },
        select: { id: true },
      });
      await createAuditLog(tx, {
        officeId: actor.officeId,
        actorId: actor.id,
        action: "GENERATED_DOC_CREATE",
        targetType: "GENERATED_DOC",
        targetId: generatedDoc.id,
        metadata: {
          templateId: template.id,
          ...(pekerjaanId ? { pekerjaanId } : {}),
          ...(archiveId ? { archiveId } : {}),
          templateChecksum,
          ...(archiveChecksum ? { archiveChecksum } : {}),
          outputChecksum,
          byteCount: buffer.length,
          mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        },
      });
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      },
    });
    }, { timeout: 20000 });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new NextResponse(message, { status: 500 });
  }
}
