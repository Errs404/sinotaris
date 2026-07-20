import Link from "next/link";
import { redirect } from "next/navigation";
import { FileArchive, ScanText } from "lucide-react";
import { auth } from "@/auth";
import { Breadcrumb } from "@/components/Breadcrumb";
import { prisma } from "@/lib/prisma";
import { archiveTypeLabels, type ArchiveTypeValue } from "@/lib/archiveTypes";
import { uploadArchiveAction } from "./actions";
import { UploadArchiveForm } from "./UploadArchiveForm";

const statusStyle = {
  PERLU_REVIEW: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
  DIKONFIRMASI: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300",
  GAGAL: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
};

export default async function ArsipPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "NOTARIS") redirect("/dashboard");
  const officeId = session!.user.officeId;
  const [archives, clients, jobs] = await Promise.all([
    prisma.documentArchive.findMany({
      where: { officeId },
      orderBy: { createdAt: "desc" },
      include: { client: { select: { name: true } }, pekerjaan: { select: { judul: true } } },
      take: 100,
    }),
    prisma.client.findMany({ where: { officeId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.pekerjaan.findMany({ where: { officeId }, orderBy: { updatedAt: "desc" }, select: { id: true, judul: true }, take: 100 }),
  ]);

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Pemindai & Arsip" }]} />
      <div>
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-indigo-100 p-2.5 dark:bg-indigo-900/50">
            <ScanText className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Pemindai & Arsip Dokumen</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Ekstraksi 100% lokal. Hasil wajib diperiksa sebelum disimpan sebagai data klien.</p>
          </div>
        </div>
      </div>

      <UploadArchiveForm action={uploadArchiveAction} clients={clients} jobs={jobs} />

      <div className="overflow-x-auto rounded-xl border border-indigo-100 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <table className="w-full text-sm">
          <thead><tr className="bg-indigo-50 text-left text-xs uppercase tracking-wide text-indigo-700 dark:bg-slate-700 dark:text-indigo-300">
            <th className="px-4 py-3">File</th><th className="px-4 py-3">Jenis</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Terhubung</th><th className="px-4 py-3">Tanggal</th><th className="px-4 py-3" />
          </tr></thead>
          <tbody>
            {archives.length === 0 && <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400"><FileArchive className="mx-auto mb-2 h-10 w-10" />Belum ada arsip dokumen.</td></tr>}
            {archives.map((archive) => (
              <tr key={archive.id} className="border-t border-slate-100 dark:border-slate-700">
                <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">{archive.originalName}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{archiveTypeLabels[archive.type as ArchiveTypeValue]}</td>
                <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyle[archive.status]}`}>{archive.status.replaceAll("_", " ")}</span></td>
                <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{archive.client?.name || archive.pekerjaan?.judul || "-"}</td>
                <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{archive.createdAt.toLocaleDateString("id-ID")}</td>
                <td className="px-4 py-3 text-right"><Link href={`/dashboard/arsip/${archive.id}`} className="font-medium text-indigo-700 hover:underline dark:text-indigo-400">Review</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
