import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { assertWritable } from "@/lib/subscription";
import { readTemplateFile } from "@/lib/storage";
import { generateDocx, sanitizeFileName } from "@/lib/docx";
import { formatIndonesianDateText, formatAktaDate, formatDisplayDate } from "@/lib/indoDate";
import { collectDatePairs, type TemplateFieldsDef } from "@/lib/templateFields";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user) return new NextResponse("Belum login.", { status: 401 });

    await assertWritable(session.user.officeId);

    const { id } = await params;
    const template = await prisma.docTemplate.findFirst({
      where: { id, officeId: session.user.officeId },
    });
    if (!template) return new NextResponse("Template tidak ditemukan.", { status: 404 });

    const body = (await request.json()) as Record<string, string>;
    const pekerjaanId = String(body.__pekerjaanId ?? "").trim() || null;
    const sections = template.fieldsJson as unknown as TemplateFieldsDef;

    if (pekerjaanId) {
      const ownedJob = await prisma.pekerjaan.findFirst({
        where: { id: pekerjaanId, officeId: session.user.officeId },
        select: { id: true },
      });
      if (!ownedJob) return new NextResponse("Pekerjaan tidak ditemukan.", { status: 404 });
    }

    // Server-side: hitung ulang semua field otomatis (jangan percaya client)
    const data: Record<string, string> = {};
    for (const section of sections) {
      for (const field of section.fields) {
        data[field.name] = String(body[field.name] ?? field.default ?? "");
      }
    }

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

    const subjectName =
      data.nama_pemberi || data.nama_debitor || data.nama_klien || data.nama || "";
    const fileName = sanitizeFileName(
      `${template.name}${subjectName ? ` ${subjectName}` : ""}.docx`,
      `${template.name}.docx`,
    );

    // Catat riwayat generate
    await prisma.generatedDoc.create({
      data: {
        templateId: template.id,
        pekerjaanId,
        fileName,
        dataJson: data,
      },
    });

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new NextResponse(message, { status: 500 });
  }
}
