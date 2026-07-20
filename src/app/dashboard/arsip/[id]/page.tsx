import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ExternalLink, FileText } from "lucide-react";
import { auth } from "@/auth";
import { Breadcrumb } from "@/components/Breadcrumb";
import { inputClass } from "@/components/form";
import { prisma } from "@/lib/prisma";
import { archiveFieldsByType, archiveTypeLabels, type ArchiveTypeValue, type ExtractedArchiveData } from "@/lib/archiveTypes";
import { confirmArchiveAsClientAction, deleteArchiveAction, linkArchiveAction, updateArchiveReviewAction } from "../actions";
import { ArchiveReviewClient } from "./ArchiveReviewClient";
import { PendingButton } from "@/components/PendingButton";

export default async function ArchiveDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user || session.user.role !== "NOTARIS") redirect("/dashboard");
  const { id } = await params;
  const officeId = session!.user.officeId;
  const [archive, clients, jobs] = await Promise.all([
    prisma.documentArchive.findFirst({ where: { id, officeId }, include: { client: { select: { id: true, name: true } }, pekerjaan: { select: { id: true, judul: true } } } }),
    prisma.client.findMany({ where: { officeId }, orderBy: { name: "asc" }, select: { id: true, name: true, nik: true } }),
    prisma.pekerjaan.findMany({ where: { officeId }, orderBy: { updatedAt: "desc" }, select: { id: true, judul: true }, take: 100 }),
  ]);
  if (!archive) notFound();
  const extracted = archive.extractedJson as unknown as ExtractedArchiveData;
  const type = archive.type as ArchiveTypeValue;
  const completeFields = Object.fromEntries(
    archiveFieldsByType[type].map((key) => [key, extracted.fields?.[key] ?? ""]),
  );
  const update = updateArchiveReviewAction.bind(null, archive.id);
  const confirm = confirmArchiveAsClientAction.bind(null, archive.id);
  const remove = deleteArchiveAction.bind(null, archive.id);
  const link = linkArchiveAction.bind(null, archive.id);

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Pemindai & Arsip", href: "/dashboard/arsip" }, { label: archive.originalName }]} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">{archive.originalName}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">{archiveTypeLabels[archive.type as ArchiveTypeValue]} · {(archive.sizeBytes / 1024).toFixed(1)} KB · Akurasi parser {extracted.confidence ?? 0}%</p>
        </div>
        <Link href={`/api/arsip/${archive.id}/file?preview=1`} target="_blank" className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50 dark:border-slate-600 dark:text-indigo-400 dark:hover:bg-slate-700"><ExternalLink className="h-4 w-4" /> Buka file asli</Link>
      </div>

      {extracted.warnings?.length > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">{extracted.warnings.map((warning) => <p key={warning}>• {warning}</p>)}</div>}

      <form action={link} className="grid gap-4 rounded-xl bg-white p-5 shadow-sm dark:bg-slate-800 sm:grid-cols-2">
        <div><label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Klien terkait</label><select name="clientId" defaultValue={archive.clientId ?? ""} className={inputClass}><option value="">— Tidak ada —</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></div>
        <div><label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Pekerjaan terkait</label><select name="pekerjaanId" defaultValue={archive.pekerjaanId ?? ""} className={inputClass}><option value="">— Tidak ada —</option>{jobs.map((job) => <option key={job.id} value={job.id}>{job.judul}</option>)}</select></div>
        <PendingButton pendingLabel="Menyimpan..." className="inline-flex w-fit items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 sm:col-span-2">Simpan hubungan</PendingButton>
      </form>

      <ArchiveReviewClient archiveId={archive.id} initialFields={completeFields} clients={clients} updateAction={update} confirmAction={confirm} deleteAction={remove} />

      <details className="rounded-xl bg-white p-5 shadow-sm dark:bg-slate-800">
        <summary className="flex cursor-pointer items-center gap-2 font-semibold text-slate-800 dark:text-slate-100"><FileText className="h-4 w-4" /> Teks mentah hasil pembacaan</summary>
        <pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-4 text-xs text-slate-700 dark:bg-slate-900 dark:text-slate-300">{archive.rawText || "Tidak ada teks yang berhasil dibaca."}</pre>
      </details>
    </div>
  );
}
