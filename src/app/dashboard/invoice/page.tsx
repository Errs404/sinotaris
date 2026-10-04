import Link from "next/link";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { invoiceActor, invoiceMetrics } from "@/lib/invoiceQueries";
import { formatInvoiceMoney, invoiceOutstanding, invoicePaymentState, invoiceStatusLabel, paymentStateLabel, invoiceDueLabel, jakartaToday, invoicePanelClass, invoiceButtonClass } from "@/lib/invoiceUi";
import { inputClass } from "@/components/form";

export default async function InvoicePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await invoiceActor();
  const params = await searchParams;
  const value = (key: string) => typeof params[key] === "string" ? params[key] as string : "";
  const status = value("status"), payment = value("payment"), q = value("q").trim().slice(0, 120), clientId = value("clientId"), overdue = value("due") === "overdue";
  const clauses = [Prisma.sql`i."officeId" = ${actor.officeId}`];
  if (Object.hasOwn(invoiceStatusLabel, status)) clauses.push(Prisma.sql`i.status::text = ${status}`);
  if (clientId) clauses.push(Prisma.sql`i."clientId" = ${clientId}`);
  if (q) clauses.push(Prisma.sql`(c.name ILIKE ${`%${q}%`} OR i.number ILIKE ${`%${q}%`} OR p.judul ILIKE ${`%${q}%`})`);
  if (Object.hasOwn(paymentStateLabel, payment)) {
    clauses.push(Prisma.sql`i.status = 'TERBIT'`);
    clauses.push(payment === "BELUM_BAYAR" ? Prisma.sql`i."totalPaid" = 0` : payment === "SEBAGIAN" ? Prisma.sql`i."totalPaid" > 0 AND i."totalPaid" < i."totalAmount"` : Prisma.sql`i."totalPaid" > 0 AND i."totalPaid" >= i."totalAmount"`);
  }
  if (overdue) clauses.push(Prisma.sql`i.status = 'TERBIT' AND i."totalPaid" < i."totalAmount" AND i."dueDate" < ${new Date(jakartaToday())}`);
  const from = Prisma.sql`FROM "Invoice" i JOIN "Client" c ON c.id = i."clientId" LEFT JOIN "Pekerjaan" p ON p.id = i."pekerjaanId" WHERE ${Prisma.join(clauses, " AND ")}`;
  const [counts, metrics, clients] = await Promise.all([
    prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`SELECT COUNT(*) AS count ${from}`), invoiceMetrics(actor.officeId),
    prisma.client.findMany({ where: { officeId: actor.officeId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const total = Number(counts[0].count), pages = Math.min(1000, Math.max(1, Math.ceil(total / 20)));
  const page = Math.min(pages, Math.max(1, Math.min(1000, Math.floor(Number(value("page")) || 1))));
  const ids = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT i.id ${from} ORDER BY i."createdAt" DESC, i.id DESC LIMIT 20 OFFSET ${(page - 1) * 20}`);
  const rows = await prisma.invoice.findMany({ where: { officeId: actor.officeId, id: { in: ids.map((i) => i.id) } }, include: { client: { select: { name: true } }, pekerjaan: { select: { judul: true } } } });
  const ordered = ids.flatMap(({ id }) => rows.filter((r) => r.id === id));
  const url = (next: number) => { const s = new URLSearchParams({ status, payment, q, clientId, due: overdue ? "overdue" : "", page: String(next) }); return `/dashboard/invoice?${s}`; };
  return <div className="space-y-6">
    <div className="flex flex-wrap justify-between gap-3"><div><h2 className="text-2xl font-bold">Invoice</h2><p className="text-sm text-slate-500">Tagihan dan pembayaran klien · khusus Notaris</p></div><Link className={invoiceButtonClass} href="/dashboard/invoice/baru">Buat draft</Link></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[["Sisa tagihan terbit", formatInvoiceMoney(metrics.outstanding)], ["Lewat jatuh tempo", metrics.overdue], ["Dibayar sebagian", metrics.partial], ["Pembayaran aktif bulan ini", formatInvoiceMoney(metrics.paidThisMonth)]].map(([label, amount]) => <div key={label} className={invoicePanelClass}><p className="text-sm text-slate-500">{label}</p><p className="mt-2 break-words text-xl font-bold">{amount}</p></div>)}</div>
    <form className={`${invoicePanelClass} grid gap-3 sm:grid-cols-2 lg:grid-cols-3`}>
      <label>Cari klien / pekerjaan / nomor<input name="q" defaultValue={q} maxLength={120} className={inputClass} /></label>
      <label>Siklus tagihan<select name="status" defaultValue={status} className={inputClass}><option value="">Semua</option>{Object.entries(invoiceStatusLabel).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>Pembayaran (tagihan terbit)<select name="payment" defaultValue={payment} className={inputClass}><option value="">Semua</option>{Object.entries(paymentStateLabel).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>Klien<select name="clientId" defaultValue={clientId} className={inputClass}><option value="">Semua</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label>Jatuh tempo<select name="due" defaultValue={overdue ? "overdue" : ""} className={inputClass}><option value="">Semua</option><option value="overdue">Terlambat dan belum lunas</option></select></label><button className={invoiceButtonClass}>Terapkan</button>
    </form>
    <div className={`${invoicePanelClass} overflow-x-auto`}><table className="w-full text-left text-sm"><caption className="sr-only">Daftar invoice</caption><thead><tr>{["Invoice", "Klien / pekerjaan", "Total", "Dibayar", "Sisa", "Jatuh tempo", "Status"].map((h) => <th className="whitespace-nowrap p-3" key={h} scope="col">{h}</th>)}</tr></thead><tbody>{ordered.map((i) => <tr key={i.id} className="border-t border-slate-200 dark:border-slate-700"><td className="p-3"><Link className="font-semibold text-indigo-600 underline" href={`/dashboard/invoice/${i.id}`}>{i.number ?? "Draft"}</Link></td><td className="p-3">{i.client.name}<p className="text-xs text-slate-500">{i.pekerjaan?.judul ?? "Tanpa pekerjaan"}</p></td>{[i.totalAmount.toString(), i.totalPaid.toString(), invoiceOutstanding(i.totalAmount.toString(), i.totalPaid.toString())].map((a, n) => <td key={n} className="whitespace-nowrap p-3">{formatInvoiceMoney(a)}</td>)}<td className="p-3">{invoiceDueLabel(i.dueDate?.toISOString() ?? null)}</td><td className="p-3">{invoiceStatusLabel[i.status]}{i.status === "TERBIT" && <p>{paymentStateLabel[invoicePaymentState(i.totalAmount.toString(), i.totalPaid.toString())]}</p>}</td></tr>)}</tbody></table>{!total && <p className="p-6 text-center text-slate-500">Tidak ada tagihan yang sesuai.</p>}</div>
    <nav aria-label="Halaman invoice" className="flex justify-between gap-4">{page > 1 ? <Link href={url(page - 1)}>← Sebelumnya</Link> : <span />}<span>{page} / {pages} · {total} tagihan</span>{page < pages && <Link href={url(page + 1)}>Berikutnya →</Link>}</nav>
  </div>;
}
