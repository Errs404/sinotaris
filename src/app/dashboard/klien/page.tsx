import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Breadcrumb } from "@/components/Breadcrumb";
import { Avatar } from "@/components/Avatar";
import { Users, UserPlus, Search } from "lucide-react";

const PAGE_SIZE = 20;

export default async function KlienPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const session = await auth();
  const { q, page: pageRaw } = await searchParams;
  const currentPage = Math.max(1, Number(pageRaw) || 1);

  const where = {
    officeId: session!.user.officeId,
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { nik: { contains: q } },
            { phone: { contains: q } },
          ],
        }
      : {}),
  };

  const [clients, totalCount] = await Promise.all([
    prisma.client.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (currentPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.client.count({ where }),
  ]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  function pageUrl(p: number) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return `/dashboard/klien${qs ? `?${qs}` : ""}`;
  }

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Klien" }]} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100">
            <Users className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Klien</h2>
            <p className="text-xs text-slate-500">{totalCount} klien terdaftar</p>
          </div>
        </div>
        <Link
          href="/dashboard/klien/baru"
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-indigo-200 hover:bg-indigo-700"
        >
          <UserPlus className="h-4 w-4" />
          Tambah Klien
        </Link>
      </div>

      <form className="flex gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Cari nama, NIK, atau telepon..."
            className="w-full rounded-lg border border-slate-200 py-2 pl-10 pr-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>
        <button className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
          Cari
        </button>
      </form>

      <div className="overflow-x-auto rounded-xl border border-indigo-100 bg-white shadow-lg shadow-indigo-100/50">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-indigo-50 text-left text-xs font-semibold uppercase tracking-wide text-indigo-700">
              <th className="px-4 py-3">Nama</th>
              <th className="px-4 py-3">Tipe</th>
              <th className="px-4 py-3">NIK</th>
              <th className="px-4 py-3">Telepon</th>
              <th className="px-4 py-3">Alamat</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {clients.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center">
                  <Users className="mx-auto h-10 w-10 text-slate-300" />
                  <p className="mt-2 font-medium text-slate-500">
                    {q ? "Tidak ada klien yang cocok." : "Belum ada klien"}
                  </p>
                  {!q && (
                    <Link href="/dashboard/klien/baru" className="mt-1 text-sm text-indigo-600 hover:underline">
                      + Tambah klien pertama
                    </Link>
                  )}
                </td>
              </tr>
            )}
            {clients.map((client) => (
              <tr key={client.id} className="border-b border-indigo-50 transition-colors hover:bg-indigo-50/60">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={client.name} size="sm" />
                    <span className="font-medium text-slate-800">{client.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
                    {client.type === "PERORANGAN" ? "Perorangan" : "Badan Hukum"}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-600">{client.nik ?? "-"}</td>
                <td className="px-4 py-3 text-slate-600">{client.phone ?? "-"}</td>
                <td className="max-w-xs truncate px-4 py-3 text-slate-600">{client.address ?? "-"}</td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/dashboard/klien/${client.id}`}
                    className="font-medium text-indigo-700 hover:underline"
                  >
                    Detail
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">
            Halaman {currentPage} dari {totalPages} ({totalCount} klien)
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
