import { auth } from "@/auth";
import { requireCurrentActor } from "@/lib/currentActor";
import { OfficeIdentitySummary } from "@/components/OfficeIdentitySummary";
import { getSubscriptionState } from "@/lib/subscription";
import { SubmitButton, inputClass } from "@/components/form";
import { importOfflineLicenseAction } from "./license-actions";
import Link from "next/link";
import { ClipboardCheck, ChevronRight } from "lucide-react";

export default async function PengaturanPage() {
  const session = await auth();
  const actor = await requireCurrentActor(session!.user.id);
  const isNotaris = actor.role === "NOTARIS";
  const subscription = await getSubscriptionState(actor.officeId);

  return (
    <div className="max-w-3xl space-y-6">
      <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Pengaturan</h2>
      <OfficeIdentitySummary officeId={actor.officeId} />

      <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-slate-800">
        <h3 className="mb-4 font-semibold text-slate-800 dark:text-slate-100">Status Lisensi</h3>
        <div className="flex flex-wrap items-center gap-4">
          <span
            className={`rounded-full px-3 py-1 text-sm font-semibold ${
              subscription.active ? "bg-indigo-100 text-indigo-700" : "bg-red-100 text-red-700"
            }`}
          >
             {subscription.phase === "GRACE" ? "Masa Tenggang" : subscription.active ? "Aktif" : "Baca Saja"}
          </span>
          <span className="text-sm text-slate-600 dark:text-slate-300">
            Paket: <strong>{subscription.plan}</strong>
          </span>
          {subscription.periodEnd && (
            <span className="text-sm text-slate-600 dark:text-slate-300">
              Berlaku sampai: <strong>{subscription.periodEnd.toLocaleDateString("id-ID")}</strong>
            </span>
          )}
          {subscription.licenseType === "PERPETUAL" && (
            <span className="text-sm text-slate-600 dark:text-slate-300"><strong>Bayar putus</strong></span>
          )}
          <span className="text-sm text-slate-600 dark:text-slate-300">
            Sumber: <strong>{subscription.source === "OFFLINE_LICENSE" ? "Lisensi Offline" : subscription.source === "LEGACY_SUBSCRIPTION" ? "Langganan Lama" : "Belum Ada"}</strong>
          </span>
        </div>
        {subscription.licenseId && <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Nomor lisensi: {subscription.licenseId}</p>}
        {subscription.phase === "GRACE" && subscription.graceEnd && (
          <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">Masa tenggang berakhir {subscription.graceEnd.toLocaleDateString("id-ID")}.</p>
        )}
      </div>

      {isNotaris ? (
        <>
        <form action={importOfflineLicenseAction} className="rounded-xl bg-white p-6 shadow-sm dark:bg-slate-800">
          <h3 className="font-semibold text-slate-800 dark:text-slate-100">Aktivasi Lisensi Offline</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Unduh permintaan aktivasi, kirimkan kepada penyedia Sinotaris, lalu impor file lisensi yang diterbitkan.</p>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <a href="/api/license/request" className="rounded-lg border border-indigo-200 px-4 py-2.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 dark:border-slate-600 dark:text-indigo-300 dark:hover:bg-slate-700">Unduh Permintaan Aktivasi</a>
            <div className="min-w-64 flex-1">
              <label htmlFor="license" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">File lisensi (.slic)</label>
              <input id="license" name="license" type="file" accept=".slic,application/json" required className={inputClass} />
            </div>
            <SubmitButton>Impor Lisensi</SubmitButton>
          </div>
        </form>
        <Link href="/dashboard/pengaturan/checklist" className="group flex items-center justify-between gap-4 rounded-xl border border-indigo-100 bg-white p-5 shadow-sm transition-colors hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700">
          <span className="flex items-center gap-3"><span className="rounded-lg bg-indigo-100 p-2 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300"><ClipboardCheck className="h-5 w-5" /></span><span><strong className="block text-slate-800 dark:text-slate-100">Template Checklist Dokumen</strong><span className="mt-0.5 block text-sm text-slate-500 dark:text-slate-400">Atur daftar dokumen berdasarkan kelompok dan jenis pekerjaan.</span></span></span><ChevronRight className="h-5 w-5 text-slate-400 transition-transform group-hover:translate-x-0.5" />
        </Link>
        <Link href="/dashboard/pengaturan/identitas" className="block rounded-xl border border-indigo-200 bg-white p-6 font-semibold text-indigo-700 focus:ring-2 focus:ring-indigo-500 dark:bg-slate-800 dark:text-indigo-300">Kelola Identitas Kantor & Pengangkatan →<span className="mt-1 block text-sm font-normal">Buat draft, terbitkan versi, dan tinjau riwayat identitas.</span></Link></>
      ) : (
        <div className="rounded-xl bg-white p-6 text-sm text-slate-500 shadow-sm dark:bg-slate-800 dark:text-slate-400">
          Pengaturan kantor hanya bisa diubah oleh Notaris (Admin).
        </div>
      )}
    </div>
  );
}
