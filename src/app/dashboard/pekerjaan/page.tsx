import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const statusLabel: Record<string, { label: string; className: string }> = {
  MASUK: { label: "Masuk", className: "text-slate-500" },
  PROSES: { label: "Proses", className: "text-amber-600" },
  TANDA_TANGAN: { label: "Tanda Tangan", className: "text-indigo-600" },
  SELESAI: { label: "Selesai", className: "text-teal-600" },
  DIBATALKAN: { label: "Dibatalkan", className: "text-red-500" },
};

export default async function PekerjaanPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; q?: string }>;
}) {
  const session = await auth();
  const { kind: kindRaw, q } = await searchParams;
  const kind = kindRaw === "PPAT" ? "PPAT" : "NOTARIS";

  const items = await prisma.pekerjaan.findMany({
    where: {
      officeId: session!.user.officeId,
      kind,
      ...(q
        ? {
            OR: [
              { judul: { contains: q, mode: "insensitive" } },
              { jenis: { contains: q, mode: "insensitive" } },
              { nomorAkta: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const tabClass = (active: boolean) =>
    `rounded-lg px-4 py-2 text-sm font-semibold ${
      active ? "bg-indigo-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"
    }`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold text-slate-800">Pekerjaan</h2>
        <Link
          href={`/dashboard/pekerjaan/baru?kind=${kind}`}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          + Tambah Pekerjaan
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
          <input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Cari judul, jenis, atau nomor akta..."
            className="w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
            Cari
          </button>
        </form>
      </div>

      <div className="overflow-x-auto rounded-xl border border-indigo-100 bg-white shadow-lg shadow-indigo-100/50">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-indigo-50 text-left text-xs font-semibold uppercase tracking-wide text-indigo-700">
              <th className="px-4 py-3 font-medium">No. Akta</th>
              <th className="px-4 py-3 font-medium">Tanggal</th>
              <th className="px-4 py-3 font-medium">Jenis</th>
              <th className="px-4 py-3 font-medium">Judul</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  {q
                    ? "Tidak ada pekerjaan yang cocok."
                    : `Belum ada pekerjaan ${kind === "PPAT" ? "PPAT" : "Notaris"}.`}
                </td>
              </tr>
            )}
            {items.map((item) => {
              const status = statusLabel[item.status] ?? statusLabel.MASUK;
              return (
                <tr key={item.id} className="border-b border-indigo-50 transition-colors hover:bg-indigo-50/60">
                  <td className="px-4 py-3 text-slate-600">{item.nomorAkta ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {item.tanggalAkta ? item.tanggalAkta.toLocaleDateString("id-ID") : "-"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{item.jenis}</td>
                  <td className="px-4 py-3 font-medium text-slate-800">{item.judul}</td>
                  <td className="px-4 py-3">
                    <span className={`text-sm font-semibold ${status.className}`}>
                      {status.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/dashboard/pekerjaan/${item.id}`}
                      className="font-medium text-indigo-700 hover:underline"
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
    </div>
  );
}
