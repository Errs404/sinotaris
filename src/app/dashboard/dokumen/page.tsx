import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { inputClass } from "@/components/form";
import { uploadTemplateAction, importSkmhtAction, deleteTemplateAction } from "./actions";
import type { TemplateFieldsDef } from "@/lib/templateFields";

export default async function DokumenPage() {
  const session = await auth();

  const templates = await prisma.docTemplate.findMany({
    where: { officeId: session!.user.officeId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { documents: true } } },
  });

  const hasSkmht = templates.some((t) => t.fileName === "skmht-bawaan.docx");

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Generator Dokumen</h2>

      <div className="grid gap-4 lg:grid-cols-2">
        <form
          action={uploadTemplateAction}
          className="rounded-xl bg-white p-5 shadow-sm dark:bg-slate-800"
        >
          <h3 className="mb-1 font-semibold text-slate-800 dark:text-slate-100">Upload Template Word</h3>
          <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
            File .docx dengan placeholder <code className="rounded bg-slate-100 px-1 dark:bg-slate-700">{"{nama_field}"}</code>.
            Form input dibuat otomatis dari placeholder yang ditemukan.
          </p>
          <div className="space-y-3">
            <input name="name" required placeholder="Nama template, contoh: Akta Sewa" className={inputClass} />
            <input name="file" type="file" accept=".docx" required className={inputClass} />
            <button className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700">
              Upload Template
            </button>
          </div>
        </form>

        <div className="rounded-xl bg-white p-5 shadow-sm dark:bg-slate-800">
          <h3 className="mb-1 font-semibold text-slate-800 dark:text-slate-100">Template SKMHT Bawaan</h3>
          <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
            Template SKMHT lengkap dari aplikasi SKMHT Generator: 8 section, 100 field,
            tanggal otomatis jadi teks terbilang, dan penyesuaian garis putus-putus.
          </p>
          {hasSkmht ? (
            <p className="text-sm font-medium text-indigo-700">✓ Sudah diimpor</p>
          ) : (
            <form action={importSkmhtAction}>
              <button className="rounded-lg bg-slate-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700">
                Impor Template SKMHT
              </button>
            </form>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-indigo-100 bg-white shadow-lg shadow-indigo-100/50 dark:border-slate-700 dark:bg-slate-800 dark:shadow-none">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-indigo-50 text-left text-xs font-semibold uppercase tracking-wide text-indigo-700 dark:bg-slate-700 dark:text-indigo-300">
              <th className="px-4 py-3 font-medium">Template</th>
              <th className="px-4 py-3 font-medium">Jumlah Field</th>
              <th className="px-4 py-3 font-medium">Dokumen Dibuat</th>
              <th className="px-4 py-3 font-medium">Dibuat</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {templates.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  Belum ada template. Upload file Word atau impor template SKMHT bawaan.
                </td>
              </tr>
            )}
            {templates.map((template) => {
              const sections = template.fieldsJson as unknown as TemplateFieldsDef;
              const fieldCount = sections.reduce((n, s) => n + s.fields.length, 0);
              const remove = deleteTemplateAction.bind(null, template.id);
              return (
                <tr key={template.id} className="border-b border-indigo-50 transition-colors hover:bg-indigo-50/60 dark:border-slate-700 dark:hover:bg-slate-700/50">
                  <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">{template.name}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{fieldCount}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{template._count.documents}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                    {template.createdAt.toLocaleDateString("id-ID")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-4">
                      <Link
                        href={`/dashboard/dokumen/${template.id}`}
                        className="font-medium text-indigo-700 hover:underline dark:text-indigo-400"
                      >
                        Buat Dokumen
                      </Link>
                      <form action={remove}>
                        <button className="text-red-500 hover:underline">Hapus</button>
                      </form>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
