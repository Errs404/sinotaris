import { Field, SelectField, TextArea, SubmitButton } from "@/components/form";

type ClientLike = {
  type?: string | null;
  name?: string | null;
  nik?: string | null;
  npwp?: string | null;
  tempatLahir?: string | null;
  tanggalLahir?: Date | null;
  gender?: string | null;
  pekerjaan?: string | null;
  statusKawin?: string | null;
  wargaNegara?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
};

export function KlienForm({
  action,
  client,
  submitLabel,
}: {
  action: (formData: FormData) => Promise<void>;
  client?: ClientLike;
  submitLabel: string;
}) {
  const tanggalLahir = client?.tanggalLahir
    ? client.tanggalLahir.toISOString().slice(0, 10)
    : "";

  return (
    <form action={action} className="max-w-3xl space-y-6">
      <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-slate-800">
        <h3 className="mb-4 font-semibold text-slate-800 dark:text-slate-100">Data Utama</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Tipe Klien"
            name="type"
            defaultValue={client?.type ?? "PERORANGAN"}
            options={[
              { value: "PERORANGAN", label: "Perorangan" },
              { value: "BADAN_HUKUM", label: "Badan Hukum" },
            ]}
          />
          <Field label="Nama Lengkap" name="name" defaultValue={client?.name} required placeholder="Sesuai KTP / akta pendirian" />
          <Field label="NIK" name="nik" defaultValue={client?.nik} placeholder="16 digit" />
          <Field label="NPWP" name="npwp" defaultValue={client?.npwp} />
          <SelectField
            label="Sapaan"
            name="gender"
            defaultValue={client?.gender ?? ""}
            options={[
              { value: "", label: "-" },
              { value: "Tuan", label: "Tuan" },
              { value: "Nyonya", label: "Nyonya" },
              { value: "Nona", label: "Nona" },
            ]}
          />
          <Field label="Warga Negara" name="wargaNegara" defaultValue={client?.wargaNegara ?? "Indonesia"} />
        </div>
      </div>

      <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-slate-800">
        <h3 className="mb-4 font-semibold text-slate-800 dark:text-slate-100">Kelahiran &amp; Status</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tempat Lahir" name="tempatLahir" defaultValue={client?.tempatLahir} />
          <Field label="Tanggal Lahir" name="tanggalLahir" type="date" defaultValue={tanggalLahir} />
          <Field label="Pekerjaan" name="pekerjaan" defaultValue={client?.pekerjaan} placeholder="Sesuai KTP" />
          <SelectField
            label="Status Kawin"
            name="statusKawin"
            defaultValue={client?.statusKawin ?? ""}
            options={[
              { value: "", label: "-" },
              { value: "Belum Kawin", label: "Belum Kawin" },
              { value: "Kawin", label: "Kawin" },
              { value: "Cerai Hidup", label: "Cerai Hidup" },
              { value: "Cerai Mati", label: "Cerai Mati" },
            ]}
          />
        </div>
      </div>

      <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-slate-800">
        <h3 className="mb-4 font-semibold text-slate-800 dark:text-slate-100">Kontak</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Telepon / WA" name="phone" defaultValue={client?.phone} />
          <Field label="Email" name="email" type="email" defaultValue={client?.email} />
        </div>
        <div className="mt-4 space-y-4">
          <TextArea label="Alamat" name="address" defaultValue={client?.address} />
          <TextArea label="Catatan" name="notes" defaultValue={client?.notes} rows={2} />
        </div>
      </div>

      <SubmitButton>{submitLabel}</SubmitButton>
    </form>
  );
}
