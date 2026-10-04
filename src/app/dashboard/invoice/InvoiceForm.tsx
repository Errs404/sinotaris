"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field, inputClass, TextArea } from "@/components/form";
import { PendingButton } from "@/components/PendingButton";
import { useToast } from "@/components/Toast";
import { createInvoiceAction, updateInvoiceAction } from "./actions";
import { formatInvoiceMoney, invoiceCategoryLabel, invoiceButtonClass, invoicePanelClass, rupiahInteger } from "@/lib/invoiceUi";

type Item = { category: keyof typeof invoiceCategoryLabel; desc: string; qty: string; unitPrice: string };
export type InvoiceFormOptions = { clients: { id: string; name: string }[]; jobs: { id: string; judul: string; clients: { clientId: string }[] }[] };
export type DraftValues = { id?: string; version?: number; clientId: string; pekerjaanId: string; dueDate: string; notes: string; items: Item[] };
const blank = (): Item => ({ category: "HONORARIUM", desc: "", qty: "1", unitPrice: "0" });
export function InvoiceForm({ clients, jobs, initial }: InvoiceFormOptions & { initial?: DraftValues }) {
  const router = useRouter(); const { toast } = useToast();
  const [clientId, setClient] = useState(initial?.clientId ?? "");
  const [jobId, setJob] = useState(initial?.pekerjaanId ?? "");
  const [items, setItems] = useState<Item[]>(initial?.items.length ? initial.items : [blank()]);
  const [error, setError] = useState("");
  let total: string | null = null;
  try { total = items.reduce((sum, i) => { if (!/^[1-9]\d{0,2}$/.test(i.qty)) throw new Error(); return sum + rupiahInteger(i.unitPrice) * BigInt(i.qty); }, BigInt(0)).toString(); } catch { /* incomplete input */ }
  const change = (index: number, patch: Partial<Item>) => setItems(items.map((i, n) => n === index ? { ...i, ...patch } : i));
  async function save(data: FormData) {
    setError(""); data.set("items", JSON.stringify(items));
    try { const result = initial?.id ? await updateInvoiceAction(initial.id, data) : await createInvoiceAction(data); toast({ title: "Draft disimpan" }); router.push(`/dashboard/invoice/${result.id}`); router.refresh(); }
    catch (e) { const message = e instanceof Error ? e.message : "Gagal menyimpan draft."; setError(message); toast({ title: "Draft belum disimpan", description: message, variant: "error" }); }
  }
  return <form action={save} className={`${invoicePanelClass} space-y-5`}>
    <input type="hidden" name="version" value={initial?.version ?? 1} />
    <div className="grid gap-4 sm:grid-cols-2"><label>Klien<select required name="clientId" className={inputClass} value={clientId} onChange={(e) => { setClient(e.target.value); setJob(""); }}><option value="">Pilih klien</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Pekerjaan (opsional)<select name="pekerjaanId" className={inputClass} value={jobId} onChange={(e) => setJob(e.target.value)}><option value="">Tanpa pekerjaan</option>{jobs.filter((j) => j.clients.some((c) => c.clientId === clientId)).map((j) => <option key={j.id} value={j.id}>{j.judul}</option>)}</select></label></div>
    <p className="text-sm text-slate-500">Nomor dialokasikan saat terbit. Tinjau setiap item sebelum menerbitkan; tidak ada perhitungan pajak otomatis. Nominal dalam Rupiah bulat tanpa titik/koma.</p>
    {items.map((item, index) => <fieldset key={index} className="grid gap-3 rounded-lg border border-slate-200 p-4 dark:border-slate-700 sm:grid-cols-2"><legend className="px-1 font-semibold">Item {index + 1}</legend><label>Kategori<select value={item.category} onChange={(e) => change(index, { category: e.target.value as Item["category"] })} className={inputClass}>{Object.entries(invoiceCategoryLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label><label>Deskripsi<input required maxLength={200} className={inputClass} value={item.desc} onChange={(e) => change(index, { desc: e.target.value })} /></label><label>Kuantitas<input required type="number" min={1} max={999} step={1} className={inputClass} value={item.qty} onChange={(e) => change(index, { qty: e.target.value })} /></label><label>Harga satuan<input required inputMode="numeric" pattern="[0-9]+" maxLength={16} className={inputClass} value={item.unitPrice} onChange={(e) => change(index, { unitPrice: e.target.value })} /></label><button type="button" className="text-left text-sm text-red-600 underline" onClick={() => setItems(items.filter((_, n) => n !== index))}>Hapus item {index + 1}</button></fieldset>)}
    <button type="button" disabled={items.length >= 50} className={invoiceButtonClass} onClick={() => setItems([...items, blank()])}>Tambah item</button><p aria-live="polite" className="text-xl font-bold">Total: {total === null ? "Periksa nominal / kuantitas" : formatInvoiceMoney(total)}</p>
    <Field name="dueDate" label="Jatuh tempo (opsional)" type="date" defaultValue={initial?.dueDate} /><TextArea name="notes" label="Catatan" defaultValue={initial?.notes} />
    {error && <p role="alert" className="text-red-600">{error}</p>}<PendingButton pendingLabel="Menyimpan..." className={invoiceButtonClass} disabled={total === null}>Simpan draft</PendingButton>
  </form>;
}
