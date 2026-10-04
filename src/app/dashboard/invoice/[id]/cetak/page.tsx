import { notFound } from "next/navigation";
import { findInvoice, invoiceActor } from "@/lib/invoiceQueries";
import { parseInvoiceSnapshot } from "@/lib/invoiceUi";
import { InvoiceDocument } from "../../InvoiceDocument";
import { PrintButton } from "../../PrintButton";
import "../../print.css";
export default async function PrintInvoice({ params }: { params: Promise<{ id: string }> }) {
  const actor = await invoiceActor(); const { id } = await params; const invoice = await findInvoice(id, actor.officeId);
  if (!invoice || invoice.status === "DRAFT") notFound();
  const snapshot = parseInvoiceSnapshot(invoice.snapshotJson);
  if (!snapshot) return <p role="alert">Snapshot tidak tersedia. Invoice tidak dapat dicetak.</p>;
  return <div className="invoice-print space-y-5"><PrintButton /><InvoiceDocument snapshot={snapshot} status={invoice.status} /></div>;
}
