"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Breadcrumb } from "@/components/Breadcrumb";
import { Avatar } from "@/components/Avatar";
import { KlienForm } from "../KlienForm";
import Link from "next/link";
import { Briefcase } from "lucide-react";

type ClientData = {
  id: string;
  name: string;
  type?: string | null;
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

export function KlienDetailClient({
  client,
  updateAction,
  deleteAction,
  history,
}: {
  client: ClientData;
  updateAction: (formData: FormData) => Promise<void>;
  deleteAction: () => Promise<void>;
  history: Array<{
    id: string;
    judul: string;
    jenis: string;
    status: string;
    peran: string;
    tanggalAkta: string | null;
  }>;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [showDelete, setShowDelete] = useState(false);

  async function handleUpdate(formData: FormData) {
    await updateAction(formData);
    toast({ title: "Klien berhasil diperbarui" });
  }

  async function handleDelete() {
    await deleteAction();
    toast({ title: "Klien berhasil dihapus", variant: "info" });
    router.push("/dashboard/klien");
  }

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Klien", href: "/dashboard/klien" },
          { label: client.name },
        ]}
      />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-4">
          <Avatar name={client.name} size="lg" />
          <div>
            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">{client.name}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">{client.nik ?? "NIK belum diisi"}</p>
          </div>
        </div>
        <button
          onClick={() => setShowDelete(true)}
          className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
        >
          Hapus Klien
        </button>
      </div>

      <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-slate-800">
        <div className="mb-4 flex items-center gap-2">
          <Briefcase className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          <h3 className="font-semibold text-slate-800 dark:text-slate-100">
            Riwayat Pekerjaan
          </h3>
        </div>
        {history.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Klien ini belum terhubung ke pekerjaan apa pun.
          </p>
        ) : (
          <div className="space-y-2">
            {history.map((item) => (
              <Link
                key={`${item.id}-${item.peran}`}
                href={`/dashboard/pekerjaan/${item.id}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 px-4 py-3 hover:bg-indigo-50 dark:border-slate-700 dark:hover:bg-slate-700/60"
              >
                <div>
                  <p className="font-medium text-slate-800 dark:text-slate-100">{item.judul}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {item.jenis} · Peran: {item.peran}
                  </p>
                </div>
                <div className="text-right text-xs text-slate-500 dark:text-slate-400">
                  <p>{item.status.replaceAll("_", " ")}</p>
                  <p>{item.tanggalAkta ? new Date(item.tanggalAkta).toLocaleDateString("id-ID") : "Belum bernomor"}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
      <KlienForm action={handleUpdate} client={client} submitLabel="Simpan Perubahan" />
      <ConfirmDialog
        open={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={handleDelete}
        title="Hapus klien ini?"
        description={`Data "${client.name}" akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.`}
      />
    </div>
  );
}
