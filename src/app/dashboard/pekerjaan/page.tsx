import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Breadcrumb } from "@/components/Breadcrumb";
import { Briefcase, Search, Plus } from "lucide-react";

const PAGE_SIZE = 20;

const statusLabel: Record<string, { label: string; className: string }> = {
  MASUK: { label: "Masuk", className: "bg-slate-100 text-slate-600" },
  PROSES: { label: "Proses", className: "bg-amber-100 text-amber-700" },
  TANDA_TANGAN: { label: "Tanda Tangan", className: "bg-indigo-100 text-indigo-700" },
  SELESAI: { label: "Selesai", className: "bg-teal-100 text-teal-700" },
  DIBATALKAN: { label: "Dibatalkan", className: "bg-red-100 text-red-600" },
};

export default async function PekerjaanPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; q?: string; page?: string }>;
}) {
  const session = await auth();
  const { kind: kindRaw, q, page: pageRaw } = await searchParams;
  const kind = kindRaw === "PPAT" ? "PPAT" : "NOTARIS";
  const currentPage = Math.max(1, Number(pageRaw) || 1);

  const where = {
    officeId: session!.user.officeId,
    kind: kind as "NOTARIS" | "PPAT",
    ...(q
      ? {
          OR: [
            { judul: { contains: q, mode: "insensitive" as const } },
            { jenis: { contains: q, mode: "insensitive" as const } },
            { nomorAkta: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [items, totalCount] = await Promise.all([
    prisma.pekerjaan.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (currentPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.pekerjaan.count({ where }),
  ]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  function pageUrl(p: number) {
    const params = new URLSearchParams();
    params.set("kind", kind);
    if (q) params.set("q", q);
    if (p > 1) params.set("page", String(p));
    return `/dashboard/pekerjaan?${params.toString()}`;
  }

  const tabClass = (active: boolean) =>
    `rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
      active ? "bg-indigo-600 text-white shadow-md shadow-indigo-200 dark:shadow-none" : "bg-white text-slate-600 hover:bg-indigo-50 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
    }`;

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Pekerjaan" }]} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 dark:bg-indigo-900/50">
            <Briefcase className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Pekerjaan</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">{totalCount} pekerjaan {kind}</p>
          </div>
        </div>
        <Link
          href={`/dashboard/pekerjaan/baru?kind=${kind}`}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-indigo-200 hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" />
          Tambah Pekerjaan
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-2">
          <Link href="/dashboard/pekerjaan?kind=NOTARIS" className={tabClass(kind === "NOTARIS")}>
            Notaris
          </Link>
          <Link href="/dashboard/pekerjaan?kind=PPAT" className={tabClass(kind === "PPAT")}>
            PPAT
          </Link>
        </div>
        <form className="flex flex-1 gap-2">
          <input type="hidden" name="kind" value={kind} />
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              name="q"
              defaultValue={q ?? ""}
              placeholder="Cari judul, jenis, atau nomor akta..."
              className="w-full rounded-lg border border-slate-200 py-2 pl-10 pr-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:placeholder-slate-500"
            />
          </div>
          <button className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
            Cari
          </button>
        </form>
      </div>

      <div className="overflow-x-auto rounded-xl border border-indigo-100 bg-white shadow-lg shadow-indigo-100/50 dark:border-slate-700 dark:bg-slate-800 dark:shadow-none">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-indigo-50 text-left text-xs font-semibold uppercase tracking-wide text-indigo-700 dark:bg-slate-700 dark:text-indigo-300">
              <th className="px-4 py-3">No. Akta</th>
              <th className="px-4 py-3">Tanggal</th>
              <th className="px-4 py-3">Jenis</th>
              <th className="px-4 py-3">Judul</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center">
                  <Briefcase className="mx-auto h-10 w-10 text-slate-300" />
                  <p className="mt-2 font-medium text-slate-500">
                    {q ? "Tidak ada pekerjaan yang cocok." : `Belum ada pekerjaan ${kind}.`}
                  </p>
                </td>
              </tr>
            )}
            {items.map((item) => {
              const status = statusLabel[item.status] ?? statusLabel.MASUK;
              return (
                <tr key={item.id} className="border-b border-indigo-50 transition-colors hover:bg-indigo-50/60 dark:border-slate-700 dark:hover:bg-slate-700/50">
                  <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300">{item.nomorAkta ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                    {item.tanggalAkta ? item.tanggalAkta.toLocaleDateString("id-ID") : "-"}
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{item.jenis}</td>
                  <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">{item.judul}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${status.className}`}>
                      {status.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/dashboard/pekerjaan/${item.id}`}
                      className="font-medium text-indigo-700 hover:underline dark:text-indigo-400"
                    >
                      Detail
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">
            Halaman {currentPage} dari {totalPages} ({totalCount} pekerjaan)
          </p>
          <div className="flex gap-1">
            {currentPage > 1 && (
              <Link href={pageUrl(currentPage - 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:bg-indigo-50">
                ← Sebelum
              </Link>
            )}
            {currentPage < totalPages && (
              <Link href={pageUrl(currentPage + 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:bg-indigo-50">
                Berikut →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
