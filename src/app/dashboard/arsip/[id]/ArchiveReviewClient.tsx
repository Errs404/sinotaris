"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Save, Trash2, UserCheck } from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { archiveFieldLabels } from "@/lib/archiveTypes";
import { PendingButton } from "@/components/PendingButton";

export function ArchiveReviewClient({
  archiveId,
  initialFields,
  clients,
  updateAction,
  confirmAction,
  deleteAction,
}: {
  archiveId: string;
  initialFields: Record<string, string>;
  clients: Array<{ id: string; name: string; nik: string | null }>;
  updateAction: (formData: FormData) => Promise<void>;
  confirmAction: (formData: FormData) => Promise<void>;
  deleteAction: () => Promise<void>;
}) {
  const [fields, setFields] = useState(initialFields);
  const [showDelete, setShowDelete] = useState(false);
  const [existingClientId, setExistingClientId] = useState("");
  const { toast } = useToast();
  const router = useRouter();
  const fieldsJson = useMemo(() => JSON.stringify(fields), [fields]);
  const orderedKeys = useMemo(() => {
    const preferred = ["name", "nik", "npwp", "tempatLahir", "tanggalLahir", "gender", "pekerjaan", "statusKawin", "wargaNegara", "address"];
    return [...preferred.filter((key) => key in fields), ...Object.keys(fields).filter((key) => !preferred.includes(key))];
  }, [fields]);

  async function save(formData: FormData) {
    await updateAction(formData);
    toast({ title: "Hasil ekstraksi disimpan" });
  }

  async function confirm(formData: FormData) {
    await confirmAction(formData);
    toast({ title: existingClientId ? "Data klien diperbarui" : "Klien baru berhasil dibuat" });
    router.refresh();
  }

  async function remove() {
    await deleteAction();
    toast({ title: "Arsip dihapus", variant: "info" });
    router.push("/dashboard/arsip");
  }

  return (
    <div className="space-y-6">
      <form action={save} className="rounded-xl bg-white p-6 shadow-sm dark:bg-slate-800">
        <input type="hidden" name="fieldsJson" value={fieldsJson} />
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="font-semibold text-slate-800 dark:text-slate-100">Review hasil ekstraksi</h3>
          <PendingButton pendingLabel="Menyimpan..." className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"><Save className="h-4 w-4" /> Simpan koreksi</PendingButton>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {orderedKeys.map((key) => (
            <div key={key} className={key === "address" || key === "paraPihak" ? "sm:col-span-2" : ""}>
              <label htmlFor={`archive-field-${key}`} className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">{archiveFieldLabels[key] ?? key}</label>
              {key === "address" || key === "paraPihak" ? (
                <textarea id={`archive-field-${key}`} value={fields[key] ?? ""} onChange={(event) => setFields((current) => ({ ...current, [key]: event.target.value }))} rows={3} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200" />
              ) : (
                <input id={`archive-field-${key}`} type={key.toLowerCase().includes("tanggal") ? "date" : "text"} value={fields[key] ?? ""} onChange={(event) => setFields((current) => ({ ...current, [key]: event.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200" />
              )}
            </div>
          ))}
        </div>
      </form>

      <form action={confirm} className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 dark:border-emerald-900 dark:bg-emerald-950/30">
        <input type="hidden" name="fieldsJson" value={fieldsJson} />
        <h3 className="font-semibold text-emerald-900 dark:text-emerald-200">Konfirmasi menjadi data Klien</h3>
        <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-300">Simpan koreksi terlebih dahulu. Pilih klien lama untuk memperbarui, atau biarkan kosong untuk membuat klien baru.</p>
        <select name="existingClientId" value={existingClientId} onChange={(event) => setExistingClientId(event.target.value)} className="mt-4 w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200">
          <option value="">— Buat klien baru —</option>
          {clients.map((client) => <option key={client.id} value={client.id}>{client.name}{client.nik ? ` — ${client.nik}` : ""}</option>)}
        </select>
        <PendingButton pendingLabel="Menyimpan klien..." className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"><UserCheck className="h-4 w-4" /> {existingClientId ? "Perbarui Klien" : "Buat Klien"}</PendingButton>
      </form>

      <button onClick={() => setShowDelete(true)} className="inline-flex items-center gap-2 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"><Trash2 className="h-4 w-4" /> Hapus arsip</button>
      <ConfirmDialog open={showDelete} onClose={() => setShowDelete(false)} onConfirm={remove} title="Hapus arsip dan file asli?" description="File asli, teks OCR, dan hasil ekstraksi akan dihapus permanen." />
      <input type="hidden" value={archiveId} readOnly />
    </div>
  );
}
