import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getSubscriptionState } from "@/lib/subscription";
import { Field, TextArea, SubmitButton } from "@/components/form";
import { updateOfficeAction } from "./actions";

export default async function PengaturanPage() {
  const session = await auth();
  const isNotaris = session!.user.role === "NOTARIS";

  const [office, subscription] = await Promise.all([
    prisma.office.findUnique({ where: { id: session!.user.officeId } }),
    getSubscriptionState(session!.user.officeId),
  ]);

  return (
    <div className="max-w-3xl space-y-6">
      <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Pengaturan</h2>

      <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-slate-800">
        <h3 className="mb-4 font-semibold text-slate-800 dark:text-slate-100">Status Langganan</h3>
        <div className="flex flex-wrap items-center gap-4">
          <span
            className={`rounded-full px-3 py-1 text-sm font-semibold ${
              subscription.active ? "bg-indigo-100 text-indigo-700" : "bg-red-100 text-red-700"
            }`}
          >
            {subscription.active ? "Aktif" : "Tidak Aktif"}
          </span>
          <span className="text-sm text-slate-600 dark:text-slate-300">
            Paket: <strong>{subscription.plan}</strong>
          </span>
          {subscription.periodEnd && (
            <span className="text-sm text-slate-600 dark:text-slate-300">
              Berlaku sampai: <strong>{subscription.periodEnd.toLocaleDateString("id-ID")}</strong>
            </span>
          )}
        </div>
      </div>

      {isNotaris ? (
        <form action={updateOfficeAction} className="rounded-xl bg-white p-6 shadow-sm dark:bg-slate-800">
          <h3 className="mb-4 font-semibold text-slate-800 dark:text-slate-100">Data Kantor</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Nama Kantor" name="name" defaultValue={office?.name} required />
            </div>
            <Field label="Nama Notaris" name="notarisName" defaultValue={office?.notarisName} required />
            <Field label="Gelar" name="notarisTitle" defaultValue={office?.notarisTitle} placeholder="S.H., M.Kn." />
            <Field label="Telepon Kantor" name="phone" defaultValue={office?.phone} />
            <Field label="Wilayah Kerja" name="wilayahKerja" defaultValue={office?.wilayahKerja} placeholder="Provinsi Jawa Tengah" />
            <Field label="Nomor SK Pengangkatan" name="skNotarisNo" defaultValue={office?.skNotarisNo} />
            <Field label="Tanggal SK" name="skNotarisDate" defaultValue={office?.skNotarisDate} placeholder="29 Desember 2022" />
          </div>
          <div className="mt-4">
            <TextArea label="Alamat Kantor" name="address" defaultValue={office?.address} />
          </div>
          <div className="mt-6">
            <SubmitButton>Simpan Pengaturan</SubmitButton>
          </div>
        </form>
      ) : (
        <div className="rounded-xl bg-white p-6 text-sm text-slate-500 shadow-sm dark:bg-slate-800 dark:text-slate-400">
          Pengaturan kantor hanya bisa diubah oleh Notaris (Admin).
        </div>
      )}
    </div>
  );
}
