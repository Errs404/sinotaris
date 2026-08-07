import Link from "next/link";
import { Briefcase, Plus, Search } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import type { PekerjaanPriority, PekerjaanStatus } from "@/generated/prisma/enums";
import { auth } from "@/auth";
import { Breadcrumb } from "@/components/Breadcrumb";
import { inputClass } from "@/components/form";
import { prisma } from "@/lib/prisma";
import {
  formatDateOnly,
  indonesiaTodayDateOnly,
  isPekerjaanOverdue,
  pekerjaanPriorityClass,
  pekerjaanPriorityLabel,
  pekerjaanStatusClass,
  pekerjaanStatusLabel,
} from "@/lib/pekerjaanUi";

const PAGE_SIZE = 20;
const STATUSES: PekerjaanStatus[] = ["MASUK", "PROSES", "TANDA_TANGAN", "SELESAI", "DIBATALKAN"];
const PRIORITIES: PekerjaanPriority[] = ["RENDAH", "NORMAL", "TINGGI"];

type SearchParams = { kind?: string; q?: string; page?: string; status?: string; priority?: string; pic?: string };

export default async function PekerjaanPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await auth();
  const params = await searchParams;
  const officeId = session!.user.officeId;
  const kind = params.kind === "PPAT" ? "PPAT" : "NOTARIS";
  const q = params.q?.trim() || "";
  const status = STATUSES.includes(params.status as PekerjaanStatus) ? params.status as PekerjaanStatus : undefined;
  const priority = PRIORITIES.includes(params.priority as PekerjaanPriority) ? params.priority as PekerjaanPriority : undefined;
  const pic = params.pic?.trim() || "";

  const users = await prisma.user.findMany({
    where: { officeId, isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, role: true },
  });
  const validUserIds = new Set(users.map((user) => user.id));
  const resolvedPicId = pic === "me" ? session!.user.id : validUserIds.has(pic) ? pic : undefined;

  const where: Prisma.PekerjaanWhereInput = {
    officeId,
    kind,
    ...(status ? { status } : {}),
    ...(priority ? { priority } : {}),
    ...(pic === "all" || !pic ? {} : resolvedPicId ? { picId: resolvedPicId } : { id: "__invalid_pic__" }),
    ...(q ? {
      OR: [
        { judul: { contains: q, mode: "insensitive" } },
        { jenis: { contains: q, mode: "insensitive" } },
        { nomorAkta: { contains: q, mode: "insensitive" } },
      ],
    } : {}),
  };

  const totalCount = await prisma.pekerjaan.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const requestedPage = Math.max(1, Number(params.page) || 1);
  const currentPage = Math.min(requestedPage, totalPages);
  const hasWorkflowFilter = Boolean(status || priority || (pic && pic !== "all"));
  const items = await prisma.pekerjaan.findMany({
    where,
    orderBy: hasWorkflowFilter
      ? [{ dueDate: { sort: "asc", nulls: "last" } }, { updatedAt: "desc" }]
      : [{ updatedAt: "desc" }],
    skip: (currentPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true, nomorAkta: true, tanggalAkta: true, jenis: true, judul: true, status: true,
      priority: true, dueDate: true, pic: { select: { id: true, name: true } },
    },
  });
  const today = indonesiaTodayDateOnly();

  function url(overrides: Partial<SearchParams>) {
    const next = { ...params, kind, ...overrides };
    const output = new URLSearchParams();
    for (const [key, value] of Object.entries(next)) {
      if (value && !(key === "page" && value === "1")) output.set(key, value);
    }
    return `/dashboard/pekerjaan?${output.toString()}`;
  }

  const tabClass = (active: boolean) => `rounded-lg px-4 py-2 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
    active ? "bg-indigo-600 text-white shadow-md shadow-indigo-200 dark:shadow-none" : "bg-white text-slate-600 hover:bg-indigo-50 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
  }`;

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Pekerjaan" }]} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 dark:bg-indigo-900/50"><Briefcase className="h-5 w-5 text-indigo-600" /></div>
          <div><h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Pekerjaan</h2><p className="text-xs text-slate-500 dark:text-slate-400">{totalCount} pekerjaan {kind}</p></div>
        </div>
        <Link href={`/dashboard/pekerjaan/baru?kind=${kind}`} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-indigo-200 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"><Plus className="h-4 w-4" />Tambah Pekerjaan</Link>
      </div>

      <div className="flex gap-2">
        <Link href={url({ kind: "NOTARIS", page: undefined })} className={tabClass(kind === "NOTARIS")}>Notaris</Link>
        <Link href={url({ kind: "PPAT", page: undefined })} className={tabClass(kind === "PPAT")}>PPAT</Link>
      </div>

      <form className="rounded-xl border border-indigo-100 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <input type="hidden" name="kind" value={kind} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(14rem,2fr)_repeat(3,minmax(9rem,1fr))_auto] lg:items-end">
          <div>
            <label htmlFor="q" className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Pencarian</label>
            <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input id="q" type="search" name="q" defaultValue={q} placeholder="Judul, jenis, atau nomor akta" className={`${inputClass} pl-10`} /></div>
          </div>
          <div><label htmlFor="status" className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Status</label><select id="status" name="status" defaultValue={status ?? ""} className={inputClass}><option value="">Semua status</option>{STATUSES.map((value) => <option key={value} value={value}>{pekerjaanStatusLabel[value]}</option>)}</select></div>
          <div><label htmlFor="priority" className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Prioritas</label><select id="priority" name="priority" defaultValue={priority ?? ""} className={inputClass}><option value="">Semua prioritas</option>{PRIORITIES.map((value) => <option key={value} value={value}>{pekerjaanPriorityLabel[value]}</option>)}</select></div>
          <div><label htmlFor="pic" className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">PIC</label><select id="pic" name="pic" defaultValue={pic || "all"} className={inputClass}><option value="all">Semua PIC</option><option value="me">Pekerjaan saya</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></div>
          <button className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500">Terapkan</button>
        </div>
      </form>

      <div className="overflow-x-auto rounded-xl border border-indigo-100 bg-white shadow-lg shadow-indigo-100/50 dark:border-slate-700 dark:bg-slate-800 dark:shadow-none">
        <table className="min-w-[980px] w-full text-sm">
          <thead><tr className="bg-indigo-50 text-left text-xs font-semibold uppercase tracking-wide text-indigo-700 dark:bg-slate-700 dark:text-indigo-300"><th className="px-4 py-3">No. Akta / Tanggal</th><th className="px-4 py-3">Pekerjaan</th><th className="px-4 py-3">PIC</th><th className="px-4 py-3">Prioritas</th><th className="px-4 py-3">Jatuh Tempo</th><th className="px-4 py-3">Status</th><th className="px-4 py-3"><span className="sr-only">Aksi</span></th></tr></thead>
          <tbody>
            {items.length === 0 && <tr><td colSpan={7} className="px-4 py-12 text-center"><Briefcase className="mx-auto h-10 w-10 text-slate-300" /><p className="mt-2 font-medium text-slate-500">Tidak ada pekerjaan yang sesuai dengan filter.</p></td></tr>}
            {items.map((item) => {
              const overdue = isPekerjaanOverdue(item.dueDate, item.status, today);
              return (
                <tr key={item.id} className="border-b border-indigo-50 transition-colors hover:bg-indigo-50/60 dark:border-slate-700 dark:hover:bg-slate-700/50">
                  <td className="px-4 py-3"><p className="font-mono text-xs text-slate-700 dark:text-slate-200">{item.nomorAkta ?? "-"}</p><p className="mt-1 text-xs text-slate-500">{formatDateOnly(item.tanggalAkta)}</p></td>
                  <td className="px-4 py-3"><p className="font-medium text-slate-800 dark:text-slate-100">{item.judul}</p><p className="mt-1 text-xs text-slate-500">{item.jenis}</p></td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{item.pic?.name ?? "Belum ditetapkan"}</td>
                  <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${pekerjaanPriorityClass[item.priority]}`}>{pekerjaanPriorityLabel[item.priority]}</span></td>
                  <td className="px-4 py-3"><p className="text-slate-600 dark:text-slate-300">{formatDateOnly(item.dueDate)}</p>{overdue && <span className="mt-1 inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-900/40 dark:text-red-300">Terlambat</span>}</td>
                  <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${pekerjaanStatusClass[item.status]}`}>{pekerjaanStatusLabel[item.status]}</span></td>
                  <td className="px-4 py-3 text-right"><Link href={`/dashboard/pekerjaan/${item.id}`} className="font-medium text-indigo-700 hover:underline focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-indigo-400">Detail</Link></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalCount > PAGE_SIZE && <nav aria-label="Paginasi pekerjaan" className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-500">Halaman {currentPage} dari {totalPages} ({totalCount} pekerjaan)</p><div className="flex gap-1">{currentPage > 1 && <Link href={url({ page: String(currentPage - 1) })} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:bg-indigo-50">← Sebelum</Link>}{currentPage < totalPages && <Link href={url({ page: String(currentPage + 1) })} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:bg-indigo-50">Berikut →</Link>}</div></nav>}
    </div>
  );
}
