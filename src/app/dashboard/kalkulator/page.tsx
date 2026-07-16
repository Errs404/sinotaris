"use client";

import { useState } from "react";
import { calculateBiaya } from "@/lib/calculator";
import { formatRupiah } from "@/lib/indoDate";

function parseRupiah(value: string): number {
  return Number(value.replace(/[^\d]/g, "")) || 0;
}

export default function KalkulatorPage() {
  const [harga, setHarga] = useState("");
  const [npoptkp, setNpoptkp] = useState("60000000");

  const hargaNum = parseRupiah(harga);
  const result = calculateBiaya({
    hargaTransaksi: hargaNum,
    npoptkp: parseRupiah(npoptkp),
  });

  const rows = [
    { label: "BPHTB (5% setelah NPOPTKP)", value: result.bphtb },
    { label: "PPh Final (2,5%)", value: result.pphFinal },
    { label: "Honorarium maks. (UUJN Pasal 36)", value: result.honorariumMax },
  ];

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">Kalkulator Biaya</h2>
        <p className="mt-1 text-sm text-slate-500">
          Perkiraan BPHTB, PPh Final, dan honorarium maksimal. Angka NPOPTKP bisa
          berbeda per daerah — silakan sesuaikan.
        </p>
      </div>

      <div className="rounded-xl bg-white p-6 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="harga" className="mb-1 block text-sm font-medium text-slate-700">
              Harga Transaksi / NJOP (Rp)
            </label>
            <input
              id="harga"
              inputMode="numeric"
              value={hargaNum ? hargaNum.toLocaleString("id-ID") : ""}
              onChange={(e) => setHarga(e.target.value)}
              placeholder="500.000.000"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label htmlFor="npoptkp" className="mb-1 block text-sm font-medium text-slate-700">
              NPOPTKP (Rp)
            </label>
            <input
              id="npoptkp"
              inputMode="numeric"
              value={parseRupiah(npoptkp) ? parseRupiah(npoptkp).toLocaleString("id-ID") : ""}
              onChange={(e) => setNpoptkp(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl bg-white p-6 shadow-sm">
        <h3 className="mb-4 font-semibold text-slate-800">Hasil Perhitungan</h3>
        <div className="space-y-3">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between border-b border-slate-100 pb-3">
              <span className="text-sm text-slate-600">{row.label}</span>
              <span className="font-semibold text-slate-800">{formatRupiah(row.value)}</span>
            </div>
          ))}
          <div className="flex items-center justify-between pt-1">
            <span className="font-semibold text-slate-800">Total Perkiraan</span>
            <span className="text-xl font-bold text-indigo-700">{formatRupiah(result.total)}</span>
          </div>
        </div>
        <p className="mt-4 text-xs text-slate-400">
          Perhitungan ini hanya perkiraan, bukan angka final. Tarif dan NPOPTKP mengikuti
          peraturan daerah masing-masing.
        </p>
      </div>
    </div>
  );
}
