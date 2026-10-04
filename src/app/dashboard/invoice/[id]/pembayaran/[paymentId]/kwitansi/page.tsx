import { notFound } from "next/navigation";
import { invoiceActor } from "@/lib/invoiceQueries";
import { prisma } from "@/lib/prisma";
import { formatInvoiceMoney, parseInvoiceSnapshot, paymentMethodLabel, invoicePanelClass } from "@/lib/invoiceUi";
import { PrintButton } from "../../../../PrintButton";
import "../../../../print.css";
export default async function Receipt({ params }: { params: Promise<{ id: string; paymentId: string }> }) {
  const actor = await invoiceActor(); const { id, paymentId } = await params;
  const payment = await prisma.payment.findFirst({ where: { id: paymentId, invoiceId: id, officeId: actor.officeId, invoice: { officeId: actor.officeId } }, include: { invoice: { select: { snapshotJson: true, status: true } }, recordedBy: { select: { name: true } } } });
  if (!payment) notFound(); const snapshot = parseInvoiceSnapshot(payment.invoice.snapshotJson);
  if (!snapshot) return <p role="alert">Snapshot tidak tersedia. Kwitansi tidak dapat dicetak.</p>;
  return <div className="invoice-print space-y-5"><PrintButton /><article className={`${invoicePanelClass} invoice-document space-y-5`}>
    {(payment.status === "VOID" || payment.invoice.status === "VOID") && <p className="border-4 border-red-700 p-3 text-center text-3xl font-black text-red-700">VOID · DIBATALKAN</p>}
    <header><h2 className="text-2xl font-bold">KWITANSI</h2><p>{payment.receiptNumber}</p><h3 className="mt-3 font-bold">{snapshot.office.name}</h3><p>{snapshot.office.address}</p><p>{snapshot.office.phone}</p></header>
    <p>Telah diterima dari: <strong>{snapshot.client.name}</strong></p><p className="text-2xl font-bold">{formatInvoiceMoney(payment.amount.toString())}</p><p>Untuk pembayaran invoice {snapshot.number}</p><p>Tanggal efektif: {payment.paidAt.toISOString().slice(0, 10)}</p><p>Metode: {paymentMethodLabel[payment.method]}</p>{payment.reference && <p>Referensi: {payment.reference}</p>}{payment.notes && <p className="whitespace-pre-line">{payment.notes}</p>}<p>Status: {payment.status === "AKTIF" ? "Aktif" : "Dibatalkan"}</p>{payment.voidReason && <p>Alasan pembatalan: {payment.voidReason}</p>}<p>Dicatat oleh: {payment.recordedBy?.name ?? "—"}</p>
  </article></div>;
}
