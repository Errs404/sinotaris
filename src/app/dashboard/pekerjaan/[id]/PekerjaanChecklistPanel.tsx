"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ArchiveDocumentType, ArchiveStatus, ChecklistItemStatus, UserRole } from "@/generated/prisma/enums";
import { inputClass } from "@/components/form";
import { useToast } from "@/components/Toast";
import {
  checklistExpectedTypeLabel,
  checklistProgressPercent,
  checklistStatusClass,
  checklistStatusLabel,
  sortChecklistCandidates,
  type ChecklistProgress,
} from "@/lib/checklistUi";
import {
  addManualChecklistItemAction,
  applyChecklistTemplateAction,
  attachChecklistArchiveAction,
  detachChecklistArchiveAction,
  setChecklistItemStatusAction,
} from "../checklist-actions";

const EXPECTED_TYPES: Array<{ value: ArchiveDocumentType | ""; label: string }> = [
  { value: "", label: "Tanpa tipe khusus" }, { value: "KTP", label: "KTP" },
  { value: "KARTU_KELUARGA", label: "KK" }, { value: "NPWP", label: "NPWP" },
  { value: "SERTIPIKAT", label: "Sertipikat" }, { value: "AKTA_PERJANJIAN", label: "Akta" },
  { value: "UMUM", label: "Umum" },
];

export type ChecklistArchiveDto = {
  id: string;
  type: ArchiveDocumentType;
  status: ArchiveStatus;
  createdAt: string;
};

export type PekerjaanChecklistItemDto = {
  id: string;
  label: string;
  description: string | null;
  required: boolean;
  expectedType: ArchiveDocumentType | null;
  status: ChecklistItemStatus;
  rejectionReason: string | null;
  verifiedAt: string | null;
  updatedAt: string;
  verifiedBy: { name: string; role: UserRole } | null;
  attachments: Array<{ id: string; archive: ChecklistArchiveDto }>;
};

function errorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : "Tindakan checklist gagal. Silakan coba lagi.";
}

function dateLabel(value: string) {
  return new Date(value).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

export function PekerjaanChecklistPanel({
  pekerjaanId,
  expectedUpdatedAt,
  role,
  items,
  candidates,
  progress,
  canApplyTemplate,
}: {
  pekerjaanId: string;
  expectedUpdatedAt: string;
  role: UserRole;
  items: PekerjaanChecklistItemDto[];
  candidates: ChecklistArchiveDto[];
  progress: ChecklistProgress;
  canApplyTemplate: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [showManual, setShowManual] = useState(false);
  const percent = checklistProgressPercent(progress);

  function run(action: () => Promise<unknown>, success: string) {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      try {
        await action();
        toast({ title: success });
        router.refresh();
      } catch (cause) {
        const message = errorMessage(cause);
        setError(message);
        toast({ title: message, variant: "error" });
      }
    });
  }

  return (
    <section className="rounded-xl border border-indigo-100 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800" aria-labelledby="checklist-title" aria-busy={pending}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="checklist-title" className="font-semibold text-slate-800 dark:text-slate-100">Checklist Dokumen</h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Lampiran harus dipilih secara eksplisit dan tidak otomatis terverifikasi.</p>
        </div>
        <div className="text-right text-sm">
          {progress.requiredTotal === 0 ? (
            <p className="font-semibold text-slate-500 dark:text-slate-400">Belum ada item wajib</p>
          ) : (
            <p className="font-semibold text-slate-700 dark:text-slate-200">{progress.requiredVerified}/{progress.requiredTotal} wajib terverifikasi</p>
          )}
          {progress.optionalTotal > 0 && <p className="mt-0.5 text-xs text-slate-500">Opsional selesai {progress.optionalComplete}/{progress.optionalTotal}</p>}
        </div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700" role="progressbar" aria-label="Progres dokumen wajib" aria-valuemin={0} aria-valuemax={progress.requiredTotal || 1} aria-valuenow={progress.requiredVerified}>
        <div className={`h-full rounded-full ${progress.requiredTotal === 0 ? "bg-slate-300 dark:bg-slate-600" : "bg-teal-500"}`} style={{ width: `${percent}%` }} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {canApplyTemplate && (
          <button type="button" disabled={pending} onClick={() => run(() => applyChecklistTemplateAction(pekerjaanId, expectedUpdatedAt), "Template checklist diterapkan")} className="rounded-lg border border-indigo-200 px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60 dark:border-indigo-800 dark:text-indigo-300">
            Terapkan item template yang belum ada
          </button>
        )}
        {role === "NOTARIS" && (
          <button type="button" disabled={pending} onClick={() => setShowManual((value) => !value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700">
            {showManual ? "Tutup form manual" : "Tambah item manual"}
          </button>
        )}
      </div>

      {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">{error}</p>}

      {showManual && role === "NOTARIS" && (
        <form className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/40" action={(formData) => { formData.set("required", formData.get("requiredCheckbox") === "true" ? "true" : "false"); run(() => addManualChecklistItemAction(pekerjaanId, formData), "Item manual ditambahkan"); }}>
          <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Item manual</h4>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div><label htmlFor="manual-label" className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Label *</label><input id="manual-label" name="label" required maxLength={300} className={inputClass} /></div>
            <div><label htmlFor="manual-type" className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Tipe yang diharapkan</label><select id="manual-type" name="expectedType" className={inputClass}>{EXPECTED_TYPES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
            <div className="md:col-span-2"><label htmlFor="manual-description" className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Deskripsi</label><textarea id="manual-description" name="description" rows={2} maxLength={5000} className={inputClass} /></div>
          </div>
          <label className="mt-3 inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300"><input type="checkbox" name="requiredCheckbox" value="true" defaultChecked className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" /> Wajib</label>
          <input type="hidden" name="sortOrder" value={items.length} />
          <div><button disabled={pending} className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">Simpan item</button></div>
        </form>
      )}

      {items.length === 0 ? (
        <p className="mt-5 rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-600 dark:text-slate-400">Belum ada checklist pada pekerjaan ini.{canApplyTemplate ? " Terapkan template untuk menambahkan item yang sesuai." : " Notaris dapat menambahkan item manual."}</p>
      ) : (
        <div className="mt-5 space-y-3">
          {items.map((item) => {
            const attachedIds = new Set(item.attachments.map((attachment) => attachment.archive.id));
            const available = sortChecklistCandidates(candidates.filter((candidate) => !attachedIds.has(candidate.id)), item.expectedType);
            return (
              <article key={item.id} className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div><h4 className="font-semibold text-slate-800 dark:text-slate-100">{item.label}</h4><p className="mt-1 text-xs font-medium text-slate-500">{item.required ? "Wajib" : "Opsional"}{item.expectedType ? ` · ${checklistExpectedTypeLabel[item.expectedType]}` : " · Tipe bebas"}</p></div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${checklistStatusClass[item.status]}`}>{checklistStatusLabel[item.status]}</span>
                </div>
                {item.description && <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{item.description}</p>}
                {item.rejectionReason && <p className="mt-2 rounded-lg bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300"><strong>Alasan penolakan:</strong> {item.rejectionReason}</p>}
                {item.verifiedAt && item.verifiedBy && <p className="mt-2 text-xs text-slate-500">Oleh {item.verifiedBy.name} ({item.verifiedBy.role === "NOTARIS" ? "Notaris" : "Staf"}) · {new Date(item.verifiedAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}</p>}

                <div className="mt-3 space-y-2">
                  {item.attachments.map((attachment) => (
                    <div key={attachment.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-900/50">
                      <span className="text-slate-700 dark:text-slate-300">{checklistExpectedTypeLabel[attachment.archive.type]} · {dateLabel(attachment.archive.createdAt)} · {attachment.archive.status.replaceAll("_", " ")}</span>
                      <span className="flex items-center gap-3">{role === "NOTARIS" ? <Link href={`/api/arsip/${attachment.archive.id}/file`} target="_blank" className="font-semibold text-indigo-700 hover:underline dark:text-indigo-400">Buka</Link> : <span className="text-xs text-slate-400">Berkas hanya dapat dibuka Notaris</span>}<button type="button" disabled={pending} onClick={() => run(() => detachChecklistArchiveAction(item.id, attachment.archive.id, item.updatedAt), "Lampiran dilepas")} className="font-semibold text-red-600 hover:underline disabled:opacity-60">Lepas</button></span>
                    </div>
                  ))}
                </div>

                <form className="mt-3 flex flex-col gap-2 sm:flex-row" action={(formData) => { const archiveId = String(formData.get("archiveId") ?? ""); if (archiveId) run(() => attachChecklistArchiveAction(item.id, archiveId, item.updatedAt), "Arsip dilampirkan"); }}>
                  <label className="sr-only" htmlFor={`archive-${item.id}`}>Pilih arsip untuk {item.label}</label>
                  <select id={`archive-${item.id}`} name="archiveId" required defaultValue="" className={`${inputClass} sm:max-w-md`}>
                    <option value="" disabled>{available.length ? "Pilih arsip pekerjaan" : "Tidak ada arsip lain yang tersedia"}</option>
                    {available.map((candidate) => <option key={candidate.id} value={candidate.id}>{checklistExpectedTypeLabel[candidate.type]} · {dateLabel(candidate.createdAt)}{item.expectedType === candidate.type ? " · Tipe cocok" : ""}</option>)}
                  </select>
                  <button disabled={pending || available.length === 0} className="rounded-lg border border-indigo-200 px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-60 dark:border-indigo-800 dark:text-indigo-300">Lampirkan</button>
                  {role === "NOTARIS" && <Link href={`/dashboard/arsip?pekerjaanId=${encodeURIComponent(pekerjaanId)}${item.expectedType ? `&type=${item.expectedType}` : ""}`} className="rounded-lg px-3 py-2 text-center text-sm font-semibold text-indigo-700 hover:bg-indigo-50 dark:text-indigo-300">Unggah arsip baru</Link>}
                </form>

                {role === "NOTARIS" && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-700">
                    {item.attachments.length > 0 && <button type="button" disabled={pending} onClick={() => run(() => setChecklistItemStatusAction(item.id, "TERVERIFIKASI", item.updatedAt), "Item diverifikasi")} className="rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60">Verifikasi</button>}
                    {!item.required && <button type="button" disabled={pending} onClick={() => run(() => setChecklistItemStatusAction(item.id, "DILEWATI", item.updatedAt), "Item dilewati")} className="rounded-lg border border-amber-300 px-3 py-1.5 text-sm font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-60">Lewati</button>}
                    <button type="button" disabled={pending} onClick={() => { setRejectingId(rejectingId === item.id ? null : item.id); setReason(""); }} className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60">Tolak</button>
                  </div>
                )}
                {role === "NOTARIS" && rejectingId === item.id && <form className="mt-3 flex flex-col gap-2 sm:flex-row" action={() => { if (reason.trim().length >= 3) run(async () => { await setChecklistItemStatusAction(item.id, "DITOLAK", item.updatedAt, reason); setRejectingId(null); }, "Item ditolak"); }}><label htmlFor={`reason-${item.id}`} className="sr-only">Alasan penolakan</label><input id={`reason-${item.id}`} value={reason} onChange={(event) => setReason(event.target.value)} required minLength={3} maxLength={500} placeholder="Alasan penolakan (minimal 3 karakter)" className={inputClass} /><button disabled={pending || reason.trim().length < 3} className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">Simpan penolakan</button></form>}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
