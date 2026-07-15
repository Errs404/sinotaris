import { ComingSoon } from "@/components/ComingSoon";

export default function DokumenPage() {
  return (
    <ComingSoon
      title="Generator Dokumen"
      description="Membuat dokumen Word (.docx) langsung dari data klien dan pekerjaan — pengembangan dari SKMHT Generator."
      items={[
        "Template SKMHT bawaan (diporting dari aplikasi lama)",
        "Upload template Word sendiri dengan placeholder {nama_field}",
        "Form otomatis: tanggal jadi teks terbilang Bahasa Indonesia",
        "Isi form dari data klien yang sudah tersimpan",
        "Riwayat dokumen yang pernah dibuat per pekerjaan",
      ]}
    />
  );
}
