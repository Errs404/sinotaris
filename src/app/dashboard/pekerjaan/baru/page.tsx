import Link from "next/link";
import { auth } from "@/auth";
import { PekerjaanForm } from "../PekerjaanForm";
import { createPekerjaanAction } from "../actions";

export default async function PekerjaanBaruPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const session = await auth();
  const { kind } = await searchParams;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/pekerjaan" className="text-sm text-emerald-700 hover:underline">
          ← Kembali ke daftar pekerjaan
        </Link>
        <h2 className="mt-1 text-2xl font-bold text-slate-800">Tambah Pekerjaan</h2>
      </div>
      <PekerjaanForm
        action={createPekerjaanAction}
        defaultKind={kind === "PPAT" ? "PPAT" : "NOTARIS"}
        isNotaris={session!.user.role === "NOTARIS"}
        submitLabel="Simpan Pekerjaan"
      />
    </div>
  );
}
