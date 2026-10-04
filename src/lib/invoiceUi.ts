export const invoiceStatusLabel: Record<string, string> = { DRAFT: "Draft", TERBIT: "Terbit", VOID: "Dibatalkan" };
export const paymentStateLabel = { BELUM_BAYAR: "Belum bayar", SEBAGIAN: "Sebagian", LUNAS: "Lunas" };
export const invoiceCategoryLabel = { HONORARIUM: "Honorarium", BIAYA_PROSES: "Biaya proses", TITIPAN_PAJAK: "Titipan pajak", TITIPAN_PNBP: "Titipan PNBP", PAJAK_JASA: "Pajak jasa", LAINNYA: "Lainnya" };
export const paymentMethodLabel = { TRANSFER: "Transfer", TUNAI: "Tunai", CEK_GIRO: "Cek / giro", LAINNYA: "Lainnya" };
export const invoicePanelClass = "rounded-xl border border-indigo-100 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800";
export const invoiceButtonClass = "inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-500 disabled:opacity-50";
export const invoiceStatusClass = { DRAFT: "bg-slate-100 text-slate-700", TERBIT: "bg-indigo-100 text-indigo-800", VOID: "bg-red-100 text-red-800" };
export function rupiahInteger(value: string): bigint {
  if (!/^\d+(?:\.0+)?$/.test(value)) throw new Error("Nominal harus berupa Rupiah bulat tanpa pemisah.");
  return BigInt(value.split(".")[0]);
}
export function formatInvoiceMoney(value: string): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) throw new Error("Nominal tidak valid.");
  const integer = match[2].replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const fraction = (match[3] ?? "").replace(/0+$/, "");
  return `Rp ${match[1]}${integer}${fraction ? `,${fraction}` : ""}`;
}
export function invoiceOutstanding(total: string, paid: string) { return (rupiahInteger(total) - rupiahInteger(paid)).toString(); }
export function invoicePaymentState(total: string, paid: string): keyof typeof paymentStateLabel {
  const p = rupiahInteger(paid);
  return p === BigInt(0) ? "BELUM_BAYAR" : p < rupiahInteger(total) ? "SEBAGIAN" : "LUNAS";
}
export function jakartaToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function invoiceDueLabel(date: string | null, now = new Date()) {
  if (!date) return "Tanpa jatuh tempo";
  const days = Math.round((Date.parse(date.slice(0, 10)) - Date.parse(jakartaToday(now))) / 86400000);
  return days < 0 ? `Terlambat ${-days} hari` : days === 0 ? "Jatuh tempo hari ini" : `Jatuh tempo ${date.slice(0, 10)}`;
}
export type InvoiceSnapshot = {
  identity?: import("@/lib/officeIdentity").OfficeIdentitySnapshot;
  office: { name: string; address: string | null; phone: string | null };
  client: { name: string; address: string | null };
  pekerjaan: { judul: string; jenis: string } | null;
  items: { category: keyof typeof invoiceCategoryLabel; desc: string; qty: number; unitPrice: string; lineTotal: string }[];
  totalAmount: string; dueDate: string | null; notes: string | null; number: string; issuedAt: string;
};
export function parseInvoiceSnapshot(value: unknown): InvoiceSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const v = value as InvoiceSnapshot;
  const text = (x: unknown) => x === null || typeof x === "string";
  if (v.identity !== undefined) {
    const identity = v.identity;
    const p = identity?.profile;
    const a = identity?.appointment;
    if (!p || typeof p.id !== "string" || !Number.isInteger(p.version) || p.version < 1
      || typeof p.officeName !== "string" || !text(p.address) || !text(p.phone) || !text(p.email)) return null;
    if (a !== null && (!a || typeof a.id !== "string" || !Number.isInteger(a.version) || a.version < 1
      || !["NOTARIS", "PPAT", "NOTARIS_PENGGANTI"].includes(a.kind) || typeof a.notaryName !== "string"
      || !text(a.title) || !text(a.workArea) || !text(a.decreeNumber) || !text(a.decreeDateText)
      || !(a.decreeDate === null || (typeof a.decreeDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(a.decreeDate))))) return null;
  }
  if (!v.office || typeof v.office.name !== "string" || !text(v.office.address) || !text(v.office.phone)
    || !v.client || typeof v.client.name !== "string" || !text(v.client.address)
    || !(v.pekerjaan === null || (typeof v.pekerjaan?.judul === "string" && typeof v.pekerjaan?.jenis === "string"))
    || typeof v.number !== "string" || typeof v.issuedAt !== "string" || !text(v.dueDate) || !text(v.notes)
    || typeof v.totalAmount !== "string" || !Array.isArray(v.items)) return null;
  if (!Number.isFinite(Date.parse(v.issuedAt)) || (v.dueDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(v.dueDate))) return null;
  try {
    rupiahInteger(v.totalAmount);
    for (const i of v.items) {
      if (!i || !Object.hasOwn(invoiceCategoryLabel, i.category) || typeof i.desc !== "string" || !Number.isInteger(i.qty) || i.qty < 1 || typeof i.unitPrice !== "string" || typeof i.lineTotal !== "string") return null;
      rupiahInteger(i.unitPrice); rupiahInteger(i.lineTotal);
    }
  } catch { return null; }
  return v;
}
