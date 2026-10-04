import "server-only";
import { requireSession } from "@/auth";
import { requireCurrentNotaris } from "@/lib/currentActor";
import { prisma } from "@/lib/prisma";
import { jakartaToday } from "@/lib/invoiceUi";

export async function invoiceActor() {
  const session = await requireSession();
  return requireCurrentNotaris(session.user.id);
}
export async function invoiceMetrics(officeId: string, now = new Date()) {
  const today = jakartaToday(now);
  const monthStart = new Date(`${today.slice(0, 7)}-01T00:00:00.000Z`);
  const monthEnd = new Date(monthStart); monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);
  const unpaid = { officeId, status: "TERBIT" as const, totalPaid: { lt: prisma.invoice.fields.totalAmount } };
  const [totals, overdue, partial, payments] = await Promise.all([
    prisma.invoice.aggregate({ where: unpaid, _sum: { totalAmount: true, totalPaid: true } }),
    prisma.invoice.count({ where: { ...unpaid, dueDate: { lt: new Date(today) } } }),
    prisma.invoice.count({ where: { ...unpaid, totalPaid: { gt: 0, lt: prisma.invoice.fields.totalAmount } } }),
    prisma.payment.aggregate({ where: { officeId, status: "AKTIF", paidAt: { gte: monthStart, lt: monthEnd } }, _sum: { amount: true } }),
  ]);
  return { outstanding: totals._sum.totalAmount?.minus(totals._sum.totalPaid ?? 0).toFixed(0) ?? "0", overdue, partial, paidThisMonth: payments._sum.amount?.toFixed(0) ?? "0" };
}
export async function invoiceOptions(officeId: string) {
  const [clients, jobs] = await Promise.all([
    prisma.client.findMany({ where: { officeId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.pekerjaan.findMany({ where: { officeId }, select: { id: true, judul: true, clients: { select: { clientId: true } } }, orderBy: { updatedAt: "desc" } }),
  ]);
  return { clients, jobs };
}
export async function findInvoice(id: string, officeId: string) {
  return prisma.invoice.findFirst({ where: { id, officeId }, include: {
    client: { select: { name: true, address: true } }, pekerjaan: { select: { judul: true } },
    items: { orderBy: { sortOrder: "asc" } }, payments: { where: { officeId }, orderBy: [{ paidAt: "desc" }, { id: "desc" }] },
    createdBy: { select: { name: true } },
  } });
}
