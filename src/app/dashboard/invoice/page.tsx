import { ComingSoon } from "@/components/ComingSoon";

export default function InvoicePage() {
  return (
    <ComingSoon
      title="Invoice"
      description="Buat invoice dan tanda terima untuk klien, pantau status pembayaran."
      items={[
        "Buat invoice dengan rincian item biaya",
        "Nomor invoice otomatis (INV/2026/001)",
        "Status: Draft, Terkirim, Lunas, Dibatalkan",
        "Cetak PDF dan kirim ke klien",
        "Terhubung ke pekerjaan dan klien",
      ]}
    />
  );
}
