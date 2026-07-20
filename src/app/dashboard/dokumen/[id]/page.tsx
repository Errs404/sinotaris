import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { TemplateFieldsDef } from "@/lib/templateFields";
import { GeneratorForm } from "./GeneratorForm";
import { buildDocumentPrefill } from "@/lib/documentPrefill";
import { buildArchivePrefill } from "@/lib/archivePrefill";

export default async function TemplateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  const { id } = await params;

  const template = await prisma.docTemplate.findFirst({
    where: { id, officeId: session!.user.officeId },
  });

  if (!template) notFound();

  const sections = template.fieldsJson as unknown as TemplateFieldsDef;
  const jobs = await prisma.pekerjaan.findMany({
    where: { officeId: session!.user.officeId },
    orderBy: { updatedAt: "desc" },
    take: 100,
    include: {
      office: true,
      clients: {
        where: { client: { officeId: session!.user.officeId } },
        include: { client: true },
        orderBy: { peran: "asc" },
      },
    },
  });

  const jobOptions = jobs.map((job) => ({
    id: job.id,
    label: `${job.jenis} — ${job.judul}${job.nomorAkta ? ` (${job.nomorAkta})` : ""}`,
    values: buildDocumentPrefill(job),
  }));
  const archives = session!.user.role === "NOTARIS"
    ? await prisma.documentArchive.findMany({
        where: { officeId: session!.user.officeId, status: "DIKONFIRMASI" },
        orderBy: { updatedAt: "desc" },
        take: 100,
        select: { id: true, originalName: true, type: true, extractedJson: true },
      })
    : [];
  const archiveOptions = archives.map((archive) => {
    const extracted = archive.extractedJson as { fields?: Record<string, string> };
    return {
      id: archive.id,
      label: `${archive.originalName} — ${archive.type.replaceAll("_", " ")}`,
      values: buildArchivePrefill(extracted.fields ?? {}),
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/dokumen" className="text-sm text-indigo-700 hover:underline">
          ← Kembali ke daftar template
        </Link>
        <h2 className="mt-1 text-2xl font-bold text-slate-800 dark:text-slate-100">Buat Dokumen: {template.name}</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Isi form di bawah lalu klik Generate DOCX. Tanggal otomatis diubah jadi teks
          terbilang Bahasa Indonesia.
        </p>
      </div>
      <GeneratorForm templateId={template.id} sections={sections} jobs={jobOptions} archives={archiveOptions} />
    </div>
  );
}
