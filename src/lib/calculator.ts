// Kalkulator biaya Notaris/PPAT
// BPHTB = 5% x (NJOP/harga - NPOPTKP); PPh Final = 2,5% x harga;
// Honorarium sesuai UU Jabatan Notaris Pasal 36 (maks bertingkat berdasarkan nilai objek).
// Semua angka bisa dioverride per daerah di UI.

export interface CalculatorInput {
  hargaTransaksi: number; // nilai transaksi / NJOP tertinggi
  npoptkp?: number; // Nilai Perolehan Objek Pajak Tidak Kena Pajak, default 60jt (bervariasi per daerah)
  bphtbRate?: number; // default 5%
  pphRate?: number; // default 2,5%
}

export interface CalculatorResult {
  bphtb: number;
  pphFinal: number;
  honorariumMax: number;
  total: number;
}

/**
 * Honorarium maksimal sesuai UUJN Pasal 36:
 * - s.d. Rp100jt: maks 2,5%
 * - > Rp100jt s.d. Rp1M: maks 1,5%
 * - > Rp1M: maks 1%
 * Dihitung bertingkat per lapisan nilai.
 */
export function honorariumMaxUUJN(nilai: number): number {
  if (nilai <= 0) return 0;

  const lapis1 = Math.min(nilai, 100_000_000) * 0.025;
  const lapis2 = nilai > 100_000_000 ? (Math.min(nilai, 1_000_000_000) - 100_000_000) * 0.015 : 0;
  const lapis3 = nilai > 1_000_000_000 ? (nilai - 1_000_000_000) * 0.01 : 0;

  return Math.round(lapis1 + lapis2 + lapis3);
}

export function calculateBiaya({
  hargaTransaksi,
  npoptkp = 60_000_000,
  bphtbRate = 0.05,
  pphRate = 0.025,
}: CalculatorInput): CalculatorResult {
  const dasarBphtb = Math.max(0, hargaTransaksi - npoptkp);
  const bphtb = Math.round(dasarBphtb * bphtbRate);
  const pphFinal = Math.round(hargaTransaksi * pphRate);
  const honorariumMax = honorariumMaxUUJN(hargaTransaksi);

  return {
    bphtb,
    pphFinal,
    honorariumMax,
    total: bphtb + pphFinal + honorariumMax,
  };
}
