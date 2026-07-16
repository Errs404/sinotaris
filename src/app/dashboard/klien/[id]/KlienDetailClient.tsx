"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Breadcrumb } from "@/components/Breadcrumb";
import { Avatar } from "@/components/Avatar";
import { KlienForm } from "../KlienForm";

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
}: {
  client: ClientData;
  updateAction: (formData: FormData) => Promise<void>;
  deleteAction: () => Promise<void>;
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
            <h2 className="text-2xl font-bold text-slate-800">{client.name}</h2>
            <p className="text-sm text-slate-500">{client.nik ?? "NIK belum diisi"}</p>
          </div>
        </div>
        <button
          onClick={() => setShowDelete(true)}
          className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
        >
          Hapus Klien
        </button>
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
