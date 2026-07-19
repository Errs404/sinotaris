import { Field, SelectField, TextArea, SubmitButton } from "@/components/form";

type PekerjaanLike = {
  kind?: string | null;
  jenis?: string | null;
  judul?: string | null;
  nomorAkta?: string | null;
  tanggalAkta?: Date | null;
  status?: string | null;
  keterangan?: string | null;
  bentukHukum?: string | null;
  pihakAlih?: string | null;
  pihakTerima?: string | null;
  luasTanah?: unknown;
  luasBangunan?: unknown;
  hargaTransaksi?: unknown;
  nop?: string | null;
  bphtb?: unknown;
  pphFinal?: unknown;
  honorarium?: unknown;
};

const toStr = (value: unknown) => (value === null || value === undefined ? "" : String(value));

export function PekerjaanForm({
  action,
  pekerjaan,
  defaultKind = "NOTARIS",
  isNotaris,
  submitLabel,
}: {
  action: (formData: FormData) => Promise<void>;
  pekerjaan?: PekerjaanLike;
  defaultKind?: string;
  isNotaris: boolean;
  submitLabel: string;
}) {
  const tanggalAkta = pekerjaan?.tanggalAkta ? pekerjaan.tanggalAkta.toISOString().slice(0, 10) : "";

  return (
    <form action={action} className="max-w-3xl space-y-6">
      <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-slate-800">
        <h3 className="mb-4 font-semibold text-slate-800 dark:text-slate-100">Data Pekerjaan</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Jabatan"
            name="kind"
            defaultValue={pekerjaan?.kind ?? defaultKind}
            options={[
              { value: "NOTARIS", label: "Notaris" },
              { value: "PPAT", label: "PPAT" },
            ]}
          />
          <Field
            label="Jenis"
            name="jenis"
            defaultValue={pekerjaan?.jenis}
            required
            placeholder="Contoh: Akta Jual Beli, SKMHT, Legalisasi"
          />
          <div className="sm:col-span-2">
            <Field
              label="Judul / Ringkasan"
              name="judul"
              defaultValue={pekerjaan?.judul}
              required
              placeholder="Contoh: AJB - Budi Santoso ke Ani K"
            />
          </div>
          <Field label="Nomor Akta" name="nomorAkta" defaultValue={pekerjaan?.nomorAkta} />
          <Field label="Tanggal Akta" name="tanggalAkta" type="date" defaultValue={tanggalAkta} />
          <SelectField
            label="Status"
            name="status"
            defaultValue={pekerjaan?.status ?? "MASUK"}
            options={[
              { value: "MASUK", label: "Masuk" },
              { value: "PROSES", label: "Proses" },
              { value: "TANDA_TANGAN", label: "Tanda Tangan" },
              { value: "SELESAI", label: "Selesai" },
              { value: "DIBATALKAN", label: "Dibatalkan" },
            ]}
          />
        </div>
        <div className="mt-4">
          <TextArea label="Keterangan" name="keterangan" defaultValue={pekerjaan?.keterangan} rows={2} />
        </div>
      </div>

      <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-slate-800">
        <h3 className="mb-1 font-semibold text-slate-800 dark:text-slate-100">Data Laporan PPAT</h3>
        <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
          Opsional — diisi untuk pekerjaan PPAT agar masuk ke laporan bulanan ATR/BPN.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Bentuk Hukum" name="bentukHukum" defaultValue={pekerjaan?.bentukHukum} placeholder="JB, HB, APHT, ..." />
          <Field label="NOP" name="nop" defaultValue={pekerjaan?.nop} />
          <Field label="Pihak yang Mengalihkan" name="pihakAlih" defaultValue={pekerjaan?.pihakAlih} />
          <Field label="Pihak yang Menerima" name="pihakTerima" defaultValue={pekerjaan?.pihakTerima} />
          <Field label="Luas Tanah (m²)" name="luasTanah" defaultValue={toStr(pekerjaan?.luasTanah)} />
          <Field label="Luas Bangunan (m²)" name="luasBangunan" defaultValue={toStr(pekerjaan?.luasBangunan)} />
          <Field label="Harga Transaksi (Rp)" name="hargaTransaksi" defaultValue={toStr(pekerjaan?.hargaTransaksi)} />
        </div>
      </div>

      <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-slate-800">
        <h3 className="mb-4 font-semibold text-slate-800 dark:text-slate-100">Pajak &amp; Biaya</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="BPHTB (Rp)" name="bphtb" defaultValue={toStr(pekerjaan?.bphtb)} />
          <Field label="PPh Final (Rp)" name="pphFinal" defaultValue={toStr(pekerjaan?.pphFinal)} />
          {isNotaris && (
            <Field
              label="Honorarium (Rp) — hanya terlihat Notaris"
              name="honorarium"
              defaultValue={toStr(pekerjaan?.honorarium)}
            />
          )}
        </div>
      </div>

      <SubmitButton>{submitLabel}</SubmitButton>
    </form>
  );
}
