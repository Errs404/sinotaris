"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import fs from "fs";
import path from "path";
import { requireSession } from "@/auth";
import { prisma } from "@/lib/prisma";
import { assertWritable } from "@/lib/subscription";
import { saveTemplateFile, deleteTemplateFile, readTemplateFile } from "@/lib/storage";
import { extractPlaceholders, buildFieldsDefFromPlaceholders } from "@/lib/templateParser";
import type { TemplateFieldsDef } from "@/lib/templateFields";
import skmhtFields from "@/data/skmht-fields.json";

export async function uploadTemplateAction(formData: FormData) {
  const session = await requireSession();
  await assertWritable(session.user.officeId);

  const name = String(formData.get("name") ?? "").trim();
  const file = formData.get("file") as File | null;

  if (!name) throw new Error("Nama template wajib diisi.");
  if (!file || !file.name.toLowerCase().endsWith(".docx")) {
    throw new Error("Pilih file template Word (.docx).");
  }
  if (file.size > 10 * 1024 * 1024) throw new Error("Ukuran file maksimal 10 MB.");

  const buffer = Buffer.from(await file.arrayBuffer());
  const placeholders = extractPlaceholders(buffer);
  if (placeholders.length === 0) {
    throw new Error(
      "Tidak ada placeholder {nama_field} ditemukan di dokumen. Tambahkan placeholder seperti {nama_klien} di file Word.",
    );
  }

  const fileName = saveTemplateFile(buffer, file.name);

  await prisma.docTemplate.create({
    data: {
      officeId: session.user.officeId,
      name,
      fileName,
      fieldsJson: buildFieldsDefFromPlaceholders(placeholders) as object[],
    },
  });

  revalidatePath("/dashboard/dokumen");
  redirect("/dashboard/dokumen");
}

/** Impor template SKMHT bawaan (dari aplikasi skmht-generator lama). */
export async function importSkmhtAction() {
  const session = await requireSession();
  await assertWritable(session.user.officeId);

  const sourcePath = path.join(process.cwd(), "storage", "templates", "skmht-bawaan.docx");
  if (!fs.existsSync(sourcePath)) {
    throw new Error(
      "File skmht-bawaan.docx tidak ditemukan di storage/templates. Salin template SKMHT Anda ke sana terlebih dahulu.",
    );
  }

  await prisma.docTemplate.create({
    data: {
      officeId: session.user.officeId,
      name: "SKMHT",
      fileName: "skmht-bawaan.docx",
      fieldsJson: skmhtFields as TemplateFieldsDef as object[],
    },
  });

  revalidatePath("/dashboard/dokumen");
}

export async function deleteTemplateAction(id: string) {
  const session = await requireSession();
  await assertWritable(session.user.officeId);

  const template = await prisma.docTemplate.findFirst({
    where: { id, officeId: session.user.officeId },
    include: { _count: { select: { documents: true } } },
  });
  if (!template) return;

  await prisma.generatedDoc.deleteMany({ where: { templateId: template.id } });
  await prisma.docTemplate.delete({ where: { id: template.id } });

  // File bawaan bisa dipakai template lain — hanya hapus file hasil upload
  if (template.fileName !== "skmht-bawaan.docx") {
    deleteTemplateFile(template.fileName);
  }

  revalidatePath("/dashboard/dokumen");
}

/** Pastikan template ada & milik kantor ini; dipakai route generate. */
export async function getTemplateForOffice(id: string, officeId: string) {
  const template = await prisma.docTemplate.findFirst({
    where: { id, officeId },
  });
  if (!template) throw new Error("Template tidak ditemukan.");
  return { template, buffer: readTemplateFile(template.fileName) };
}
