import { invoiceActor, invoiceOptions } from "@/lib/invoiceQueries";
import { InvoiceForm } from "../InvoiceForm";
export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<{ clientId?: string; pekerjaanId?: string }> }) {
  const actor = await invoiceActor(); const options = await invoiceOptions(actor.officeId); const params = await searchParams;
  const job = options.jobs.find((j) => j.id === params.pekerjaanId);
  const clientId = options.clients.find((c) => c.id === params.clientId)?.id ?? (job?.clients.length === 1 ? job.clients[0].clientId : "");
  return <div className="space-y-5"><h2 className="text-2xl font-bold">Buat draft invoice</h2><InvoiceForm {...options} initial={{ clientId, pekerjaanId: job?.clients.some((c) => c.clientId === clientId) ? job.id : "", dueDate: "", notes: "", items: [] }} /></div>;
}
