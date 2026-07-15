import Link from "next/link";
import { KlienForm } from "../KlienForm";
import { createClientAction } from "../actions";

export default function KlienBaruPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/klien" className="text-sm text-emerald-700 hover:underline">
          ← Kembali ke daftar klien
        </Link>
        <h2 className="mt-1 text-2xl font-bold text-slate-800">Tambah Klien</h2>
      </div>
      <KlienForm action={createClientAction} submitLabel="Simpan Klien" />
    </div>
  );
}
