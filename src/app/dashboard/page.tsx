import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { formatRupiah, monthNames } from "@/lib/indoDate";
import { PekerjaanChart } from "./PekerjaanChart";
import {
  Users,
  Briefcase,
  FileText,
  Receipt,
  UserPlus,
  Plus,
  TrendingUp,
  Bell,
} from "lucide-react";

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

  // Chart data — 6 bulan terakhir
  const chartData: { month: string; notaris: number; ppat: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const [notaris, ppat] = await Promise.all([
      prisma.pekerjaan.count({ where: { officeId, kind: "NOTARIS", createdAt: { gte: d, lt: end } } }),
      prisma.pekerjaan.count({ where: { officeId, kind: "PPAT", createdAt: { gte: d, lt: end } } }),
    ]);
    chartData.push({ month: monthNames[d.getMonth()].slice(0, 3), notaris, ppat });
  }

  const stats = [
    { label: "Total Klien", value: totalKlien, icon: Users, color: "text-indigo-600 bg-indigo-100" },
    { label: "Pekerjaan Berjalan", value: pekerjaanBerjalan, icon: Briefcase, color: "text-amber-600 bg-amber-100" },
    { label: "Bulan Ini", value: pekerjaanBulanIni, icon: FileText, color: "text-teal-600 bg-teal-100" },
    { label: "Invoice Belum Lunas", value: invoiceBelumLunas, icon: Receipt, color: "text-rose-600 bg-rose-100" },
  ];

  const quickActions = [
    { href: "/dashboard/klien/baru", label: "Tambah Klien", icon: UserPlus },
    { href: "/dashboard/pekerjaan/baru", label: "Tambah Pekerjaan", icon: Plus },
    { href: "/dashboard/dokumen", label: "Buat Dokumen", icon: FileText },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Dashboard</h2>
        <div className="flex gap-2">
          {quickActions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-50 dark:border-slate-600 dark:text-indigo-400 dark:hover:bg-slate-800"
            >
              <action.icon className="h-3.5 w-3.5" />
              {action.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-indigo-100 bg-white p-5 shadow-lg shadow-indigo-100/50 dark:border-slate-700 dark:bg-slate-800 dark:shadow-none"
          >
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                {stat.label}
              </p>
              <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${stat.color}`}>
                <stat.icon className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-2 text-3xl font-extrabold text-slate-800 dark:text-slate-100">{stat.value}</p>
          </div>
        ))}
      </div>

      {isNotaris && (
        <div className="rounded-xl border border-indigo-100 bg-gradient-to-r from-indigo-600 to-violet-600 p-5 shadow-lg shadow-indigo-200">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-200">
              Honorarium Bulan Ini
            </p>
            <TrendingUp className="h-5 w-5 text-indigo-200" />
          </div>
          <p className="mt-2 text-3xl font-extrabold text-white">
            {formatRupiah(Number(honorBulanIni?._sum.honorarium ?? 0))}
          </p>
        </div>
      )}

      <PekerjaanChart data={chartData} />

      <div className="rounded-xl border border-indigo-100 bg-white p-5 shadow-lg shadow-indigo-100/50 dark:border-slate-700 dark:bg-slate-800 dark:shadow-none">
        <div className="mb-3 flex items-center gap-2">
          <Bell className="h-4 w-4 text-amber-500" />
          <h3 className="font-semibold text-slate-800 dark:text-slate-100">Pengingat Terdekat</h3>
        </div>
        {pengingatAktif.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Tidak ada pengingat aktif.</p>
        ) : (
          <ul className="space-y-2">
            {pengingatAktif.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between rounded-lg border border-slate-100 px-4 py-2.5 text-sm dark:border-slate-700"
              >
                <span className="text-slate-700 dark:text-slate-300">{item.title}</span>
                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
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
