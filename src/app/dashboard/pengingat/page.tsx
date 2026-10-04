import Link from "next/link";
import { BellRing, Search } from "lucide-react";
import { auth } from "@/auth";
import { inputClass } from "@/components/form";
import { requireCurrentActor } from "@/lib/currentActor";
import { formatDateOnly, indonesiaTodayDateOnly } from "@/lib/pekerjaanUi";
import { prisma } from "@/lib/prisma";
import {
  DYNAMIC_REMINDER_SEVERITIES,
  filterDynamicReminders,
  paginateDynamicReminders,
  type DynamicReminder,
  type DynamicReminderSeverity,
} from "@/lib/reminderEngine";
import { getDynamicReminders, getFinanceReminders } from "@/lib/reminderService";
import { FinanceReminders } from "@/components/FinanceReminders";
import { createReminderAction, deleteReminderAction, toggleReminderAction } from "./actions";

const PAGE_SIZE = 20;
const typeLabel: Record<string, string> = {
  LAPOR_WASIAT: "Lapor Wasiat", LAPOR_BULANAN: "Laporan Bulanan", PAJAK: "Pajak", LAINNYA: "Lainnya",
};
const severityLabel: Record<DynamicReminderSeverity, string> = {
  KRITIS: "Kritis", PERINGATAN: "Peringatan", PERLU_VERIFIKASI: "Perlu Verifikasi", REVISI: "Revisi",
};
const severityClass: Record<DynamicReminderSeverity, string> = {
  KRITIS: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  PERINGATAN: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  PERLU_VERIFIKASI: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  REVISI: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
};

type SearchParams = { severity?: string; pic?: string; q?: string; page?: string; manualPage?: string };

function positivePage(value?: string) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

function dueLabel(reminder: DynamicReminder) {
  if (reminder.daysUntilDue === null) return "Tanpa tenggat";
  if (reminder.daysUntilDue < 0) return `Terlambat ${Math.abs(reminder.daysUntilDue)} hari`;
  if (reminder.daysUntilDue === 0) return "Hari ini";
  return `H-${reminder.daysUntilDue}`;
}

function issueText(reminder: DynamicReminder) {
  const parts = [
    reminder.counts.empty ? `${reminder.counts.empty} kosong` : "",
    reminder.counts.rejected ? `${reminder.counts.rejected} ditolak` : "",
    reminder.counts.attached ? `${reminder.counts.attached} menunggu verifikasi` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Tenggat pekerjaan memerlukan perhatian.";
}

export default async function PengingatPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await auth();
  const actor = await requireCurrentActor(session!.user.id);
  const params = await searchParams;
  const financeReminders = actor.role === "NOTARIS" ? await getFinanceReminders(prisma, actor) : null;
  const severity = DYNAMIC_REMINDER_SEVERITIES.includes(params.severity as DynamicReminderSeverity)
    ? params.severity as DynamicReminderSeverity : undefined;
  const q = (params.q?.trim() ?? "").slice(0, 120);
  const pic = actor.role === "NOTARIS" ? params.pic?.trim() || "" : "";

  const [allDynamic, manualTotal, users] = await Promise.all([
    getDynamicReminders(prisma, actor),
    prisma.reminder.count({ where: { officeId: actor.officeId } }),
    actor.role === "NOTARIS" ? prisma.user.findMany({
      where: { officeId: actor.officeId, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true },
    }) : Promise.resolve([]),
  ]);
  const suppliedInvalidPic = Boolean(pic && !users.some((user) => user.id === pic));
  const validPic = users.some((user) => user.id === pic) ? pic : undefined;
  const baseFiltered = suppliedInvalidPic ? [] : filterDynamicReminders(allDynamic, { picId: validPic, query: q });
  const filtered = filterDynamicReminders(baseFiltered, { severity });
  const page = paginateDynamicReminders(filtered, positivePage(params.page), PAGE_SIZE);
  const manualTotalPages = Math.max(1, Math.ceil(manualTotal / PAGE_SIZE));
  const manualPage = Math.min(positivePage(params.manualPage), manualTotalPages);
  const reminders = await prisma.reminder.findMany({
    where: { officeId: actor.officeId },
    orderBy: [{ done: "asc" }, { dueDate: "asc" }, { id: "asc" }],
    skip: (manualPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: { id: true, type: true, title: true, dueDate: true, done: true, updatedAt: true },
  });
  const summary = Object.fromEntries(DYNAMIC_REMINDER_SEVERITIES.map((value) => [
    value, baseFiltered.filter((reminder) => reminder.severity === value).length,
  ])) as Record<DynamicReminderSeverity, number>;
  const today = indonesiaTodayDateOnly();

  function url(overrides: Partial<SearchParams>) {
    const next: SearchParams = {
      ...(severity ? { severity } : {}),
      ...(q ? { q } : {}),
      ...(validPic ? { pic: validPic } : {}),
      ...(page.currentPage > 1 ? { page: String(page.currentPage) } : {}),
      ...(manualPage > 1 ? { manualPage: String(manualPage) } : {}),
      ...overrides,
    };
    const output = new URLSearchParams();
    for (const [key, value] of Object.entries(next)) {
      if (value && !((key === "page" || key === "manualPage") && value === "1")) output.set(key, value);
    }
    const query = output.toString();
    return query ? `/dashboard/pengingat?${query}` : "/dashboard/pengingat";
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900/40"><BellRing className="h-5 w-5 text-amber-700 dark:text-amber-300" /></div>
        <div><h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Pengingat</h2><p className="text-xs text-slate-500 dark:text-slate-400">Prioritas pekerjaan otomatis dan pengingat manual kantor.</p></div>
      </div>

      {financeReminders && <FinanceReminders reminders={financeReminders} />}
      <section className="space-y-4" aria-labelledby="automatic-reminders-title">
        <div><h3 id="automatic-reminders-title" className="text-lg font-semibold text-slate-800 dark:text-slate-100">Perhatian Otomatis</h3><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Dibentuk dari tenggat dan status dokumen wajib. Perhatian akan hilang otomatis ketika kondisi tidak lagi berlaku.</p></div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {DYNAMIC_REMINDER_SEVERITIES.map((value) => <div key={value} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${severityClass[value]}`}>{severityLabel[value]}</span><p className="mt-3 text-3xl font-extrabold text-slate-800 dark:text-slate-100">{summary[value]}</p></div>)}
        </div>

        <form className="rounded-xl border border-indigo-100 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className={`grid gap-3 ${actor.role === "NOTARIS" ? "sm:grid-cols-2 lg:grid-cols-[minmax(14rem,2fr)_repeat(2,minmax(10rem,1fr))_auto]" : "sm:grid-cols-[minmax(14rem,2fr)_minmax(10rem,1fr)_auto]"} sm:items-end`}>
            <input type="hidden" name="manualPage" value={manualPage > 1 ? String(manualPage) : ""} />
            <div><label htmlFor="q" className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Pencarian</label><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input id="q" name="q" type="search" maxLength={120} defaultValue={q} placeholder="Judul, jenis, atau PIC" className={`${inputClass} pl-10`} /></div></div>
            <div><label htmlFor="severity" className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Tingkat perhatian</label><select id="severity" name="severity" defaultValue={severity ?? ""} className={inputClass}><option value="">Semua tingkat</option>{DYNAMIC_REMINDER_SEVERITIES.map((value) => <option key={value} value={value}>{severityLabel[value]}</option>)}</select></div>
            {actor.role === "NOTARIS" && <div><label htmlFor="pic" className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">PIC</label><select id="pic" name="pic" defaultValue={validPic ?? ""} className={inputClass}><option value="">Semua PIC</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></div>}
            <button className="rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500">Terapkan</button>
          </div>
        </form>

        <div className="space-y-3">
          {page.items.length === 0 && <p className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">Tidak ada perhatian otomatis yang sesuai dengan filter.</p>}
          {page.items.map((reminder) => <article key={reminder.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800"><Link href={reminder.link} className="block rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${severityClass[reminder.severity]}`}>{severityLabel[reminder.severity]}</span><span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{dueLabel(reminder)}</span></div><h4 className="mt-2 font-semibold text-slate-800 hover:text-indigo-700 dark:text-slate-100 dark:hover:text-indigo-300">{reminder.title}</h4><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{reminder.jenis} · PIC: {reminder.pic?.name ?? "Belum ditetapkan"}</p></div><p className="text-xs text-slate-500 dark:text-slate-400">{formatDateOnly(reminder.dueDate)}</p></div><p className="mt-3 text-sm font-medium text-slate-700 dark:text-slate-300">{issueText(reminder)}</p></Link></article>)}
        </div>
        {page.totalPages > 1 && <nav aria-label="Paginasi perhatian otomatis" className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-500">Halaman {page.currentPage} dari {page.totalPages} ({page.totalItems} perhatian)</p><div className="flex gap-2">{page.currentPage > 1 && <Link href={url({ page: String(page.currentPage - 1) })} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:bg-indigo-50 dark:border-slate-700">← Sebelum</Link>}{page.currentPage < page.totalPages && <Link href={url({ page: String(page.currentPage + 1) })} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:bg-indigo-50 dark:border-slate-700">Berikut →</Link>}</div></nav>}
      </section>

      <section className="space-y-4" aria-labelledby="manual-reminders-title">
        <div><h3 id="manual-reminders-title" className="text-lg font-semibold text-slate-800 dark:text-slate-100">Pengingat Manual</h3><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Pengingat bersama untuk seluruh kantor.</p></div>
        <form action={createReminderAction} className="flex flex-wrap items-end gap-3 rounded-xl bg-white p-5 shadow-sm dark:bg-slate-800">
           <div className="min-w-64 flex-1"><label htmlFor="title" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Judul</label><input id="title" name="title" required maxLength={200} placeholder="Contoh: Lapor daftar wasiat bulan Juli" className={inputClass} /></div>
          <div><label htmlFor="dueDate" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Jatuh Tempo</label><input id="dueDate" name="dueDate" type="date" required className={inputClass} /></div>
          <div><label htmlFor="type" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Jenis</label><select id="type" name="type" className={inputClass}><option value="LAPOR_WASIAT">Lapor Wasiat</option><option value="LAPOR_BULANAN">Laporan Bulanan</option><option value="PAJAK">Pajak</option><option value="LAINNYA">Lainnya</option></select></div>
          <button className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500">+ Tambah</button>
        </form>
        <div className="space-y-2">
          {reminders.length === 0 && <p className="rounded-xl bg-white p-8 text-center text-slate-400 shadow-sm dark:bg-slate-800">Belum ada pengingat manual.</p>}
          {reminders.map((reminder) => { const overdue = !reminder.done && reminder.dueDate < today; const version = reminder.updatedAt.toISOString(); return <div key={reminder.id} className={`flex flex-wrap items-center gap-3 rounded-xl bg-white px-5 py-3 shadow-sm dark:bg-slate-800 ${reminder.done ? "opacity-60" : ""}`}><form action={toggleReminderAction.bind(null, reminder.id, reminder.done, version)}><button aria-pressed={reminder.done} aria-label={reminder.done ? `Tandai ${reminder.title} belum selesai` : `Tandai ${reminder.title} selesai`} className={`flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 ${reminder.done ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 text-transparent hover:border-indigo-500"}`}>✓</button></form><div className="flex-1"><p className={`font-medium text-slate-800 dark:text-slate-100 ${reminder.done ? "line-through" : ""}`}>{reminder.title}</p><p className="text-xs text-slate-500 dark:text-slate-400">{typeLabel[reminder.type]}</p></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${overdue ? "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300" : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"}`}>{overdue ? "TERLAMBAT — " : ""}{formatDateOnly(reminder.dueDate)}</span><form action={deleteReminderAction.bind(null, reminder.id, version)}><button aria-label={`Hapus ${reminder.title}`} className="text-sm text-red-500 hover:underline focus:outline-none focus:ring-2 focus:ring-red-500">Hapus</button></form></div>; })}
        </div>
        {manualTotalPages > 1 && <nav aria-label="Paginasi pengingat manual" className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-500">Halaman {manualPage} dari {manualTotalPages} ({manualTotal} pengingat)</p><div className="flex gap-2">{manualPage > 1 && <Link href={url({ manualPage: String(manualPage - 1) })} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:bg-indigo-50 dark:border-slate-700">← Sebelum</Link>}{manualPage < manualTotalPages && <Link href={url({ manualPage: String(manualPage + 1) })} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:bg-indigo-50 dark:border-slate-700">Berikut →</Link>}</div></nav>}
      </section>
    </div>
  );
}
