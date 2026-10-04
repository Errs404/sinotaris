"use client";
import Link from "next/link";
export default function InvoiceError({ reset }: { reset: () => void }) {
  return <section className="space-y-4" role="alert"><h2 className="text-xl font-semibold">Halaman tidak dapat dibuka</h2><p>Periksa hak akses akun Anda atau coba kembali. Tidak ada perubahan yang dilakukan oleh halaman ini.</p><button onClick={reset} className="rounded-lg border px-4 py-2 focus:ring-2 focus:ring-indigo-500">Coba kembali</button><Link className="ml-4 underline" href="/dashboard">Kembali ke dashboard</Link></section>;
}
