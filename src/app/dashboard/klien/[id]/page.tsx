import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { KlienForm } from "../KlienForm";
import { updateClientAction, deleteClientAction } from "../actions";

export default async function KlienDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  const { id } = await params;

  const client = await prisma.client.findFirst({
    where: { id, officeId: session!.user.officeId },
  });

  if (!client) notFound();

  const updateWithId = updateClientAction.bind(null, client.id);
  const deleteWithId = deleteClientAction.bind(null, client.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/dashboard/klien" className="text-sm text-emerald-700 hover:underline">
            ← Kembali ke daftar klien
          </Link>
          <h2 className="mt-1 text-2xl font-bold text-slate-800">{client.name}</h2>
        </div>
        <form action={deleteWithId}>
          <button className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50">
            Hapus Klien
          </button>
        </form>
      </div>
      <KlienForm action={updateWithId} client={client} submitLabel="Simpan Perubahan" />
    </div>
  );
}
