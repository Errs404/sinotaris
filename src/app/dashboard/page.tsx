import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { formatRupiah, monthNames } from "@/lib/indoDate";
import { requireCurrentActor } from "@/lib/currentActor";
import { getDynamicReminders } from "@/lib/reminderService";
import type { DynamicReminder, DynamicReminderSeverity } from "@/lib/reminderEngine";
import { PekerjaanChart } from "./PekerjaanChart";
import {
  formatDateOnly,
  indonesiaTodayDateOnly,
  pekerjaanPriorityClass,
  pekerjaanPriorityLabel,
  pekerjaanStatusClass,
  pekerjaanStatusLabel,
} from "@/lib/pekerjaanUi";
import {
  Users,
  Briefcase,
  FileText,
  Receipt,
  UserPlus,
  Plus,
  TrendingUp,
  Bell,
  AlertTriangle,
  CalendarClock,
  Flag,
  UserCheck,
  Files,
} from "lucide-react";

const reminderSeverityLabel: Record<DynamicReminderSeverity, string> = {
  KRITIS: "Kritis", PERINGATAN: "Peringatan", PERLU_VERIFIKASI: "Perlu Verifikasi", REVISI: "Revisi",
};
const reminderSeverityClass: Record<DynamicReminderSeverity, string> = {
  KRITIS: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  PERINGATAN: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  PERLU_VERIFIKASI: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  REVISI: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
};

function dynamicDueLabel(reminder: DynamicReminder) {
  if (reminder.daysUntilDue === null) return "Tanpa tenggat";
  if (reminder.daysUntilDue < 0) return `Terlambat ${Math.abs(reminder.daysUntilDue)} hari`;
  if (reminder.daysUntilDue === 0) return "Hari ini";
  return `H-${reminder.daysUntilDue}`;
}

export default async function DashboardPage() {
  const session = await auth();
  const actor = await requireCurrentActor(session!.user.id);
  const officeId = actor.officeId;
  const isNotaris = actor.role === "NOTARIS";
  const actorScope = actor.role === "STAF" ? { picId: actor.id } : {};

  const now = new Date();
  const today = indonesiaTodayDateOnly(now);
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const activeStatuses = ["MASUK", "PROSES", "TANDA_TANGAN"] as const;

  const [totalKlien, pekerjaanBerjalan, pekerjaanBulanIni, invoiceBelumLunas, pengingatAktif, honorBulanIni,
    overdueCount, dueTodayCount, highPriorityCount, myCount, actionNeeded, dynamicReminders] =
    await Promise.all([
      prisma.client.count({ where: { officeId } }),
      prisma.pekerjaan.count({
        where: { officeId, status: { in: ["MASUK", "PROSES", "TANDA_TANGAN"] } },
      }),
      prisma.pekerjaan.count({
        where: { officeId, createdAt: { gte: startOfMonth } },
      }),
      isNotaris
        ? prisma.invoice.count({
            where: { officeId, status: "TERBIT", totalPaid: { lt: prisma.invoice.fields.totalAmount } },
          })
        : 0,
      prisma.reminder.findMany({
        where: { officeId, done: false },
        orderBy: { dueDate: "asc" },
        take: 5,
      }),
      isNotaris
        ? prisma.pekerjaan.aggregate({
            where: { officeId, createdAt: { gte: startOfMonth } },
            _sum: { honorarium: true },
          })
        : null,
      prisma.pekerjaan.count({ where: { officeId, ...actorScope, status: { in: [...activeStatuses] }, dueDate: { lt: today } } }),
      prisma.pekerjaan.count({ where: { officeId, ...actorScope, status: { in: [...activeStatuses] }, dueDate: { gte: today, lt: tomorrow } } }),
      prisma.pekerjaan.count({ where: { officeId, ...actorScope, status: { in: [...activeStatuses] }, priority: "TINGGI" } }),
      prisma.pekerjaan.count({ where: { officeId, status: { in: [...activeStatuses] }, picId: actor.id } }),
      prisma.pekerjaan.findMany({
        where: {
          officeId,
          ...actorScope,
          status: { in: [...activeStatuses] },
          OR: [
            { dueDate: { lt: tomorrow } },
            { priority: "TINGGI" },
            { checklistItems: { some: { required: true, status: { in: ["KOSONG", "TERLAMPIR", "DITOLAK"] } } } },
          ],
        },
        orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { priority: "desc" }, { updatedAt: "desc" }],
        take: 12,
        select: {
          id: true, judul: true, status: true, priority: true, dueDate: true,
          pic: { select: { name: true } },
          checklistItems: { where: { required: true, status: { in: ["KOSONG", "TERLAMPIR", "DITOLAK"] } }, select: { status: true } },
        },
      }),
      getDynamicReminders(prisma, actor, now),
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
    ...(isNotaris ? [{ label: "Invoice Belum Lunas", value: invoiceBelumLunas, icon: Receipt, color: "text-rose-600 bg-rose-100" }] : []),
  ];

  const quickActions = [
    { href: "/dashboard/klien/baru", label: "Tambah Klien", icon: UserPlus },
    { href: "/dashboard/pekerjaan/baru", label: "Tambah Pekerjaan", icon: Plus },
    { href: "/dashboard/dokumen", label: "Buat Dokumen", icon: FileText },
  ];

  const documentIssueCount = dynamicReminders.filter((reminder) =>
    reminder.counts.empty + reminder.counts.rejected + reminder.counts.attached > 0,
  ).length;
  const actionStats = [
    { label: "Overdue", value: overdueCount, icon: AlertTriangle, color: "text-red-600 bg-red-100" },
    { label: "Jatuh Tempo Hari Ini", value: dueTodayCount, icon: CalendarClock, color: "text-amber-600 bg-amber-100" },
    { label: "Prioritas Tinggi", value: highPriorityCount, icon: Flag, color: "text-rose-600 bg-rose-100" },
    { label: "Pekerjaan Saya", value: myCount, icon: UserCheck, color: "text-indigo-600 bg-indigo-100" },
    { label: "Alert Dokumen", value: documentIssueCount, icon: Files, color: "text-orange-600 bg-orange-100" },
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

      <section className="space-y-4" aria-labelledby="action-needed-title">
        <div>
          <h3 id="action-needed-title" className="font-semibold text-slate-800 dark:text-slate-100">Perlu Tindakan</h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Pekerjaan aktif yang terlambat, jatuh tempo hari ini, berprioritas tinggi, atau memiliki dokumen wajib yang perlu perhatian. Untuk Staf, daftar ini hanya mencakup pekerjaan yang ditugaskan.</p>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {actionStats.map((stat) => (
            <div key={stat.label} className="rounded-xl border border-indigo-100 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{stat.label}</p>
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${stat.color}`}><stat.icon className="h-4 w-4" /></div>
              </div>
              <p className="mt-2 text-2xl font-extrabold text-slate-800 dark:text-slate-100">{stat.value}</p>
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-indigo-100 bg-white p-5 shadow-lg shadow-indigo-100/50 dark:border-slate-700 dark:bg-slate-800 dark:shadow-none">
          {actionNeeded.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Tidak ada pekerjaan yang perlu tindakan khusus.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-700">
              {actionNeeded.map((item) => {
                const overdue = Boolean(item.dueDate && item.dueDate < today);
                const checklistIssueCount = item.checklistItems.length;
                return (
                  <li key={item.id} className="py-3 first:pt-0 last:pb-0">
                    <Link href={`/dashboard/pekerjaan/${item.id}`} className="block rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:flex sm:items-center sm:justify-between sm:gap-4">
                      <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-800 hover:text-indigo-700 dark:text-slate-100 dark:hover:text-indigo-300">{item.judul}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">PIC: {item.pic?.name ?? "Belum ditetapkan"}</p>{checklistIssueCount > 0 && <p className="mt-1 text-xs font-medium text-orange-700 dark:text-orange-300">{checklistIssueCount} dokumen wajib perlu perhatian</p>}</div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 sm:mt-0 sm:justify-end">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${pekerjaanStatusClass[item.status]}`}>{pekerjaanStatusLabel[item.status]}</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${pekerjaanPriorityClass[item.priority]}`}>{pekerjaanPriorityLabel[item.priority]}</span>
                        <span className={overdue ? "rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-900/40 dark:text-red-300" : "text-xs text-slate-500 dark:text-slate-400"}>{overdue ? `Terlambat · ${formatDateOnly(item.dueDate)}` : `Jatuh tempo ${formatDateOnly(item.dueDate)}`}</span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2" aria-label="Ringkasan pengingat">
        <div className="rounded-xl border border-indigo-100 bg-white p-5 shadow-lg shadow-indigo-100/50 dark:border-slate-700 dark:bg-slate-800 dark:shadow-none">
          <div className="mb-3 flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Bell className="h-4 w-4 text-red-500" /><h3 className="font-semibold text-slate-800 dark:text-slate-100">Prioritas Otomatis</h3></div><Link href="/dashboard/pengingat" className="text-xs font-semibold text-indigo-700 hover:underline dark:text-indigo-400">Lihat semua</Link></div>
          {dynamicReminders.length === 0 ? <p className="text-sm text-slate-500 dark:text-slate-400">Tidak ada perhatian otomatis saat ini.</p> : <ul className="space-y-2">{dynamicReminders.slice(0, 5).map((item) => <li key={item.id}><Link href={item.link} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 px-4 py-2.5 text-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:hover:bg-slate-700"><span className="min-w-0 truncate font-medium text-slate-700 dark:text-slate-200">{item.title}</span><span className="flex items-center gap-2"><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${reminderSeverityClass[item.severity]}`}>{reminderSeverityLabel[item.severity]}</span><span className="text-xs text-slate-500 dark:text-slate-400">{dynamicDueLabel(item)}</span></span></Link></li>)}</ul>}
        </div>
        <div className="rounded-xl border border-indigo-100 bg-white p-5 shadow-lg shadow-indigo-100/50 dark:border-slate-700 dark:bg-slate-800 dark:shadow-none">
          <div className="mb-3 flex items-center gap-2"><Bell className="h-4 w-4 text-amber-500" /><h3 className="font-semibold text-slate-800 dark:text-slate-100">Pengingat Manual Terdekat</h3></div>
          {pengingatAktif.length === 0 ? <p className="text-sm text-slate-500 dark:text-slate-400">Tidak ada pengingat manual aktif.</p> : <ul className="space-y-2">{pengingatAktif.map((item) => { const overdue = item.dueDate < today; return <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 px-4 py-2.5 text-sm dark:border-slate-700"><span className="text-slate-700 dark:text-slate-300">{item.title}</span><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${overdue ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"}`}>{overdue ? "Terlambat · " : ""}{formatDateOnly(item.dueDate)}</span></li>; })}</ul>}
        </div>
      </section>
    </div>
  );
}
