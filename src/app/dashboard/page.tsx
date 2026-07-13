import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { formatRupiah } from "@/lib/indoDate";

export default async function DashboardPage() {
  const session = await auth();
  const officeId = session!.user.officeId;
  const isNotaris = session!.user.role === "NOTARIS";

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [totalKlien, pekerjaanBerjalan, pekerjaanBulanIni, invoiceBelumLunas, pengingatAktif, honorBulanIni] =
    await Promise.all([
      prisma.client.count({ where: { officeId } }),
      prisma.pekerjaan.count({
        where: { officeId, status: { in: ["MASUK", "PROSES", "TANDA_TANGAN"] } },
      }),
      prisma.pekerjaan.count({
        where: { officeId, createdAt: { gte: startOfMonth } },
      }),
      prisma.invoice.count({
        where: { officeId, status: "TERKIRIM" },
      }),
      prisma.reminder.findMany({
        where: { officeId, done: false, dueDate: { gte: now } },
        orderBy: { dueDate: "asc" },
        take: 5,
      }),
      isNotaris
        ? prisma.pekerjaan.aggregate({
            where: { officeId, createdAt: { gte: startOfMonth } },
            _sum: { honorarium: true },
          })
        : null,
    ]);

  const stats = [
    { label: "Total Klien", value: totalKlien },
    { label: "Pekerjaan Berjalan", value: pekerjaanBerjalan },
    { label: "Pekerjaan Bulan Ini", value: pekerjaanBulanIni },
    { label: "Invoice Belum Lunas", value: invoiceBelumLunas },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-slate-800">Dashboard</h2>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">{stat.label}</p>
            <p className="mt-1 text-3xl font-bold text-slate-800">{stat.value}</p>
          </div>
        ))}
      </div>

      {isNotaris && (
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Honorarium Bulan Ini</p>
          <p className="mt-1 text-3xl font-bold text-emerald-700">
            {formatRupiah(Number(honorBulanIni?._sum.honorarium ?? 0))}
          </p>
        </div>
      )}

      <div className="rounded-xl bg-white p-5 shadow-sm">
        <h3 className="mb-3 font-semibold text-slate-800">Pengingat Terdekat</h3>
        {pengingatAktif.length === 0 ? (
          <p className="text-sm text-slate-500">Tidak ada pengingat aktif.</p>
        ) : (
          <ul className="space-y-2">
            {pengingatAktif.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-2 text-sm"
              >
                <span>{item.title}</span>
                <span className="font-medium text-amber-600">
                  {item.dueDate.toLocaleDateString("id-ID")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
