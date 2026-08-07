import { Field, SelectField, TextArea, SubmitButton, inputClass } from "@/components/form";
import { dateOnlyInputValue, pekerjaanStatusClass, pekerjaanStatusLabel } from "@/lib/pekerjaanUi";
import type { PekerjaanPriority, PekerjaanStatus, UserRole } from "@/generated/prisma/enums";
import { PihakEditor, type ClientOption, type PihakValue } from "./PihakEditor";

type PekerjaanLike = {
  kind?: string | null;
  jenis?: string | null;
  judul?: string | null;
  nomorAkta?: string | null;
  tanggalAkta?: Date | string | null;
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
  picId?: string | null;
  dueDate?: Date | string | null;
  priority?: PekerjaanPriority | null;
  internalNotes?: string | null;
  updatedAt?: Date | string | null;
};

export type PekerjaanUserOption = { id: string; name: string; role: UserRole };

const toStr = (value: unknown) => (value === null || value === undefined ? "" : String(value));

export function PekerjaanForm({
  action,
  pekerjaan,
  defaultKind = "NOTARIS",
  isNotaris,
  submitLabel,
  clients,
  parties,
  users,
  currentActorId,
}: {
  action: (formData: FormData) => Promise<void>;
  pekerjaan?: PekerjaanLike;
  defaultKind?: string;
  isNotaris: boolean;
  submitLabel: string;
  clients: ClientOption[];
  parties?: PihakValue[];
  users: PekerjaanUserOption[];
  currentActorId: string;
}) {
  const tanggalAkta = dateOnlyInputValue(pekerjaan?.tanggalAkta);
  const dueDate = dateOnlyInputValue(pekerjaan?.dueDate);
  const status = (pekerjaan?.status ?? "MASUK") as PekerjaanStatus;
  const selectedPicId = pekerjaan?.picId && users.some((user) => user.id === pekerjaan.picId)
    ? pekerjaan.picId
    : pekerjaan ? "" : currentActorId;

  return (
    <form action={action} className="max-w-3xl space-y-6">
      {pekerjaan?.updatedAt && (
        <input type="hidden" name="expectedUpdatedAt" value={new Date(pekerjaan.updatedAt).toISOString()} />
      )}
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
          {pekerjaan && (
            <div>
              <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Status</span>
              <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${pekerjaanStatusClass[status]}`}>
                {pekerjaanStatusLabel[status]}
              </span>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Status diubah melalui aksi alur kerja.</p>
            </div>
          )}
        </div>
        <div className="mt-4">
          <TextArea label="Keterangan" name="keterangan" defaultValue={pekerjaan?.keterangan} rows={2} />
        </div>
      </div>

      <div className="rounded-xl border border-indigo-100 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <h3 className="font-semibold text-slate-800 dark:text-slate-100">Alur Kerja Internal</h3>
        <p className="mb-4 mt-1 text-xs text-slate-500 dark:text-slate-400">Tetapkan penanggung jawab, urgensi, dan target penyelesaian.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="picId" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
              PIC <span className="text-red-500">*</span>
            </label>
            <select id="picId" name="picId" required defaultValue={selectedPicId} className={inputClass}>
              {selectedPicId === "" && <option value="" disabled>Pilih PIC aktif</option>}
              {users.map((user) => (
                <option key={user.id} value={user.id}>{user.name} ({user.role === "NOTARIS" ? "Notaris" : "Staf"})</option>
              ))}
            </select>
          </div>
          <SelectField
            label="Prioritas"
            name="priority"
            defaultValue={pekerjaan?.priority ?? "NORMAL"}
            options={[
              { value: "RENDAH", label: "Rendah" },
              { value: "NORMAL", label: "Normal" },
              { value: "TINGGI", label: "Tinggi" },
            ]}
          />
          <Field label="Tanggal Jatuh Tempo" name="dueDate" type="date" defaultValue={dueDate} />
          <div className="sm:col-span-2">
            <label htmlFor="internalNotes" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Catatan Internal</label>
            <textarea id="internalNotes" name="internalNotes" rows={4} maxLength={5000} defaultValue={pekerjaan?.internalNotes ?? ""} className={inputClass} />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Maksimal 5.000 karakter. Hanya untuk pengguna internal kantor; jangan masukkan data yang tidak diperlukan.</p>
          </div>
        </div>
      </div>

      <PihakEditor clients={clients} initialValues={parties} />

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
