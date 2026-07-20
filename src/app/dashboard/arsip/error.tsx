"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";

export default function ArchiveError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center dark:border-red-900 dark:bg-red-950/30">
      <AlertTriangle className="mx-auto h-10 w-10 text-red-500" />
      <h2 className="mt-3 text-lg font-bold text-red-800 dark:text-red-200">Dokumen belum berhasil diproses</h2>
      <p className="mt-2 text-sm text-red-700 dark:text-red-300">Periksa ukuran, format, ketajaman foto, dan pastikan PDF bukan hasil scan. File yang gagal tidak disimpan.</p>
      <button onClick={reset} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"><RefreshCw className="h-4 w-4" /> Coba lagi</button>
    </div>
  );
}
