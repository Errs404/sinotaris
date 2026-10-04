"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inputClass } from "@/components/form";
import { PendingButton } from "@/components/PendingButton";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { createOfficeIdentityDraftAction, mutateOfficeIdentityAction } from "../identity-actions";

type Row = Record<string, unknown>;
type Entity = "profile" | "appointment";
const button = "rounded-lg border border-indigo-200 px-3 py-2 text-sm font-medium text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-indigo-300";
const value = (row: Row | null, key: string) => String(row?.[key] ?? "");
const period = (row: Row) => `${value(row, "effectiveFrom").slice(0, 10) || "Tanpa awal"} — ${value(row, "effectiveUntil").slice(0, 10) || "Tanpa akhir"}`;
const profileFields = [["officeName", "Nama kantor", "text", "250"], ["address", "Alamat", "text", "2000"], ["phone", "Telepon", "tel", "50"], ["email", "Email", "email", "254"]];
const appointmentFields = [["notaryName", "Nama pejabat", "text", "250"], ["title", "Gelar", "text", "150"], ["workArea", "Wilayah kerja", "text", "500"], ["decreeNumber", "Nomor SK", "text", "250"], ["decreeDate", "Tanggal SK", "date", ""], ["decreeDateText", "Tanggal SK teks (legacy)", "text", "250"]];

export function IdentityManager({ profiles, appointments }: { profiles: Row[]; appointments: Row[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [editor, setEditor] = useState<{ entity: Entity; row: Row | null } | null>(null);
  const [preview, setPreview] = useState<Row | null>(null);
  const [reason, setReason] = useState("");
  const [retireReady, setRetireReady] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<{ entity: Entity; row: Row; operation: "publish" | "retire" | "delete" } | null>(null);
  const fields = editor?.entity === "profile" ? profileFields : appointmentFields;
  async function save(form: FormData) {
    if (!editor) return;
    setError("");
    try {
      if (editor.row) { form.set("id", value(editor.row, "id")); form.set("updatedAt", value(editor.row, "updatedAt")); await mutateOfficeIdentityAction(editor.entity, "update", form); }
      else await createOfficeIdentityDraftAction(editor.entity, form);
      setEditor(null); setPreview(null); router.refresh(); toast({ title: "Draft tersimpan" });
    } catch (cause) { const message = cause instanceof Error ? cause.message : "Gagal menyimpan draft"; setError(message); toast({ title: message, variant: "error" }); }
  }
  return <div className="space-y-6">
    <div className="flex flex-wrap gap-3">{(["profile", "appointment"] as const).map(entity => <button key={entity} className={button} onClick={() => { setEditor({ entity, row: null }); setError(""); }}>Draft {entity === "profile" ? "Profil Kantor" : "Pengangkatan"} Baru</button>)}</div>
    {editor && <form key={`${editor.entity}-${value(editor.row, "id")}`} action={save} className="space-y-4 rounded-xl bg-white p-6 shadow-sm dark:bg-slate-800">
      <h3 className="font-semibold">{editor.row ? `Edit draft v${value(editor.row, "version")}` : "Draft baru · versi ditentukan server"}</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        {editor.entity === "appointment" && <label className="text-sm">Jenis pengangkatan<select name="kind" className={inputClass} defaultValue={value(editor.row, "kind") || "NOTARIS"} onChange={() => {}} disabled={!!editor.row}>{["NOTARIS", "PPAT", "NOTARIS_PENGGANTI"].map(kind => <option key={kind}>{kind}</option>)}</select>{editor.row && <input type="hidden" name="kind" value={value(editor.row, "kind")} />}</label>}
        {[...fields, ["effectiveFrom", "Berlaku mulai (opsional)", "date", ""], ["effectiveUntil", "Berlaku sampai (opsional, inklusif)", "date", ""]].map(([name, label, type, max]) => <label key={name} className="text-sm">{label}<input className={inputClass} name={name} type={type} maxLength={max ? Number(max) : undefined} required={name === "officeName" || name === "notaryName"} defaultValue={type === "date" ? value(editor.row, name).slice(0, 10) : value(editor.row, name)} /></label>)}
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-3"><PendingButton className={button} pendingLabel="Menyimpan…">Simpan draft</PendingButton><button type="button" className={button} onClick={() => setEditor(null)}>Batal</button></div>
    </form>}
    {preview && <section className="rounded-xl border border-slate-300 bg-white p-6 text-center dark:bg-slate-800" aria-label="Pratinjau versi terpilih"><p className="text-xs text-slate-500">PRATINJAU VERSI TERSIMPAN · v{value(preview, "version")} · {value(preview, "status")}</p><h3 className="mt-3 text-xl font-bold">{value(preview, "officeName") || value(preview, "notaryName")}</h3><p>{value(preview, "title")}</p><p>{value(preview, "address") || value(preview, "workArea")}</p><p className="text-sm">{[value(preview, "phone"), value(preview, "email"), value(preview, "decreeNumber")].filter(Boolean).join(" · ")}</p><p className="mt-3 border-t pt-3 text-xs">{period(preview)}</p></section>}
    {([{ entity: "profile" as const, title: "Versi Profil Kantor", rows: profiles }, { entity: "appointment" as const, title: "Versi Pengangkatan", rows: appointments }]).map(({ entity, title, rows }) => <section key={entity} className="rounded-xl bg-white p-6 shadow-sm dark:bg-slate-800"><h3 className="mb-4 font-semibold">{title}</h3>{!rows.length && <p className="text-sm text-slate-500">Belum ada versi. Buat draft untuk memulai.</p>}<ul className="divide-y divide-slate-200 dark:divide-slate-700">{rows.map(row => <li key={value(row, "id")} className="space-y-3 py-4"><div className="flex flex-wrap items-center gap-2"><strong>{value(row, "officeName") || value(row, "notaryName")}</strong><span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-700">{value(row, "status")}</span><span className="text-sm">v{value(row, "version")} {value(row, "kind")}</span></div><p className="text-xs text-slate-500">{period(row)}</p><div className="flex flex-wrap gap-2"><button className={button} onClick={() => setPreview(row)}>Pratinjau</button>{row.status === "DRAFT" && <><button className={button} onClick={() => { setEditor({ entity, row }); setError(""); }}>Edit draft</button><button className={button} onClick={() => setConfirm({ entity, row, operation: "publish" })}>Terbitkan</button><button className={button} onClick={() => setConfirm({ entity, row, operation: "delete" })}>Hapus draft</button></>}{row.status === "PUBLISHED" && <button className={button} onClick={() => { setReason(""); setConfirm({ entity, row, operation: "retire" }); }}>Pensiunkan</button>}</div></li>)}</ul></section>)}
    {confirm?.operation === "retire" && <form className="rounded-xl bg-white p-6 dark:bg-slate-800" onSubmit={event => { event.preventDefault(); setRetireReady(true); }}><label htmlFor="retire-reason" className="text-sm">Alasan pensiun v{value(confirm.row, "version")} (3–500 karakter)</label><input id="retire-reason" className={inputClass} required minLength={3} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} /><p className="mt-2 text-sm">Riwayat pemakaian tetap disimpan.</p><button className={button} disabled={reason.trim().length < 3}>Lanjutkan</button><button type="button" className={button} onClick={() => { setConfirm(null); setRetireReady(false); }}>Batal</button></form>}
    <ConfirmDialog open={!!confirm && (confirm.operation !== "retire" || retireReady)} onClose={() => { setConfirm(null); setRetireReady(false); }} title={confirm?.operation === "publish" ? "Terbitkan versi?" : confirm?.operation === "retire" ? "Pensiunkan versi?" : "Hapus draft?"} description={confirm?.operation === "publish" ? "Versi terbit tidak dapat diedit. Periode tidak boleh tumpang tindih dengan versi terbit lain untuk profil atau jenis pengangkatan yang sama." : confirm?.operation === "retire" ? "Versi tidak dapat digunakan untuk pemakaian baru. Referensi dan riwayat pemakaian tetap disimpan." : "Draft akan dihapus permanen."} confirmLabel="Konfirmasi" onConfirm={async () => { if (!confirm) return; const form = new FormData(); form.set("id", value(confirm.row, "id")); form.set("updatedAt", value(confirm.row, "updatedAt")); if (confirm.operation === "retire") form.set("reason", reason); await mutateOfficeIdentityAction(confirm.entity, confirm.operation, form); setPreview(null); setEditor(null); router.refresh(); toast({ title: "Versi identitas diperbarui" }); }} />
  </div>;
}
