import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PekerjaanForm } from "../PekerjaanForm";
import { updatePekerjaanAction, deletePekerjaanAction } from "../actions";

export default async function PekerjaanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  const { id } = await params;

  const pekerjaan = await prisma.pekerjaan.findFirst({
    where: { id, officeId: session!.user.officeId },
  });

  if (!pekerjaan) notFound();

  const updateWithId = updatePekerjaanAction.bind(null, pekerjaan.id);
  const deleteWithId = deletePekerjaanAction.bind(null, pekerjaan.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/dashboard/pekerjaan" className="text-sm text-emerald-700 hover:underline">
            ← Kembali ke daftar pekerjaan
          </Link>
          <h2 className="mt-1 text-2xl font-bold text-slate-800">{pekerjaan.judul}</h2>
        </div>
        <form action={deleteWithId}>
          <button className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50">
            Hapus Pekerjaan
          </button>
        </form>
      </div>
      <PekerjaanForm
        action={updateWithId}
        pekerjaan={pekerjaan}
        isNotaris={session!.user.role === "NOTARIS"}
        submitLabel="Simpan Perubahan"
      />
    </div>
  );
}
