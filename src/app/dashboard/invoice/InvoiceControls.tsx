"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PendingButton } from "@/components/PendingButton";
import { Field, inputClass, TextArea } from "@/components/form";
import { useToast } from "@/components/Toast";
import { createPaymentAction, deleteInvoiceAction, issueInvoiceAction, voidInvoiceAction, voidPaymentAction } from "./actions";
import { formatInvoiceMoney, invoiceButtonClass, invoicePanelClass, jakartaToday, paymentMethodLabel } from "@/lib/invoiceUi";

export function LifecycleControls({ id, version, status }: { id: string; version: number; status: string }) {
  const [confirm, setConfirm] = useState<"issue" | "delete" | null>(null); const router = useRouter();
  if (status !== "DRAFT") return null;
  return <div className="flex flex-wrap gap-3"><button className={invoiceButtonClass} onClick={() => setConfirm("issue")}>Terbitkan</button><button className="rounded-lg border border-red-300 px-4 py-2 text-red-600" onClick={() => setConfirm("delete")}>Hapus draft</button><ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} title={confirm === "issue" ? "Terbitkan invoice?" : "Hapus draft?"} description={confirm === "issue" ? "Pastikan draft terbaru sudah disimpan. Nomor akan dialokasikan dan rincian tidak dapat diedit lagi." : "Draft ini akan dihapus permanen."} confirmLabel={confirm === "issue" ? "Terbitkan" : "Hapus"} variant={confirm === "issue" ? "warning" : "danger"} onConfirm={async () => { if (confirm === "issue") await issueInvoiceAction(id, version); else { await deleteInvoiceAction(id, version); router.push("/dashboard/invoice"); } router.refresh(); }} /></div>;
}

export function PaymentForm({ id, version, outstanding, today }: { id: string; version: number; outstanding: string; today: string }) {
  const requestKey = useRef<string | null>(null); const router = useRouter(); const { toast } = useToast(); const [error, setError] = useState("");
  return <form className={`${invoicePanelClass} space-y-4`} action={async (data) => {
    setError(""); requestKey.current ??= crypto.randomUUID(); data.set("requestKey", requestKey.current);
    try { await createPaymentAction(id, data); requestKey.current = null; toast({ title: "Pembayaran dicatat" }); router.refresh(); }
    catch (e) { const message = e instanceof Error ? e.message : "Gagal mencatat pembayaran."; setError(message); toast({ title: "Pembayaran belum dicatat", description: message, variant: "error" }); }
  }}>
    <h3 className="text-lg font-semibold">Catat pembayaran</h3><p>Maksimal {formatInvoiceMoney(outstanding)}. Saldo diverifikasi kembali oleh server.</p><input type="hidden" name="version" value={version} />
    <div className="grid gap-4 sm:grid-cols-2"><label>Nominal (Rupiah bulat)<input name="amount" required inputMode="numeric" pattern="[0-9]+" maxLength={16} className={inputClass} /></label><Field name="paidAt" label="Tanggal efektif pembayaran" type="date" required defaultValue={today || jakartaToday()} /><label>Metode<select name="method" className={inputClass}>{Object.entries(paymentMethodLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label><Field name="reference" label="Referensi (opsional)" /></div><TextArea name="notes" label="Catatan (opsional)" />{error && <p role="alert" className="text-red-600">{error}</p>}<PendingButton pendingLabel="Mencatat..." className={invoiceButtonClass}>Catat pembayaran</PendingButton>
  </form>;
}

export function VoidControl({ invoiceId, paymentId, version }: { invoiceId: string; paymentId?: string; version: number }) {
  const [reason, setReason] = useState(""); const [open, setOpen] = useState(false); const router = useRouter();
  return <div className="space-y-2 print:hidden"><label className="block text-sm">Alasan pembatalan {paymentId ? "pembayaran" : "invoice"}<input className={inputClass} value={reason} maxLength={1000} onChange={(e) => setReason(e.target.value)} /></label><button disabled={!reason.trim()} className="rounded-lg border border-red-300 px-3 py-2 text-sm text-red-600 disabled:opacity-50" onClick={() => setOpen(true)}>Batalkan {paymentId ? "pembayaran" : "invoice"}</button><ConfirmDialog open={open} onClose={() => setOpen(false)} title={paymentId ? "Batalkan pembayaran?" : "Batalkan invoice?"} description={`Tidak dapat dipulihkan. ${reason}`} confirmLabel="Ya, batalkan" onConfirm={async () => { if (paymentId) await voidPaymentAction(invoiceId, paymentId, version, reason); else await voidInvoiceAction(invoiceId, version, reason); setReason(""); router.refresh(); }} /></div>;
}
