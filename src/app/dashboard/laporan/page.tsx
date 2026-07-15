import { ComingSoon } from "@/components/ComingSoon";

export default function LaporanPage() {
  return (
    <ComingSoon
      title="Laporan Bulanan"
      description="Laporan bulanan Notaris & PPAT dibuat otomatis dari data pekerjaan, siap cetak PDF."
      items={[
        "Laporan Notaris: Akta, Legalisasi, Waarmerking (A4)",
        "Laporan PPAT format ATR/BPN dengan kolom pajak (A3)",
        "Data BPHTB, PPh Final, SSP/SSB terisi otomatis dari pekerjaan",
        "Ekspor PDF siap dilaporkan",
        "Ekspor Excel untuk arsip",
      ]}
    />
  );
}
