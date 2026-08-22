import { ComingSoon } from "@/components/ComingSoon";
import { requireSession } from "@/auth";
import { requireCurrentNotaris } from "@/lib/currentActor";

export default async function InvoicePage() {
  const session = await requireSession();
  await requireCurrentNotaris(session.user.id);
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
